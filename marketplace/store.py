"""Accounts, carts, and orders database for the marketplace."""

import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = Path(__file__).resolve().parent / "marketplace.db"

ADMIN_EMAIL = "jared.luyster@gmail.com"
# Additional admin emails — accounts created with these addresses are auto-admin.
# Override at runtime via the HERMES_ADMIN_EMAILS env var (comma-separated).
HERMES_ADMIN_EMAILS = os.environ.get("HERMES_ADMIN_EMAILS", "hermes-agent@bluegrass-marketplace.local").split(",")
HERMES_ADMIN_EMAILS = [e.strip().lower() for e in HERMES_ADMIN_EMAILS if e.strip()]
ALL_ADMIN_EMAILS = [ADMIN_EMAIL.lower()] + HERMES_ADMIN_EMAILS
GUEST_EMAIL = "guest@bluegrass-marketplace.local"
ORDER_STATUSES = ("pending", "packing", "shipped", "completed", "cancelled")


class _Row(dict):
    """Dict that also tolerates the odd sqlite3.Row-style habits callers rely on."""


class _TursoCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def _wrap(self, row):
        if row is None:
            return None
        cols = [d[0] for d in self._cursor.description]
        return _Row(zip(cols, row))

    def fetchone(self):
        return self._wrap(self._cursor.fetchone())

    def fetchall(self):
        return [self._wrap(r) for r in self._cursor.fetchall()]

    @property
    def lastrowid(self):
        return self._cursor.lastrowid


class _TursoConnection:
    """Adapts the libsql client to the subset of the sqlite3 API store.py uses."""

    def __init__(self, url, auth_token):
        import libsql
        self._conn = libsql.connect(database=url, auth_token=auth_token)

    def execute(self, sql, params=()):
        try:
            return _TursoCursor(self._conn.execute(sql, params))
        except ValueError as e:
            if "UNIQUE constraint" in str(e):
                raise sqlite3.IntegrityError(str(e))
            raise

    def executescript(self, script):
        self._conn.executescript(script)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


class Store:
    def __init__(self, db_path=DB_PATH):
        turso_url = os.environ.get("TURSO_DATABASE_URL")
        if turso_url:
            self._conn = _TursoConnection(turso_url, os.environ.get("TURSO_AUTH_TOKEN"))
        else:
            self._conn = sqlite3.connect(db_path, check_same_thread=False)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        self._create_tables()

    def _create_tables(self):
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id),
                status TEXT NOT NULL DEFAULT 'pending',
                notes TEXT NOT NULL DEFAULT '',
                admin_notes TEXT NOT NULL DEFAULT '',
                guest_name TEXT NOT NULL DEFAULT '',
                guest_email TEXT NOT NULL DEFAULT '',
                guest_phone TEXT NOT NULL DEFAULT '',
                payment_method TEXT NOT NULL DEFAULT 'cash',
                payment_status TEXT NOT NULL DEFAULT 'unpaid',
                paypal_order_id TEXT NOT NULL DEFAULT '',
                paypal_capture_id TEXT NOT NULL DEFAULT '',
                paid_at TEXT NOT NULL DEFAULT '',
                paypal_refund_id TEXT NOT NULL DEFAULT '',
                refunded_at TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id),
                inventory_id INTEGER,
                name TEXT NOT NULL,
                set_code TEXT NOT NULL DEFAULT '',
                collector_number TEXT NOT NULL DEFAULT '',
                foil INTEGER NOT NULL DEFAULT 0,
                quantity INTEGER NOT NULL DEFAULT 1,
                unit_price REAL NOT NULL DEFAULT 0.0
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id),
                token TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS inventory (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                set_code TEXT NOT NULL DEFAULT '',
                collector_number TEXT NOT NULL DEFAULT '',
                foil INTEGER NOT NULL DEFAULT 0,
                condition TEXT NOT NULL DEFAULT 'Near Mint',
                quantity INTEGER NOT NULL DEFAULT 0,
                category TEXT NOT NULL DEFAULT 'MTG Card',
                sell_price REAL,
                market_price REAL,
                image_url TEXT,
                notes TEXT
            );

            CREATE TABLE IF NOT EXISTS paypal_checkouts (
                paypal_order_id TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id),
                cart_json TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                guest_name TEXT NOT NULL DEFAULT '',
                guest_email TEXT NOT NULL DEFAULT '',
                guest_phone TEXT NOT NULL DEFAULT '',
                expected_amount TEXT NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                status TEXT NOT NULL DEFAULT 'created',
                local_order_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
        """)
        self._conn.commit()
        self._migrate_orders_table()

    def _migrate_orders_table(self):
        columns = {
            "guest_name": "TEXT NOT NULL DEFAULT ''",
            "guest_email": "TEXT NOT NULL DEFAULT ''",
            "guest_phone": "TEXT NOT NULL DEFAULT ''",
            "payment_method": "TEXT NOT NULL DEFAULT 'cash'",
            "payment_status": "TEXT NOT NULL DEFAULT 'unpaid'",
            "paypal_order_id": "TEXT NOT NULL DEFAULT ''",
            "paypal_capture_id": "TEXT NOT NULL DEFAULT ''",
            "paid_at": "TEXT NOT NULL DEFAULT ''",
            "paypal_refund_id": "TEXT NOT NULL DEFAULT ''",
            "refunded_at": "TEXT NOT NULL DEFAULT ''",
        }
        for column, definition in columns.items():
            try:
                self._conn.execute(
                    f"ALTER TABLE orders ADD COLUMN {column} {definition}"
                )
                self._conn.commit()
            except Exception as e:
                if "duplicate column" not in str(e).lower():
                    raise
        self._conn.execute(
            """CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id
               ON orders(paypal_order_id) WHERE paypal_order_id <> ''"""
        )
        self._conn.commit()

    # -- accounts -------------------------------------------------------------

    def create_account(self, email, name, password):
        email = email.strip().lower()
        is_admin = 1 if email in ALL_ADMIN_EMAILS else 0
        try:
            self._conn.execute(
                "INSERT INTO accounts (email, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)",
                (email, name.strip(), generate_password_hash(password), is_admin, _now()),
            )
            self._conn.commit()
            return self.get_account_by_email(email)
        except sqlite3.IntegrityError:
            return None

    def authenticate(self, email, password):
        account = self.get_account_by_email(email.strip().lower())
        if account and check_password_hash(account["password_hash"], password):
            return account
        return None

    def get_account(self, account_id):
        row = self._conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        if row and row["email"].lower() in ALL_ADMIN_EMAILS and not row["is_admin"]:
            self._conn.execute("UPDATE accounts SET is_admin = 1 WHERE id = ?", (account_id,))
            self._conn.commit()
            row = self._conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        return row

    def get_account_by_email(self, email):
        return self._conn.execute("SELECT * FROM accounts WHERE email = ?", (email,)).fetchone()

    def get_or_create_guest_account(self):
        account = self.get_account_by_email(GUEST_EMAIL)
        if account:
            return account
        self._conn.execute(
            "INSERT INTO accounts (email, name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)",
            (GUEST_EMAIL, "Guest", generate_password_hash(secrets.token_urlsafe(32)), 0, _now()),
        )
        self._conn.commit()
        return self.get_account_by_email(GUEST_EMAIL)

    # -- password reset -------------------------------------------------------

    def create_reset_token(self, email):
        account = self.get_account_by_email(email.strip().lower())
        if not account:
            return None
        token = secrets.token_urlsafe(32)
        self._conn.execute(
            "INSERT INTO password_reset_tokens (account_id, token, created_at) VALUES (?, ?, ?)",
            (account["id"], token, _now()),
        )
        self._conn.commit()
        return token

    def validate_reset_token(self, token, max_age_minutes=30):
        row = self._conn.execute(
            "SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0", (token,)
        ).fetchone()
        if not row:
            return None
        created = datetime.fromisoformat(row["created_at"])
        if datetime.now(timezone.utc) - created > timedelta(minutes=max_age_minutes):
            return None
        return row

    def reset_password(self, token, new_password):
        row = self.validate_reset_token(token)
        if not row:
            return False
        self._conn.execute(
            "UPDATE accounts SET password_hash = ? WHERE id = ?",
            (generate_password_hash(new_password), row["account_id"]),
        )
        self._conn.execute(
            "UPDATE password_reset_tokens SET used = 1 WHERE id = ?", (row["id"],)
        )
        self._conn.commit()
        return True

    # -- orders ---------------------------------------------------------------

    def create_order(self, account_id, cart_items, notes="", guest_name="", guest_email="",
                     guest_phone="", payment_method="cash", payment_status="unpaid",
                     paypal_order_id="", paypal_capture_id="", paid_at=""):
        now = _now()
        cursor = self._conn.execute(
            """INSERT INTO orders (
                   account_id, status, notes, guest_name, guest_email, guest_phone,
                   payment_method, payment_status, paypal_order_id,
                   paypal_capture_id, paid_at, created_at
               ) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (account_id, notes, guest_name, guest_email, guest_phone,
             payment_method, payment_status, paypal_order_id,
             paypal_capture_id, paid_at, now),
        )
        order_id = cursor.lastrowid
        for item in cart_items:
            self._conn.execute(
                """INSERT INTO order_items (order_id, inventory_id, name, set_code,
                   collector_number, foil, quantity, unit_price)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (order_id, item["id"], item["name"], item.get("set_code", ""),
                 item.get("collector_number", ""), int(item.get("foil", False)),
                 item["quantity"], item["price"]),
            )
        self._conn.commit()
        return order_id

    def get_order(self, order_id):
        order = self._conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not order:
            return None
        items = self._conn.execute(
            "SELECT * FROM order_items WHERE order_id = ?", (order_id,)
        ).fetchall()
        return {"order": order, "items": items}

    def get_order_by_paypal_order_id(self, paypal_order_id):
        order = self._conn.execute(
            "SELECT * FROM orders WHERE paypal_order_id = ?", (paypal_order_id,)
        ).fetchone()
        if not order:
            return None
        items = self._conn.execute(
            "SELECT * FROM order_items WHERE order_id = ?", (order["id"],)
        ).fetchall()
        return {"order": order, "items": items}

    def create_paypal_checkout(self, paypal_order_id, account_id, cart, expected_amount,
                               currency, notes="", guest_name="", guest_email="",
                               guest_phone=""):
        now = _now()
        self._conn.execute(
            """INSERT INTO paypal_checkouts (
                   paypal_order_id, account_id, cart_json, notes, guest_name,
                   guest_email, guest_phone, expected_amount, currency,
                   status, created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?)""",
            (paypal_order_id, account_id, json.dumps(cart, sort_keys=True), notes,
             guest_name, guest_email, guest_phone, expected_amount, currency,
             now, now),
        )
        self._conn.commit()

    def get_paypal_checkout(self, paypal_order_id):
        row = self._conn.execute(
            "SELECT * FROM paypal_checkouts WHERE paypal_order_id = ?",
            (paypal_order_id,),
        ).fetchone()
        if not row:
            return None
        checkout = dict(row)
        checkout["cart"] = json.loads(checkout.pop("cart_json"))
        return checkout

    def complete_paypal_checkout(self, paypal_order_id, local_order_id):
        self._conn.execute(
            """UPDATE paypal_checkouts
               SET status = 'completed', local_order_id = ?, updated_at = ?
               WHERE paypal_order_id = ?""",
            (local_order_id, _now(), paypal_order_id),
        )
        self._conn.commit()

    def get_orders_for_account(self, account_id):
        rows = self._conn.execute(
            "SELECT * FROM orders WHERE account_id = ? ORDER BY created_at DESC, id DESC", (account_id,)
        ).fetchall()
        orders = []
        for row in rows:
            line_items = self._conn.execute(
                "SELECT * FROM order_items WHERE order_id = ?", (row["id"],)
            ).fetchall()
            orders.append({"order": row, "line_items": line_items})
        return orders

    def get_all_orders(self, status=None):
        if status:
            rows = self._conn.execute(
                "SELECT * FROM orders ORDER BY created_at DESC, id DESC"
            ).fetchall()
            rows = [r for r in rows if r["status"] == status]
        else:
            rows = self._conn.execute(
                "SELECT * FROM orders ORDER BY created_at DESC, id DESC"
            ).fetchall()
        orders = []
        for row in rows:
            line_items = self._conn.execute(
                "SELECT * FROM order_items WHERE order_id = ?", (row["id"],)
            ).fetchall()
            account = self.get_account(row["account_id"])
            orders.append({"order": row, "line_items": line_items, "account": account})
        return orders

    def update_order_status(self, order_id, status):
        if status not in ORDER_STATUSES:
            return False
        self._conn.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
        self._conn.commit()
        return True

    def update_paypal_refund(self, order_id, refund_id, payment_status, refunded_at):
        self._conn.execute(
            """UPDATE orders
               SET paypal_refund_id = ?, payment_status = ?, refunded_at = ?
               WHERE id = ?""",
            (refund_id, payment_status, refunded_at, order_id),
        )
        self._conn.commit()

    def update_admin_notes(self, order_id, notes):
        self._conn.execute("UPDATE orders SET admin_notes = ? WHERE id = ?", (notes, order_id))
        self._conn.commit()

    def set_payment_status(self, order_id, status):
        if status not in ("paid", "unpaid"):
            return False
        self._conn.execute(
            "UPDATE orders SET payment_status = ? WHERE id = ?", (status, order_id)
        )
        self._conn.commit()
        return True

    # -- inventory --------------------------------------------------------------

    def list_inventory(self):
        rows = self._conn.execute("SELECT * FROM inventory ORDER BY id").fetchall()
        items = []
        for row in rows:
            item = dict(row)
            item["foil"] = bool(item["foil"])
            items.append(item)
        return items

    def search_inventory(self, query, limit=20):
        rows = self._conn.execute(
            "SELECT * FROM inventory WHERE name LIKE ? COLLATE NOCASE"
            " ORDER BY name COLLATE NOCASE, set_code LIMIT ?",
            (f"%{query}%", limit),
        ).fetchall()
        items = []
        for row in rows:
            item = dict(row)
            item["foil"] = bool(item["foil"])
            items.append(item)
        return items

    def replace_inventory(self, items):
        """Full replace, mirroring the old write-the-whole-file semantics callers rely on."""
        self._conn.execute("DELETE FROM inventory")
        for item in items:
            self._conn.execute(
                """INSERT INTO inventory (
                       id, name, set_code, collector_number, foil, condition,
                       quantity, category, sell_price, market_price, image_url, notes
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (item["id"], item["name"], item.get("set_code", ""),
                 item.get("collector_number", ""), int(bool(item.get("foil", False))),
                 item.get("condition") or "Near Mint", item.get("quantity", 0),
                 item.get("category") or "MTG Card", item.get("sell_price"),
                 item.get("market_price", 0), item.get("image_url"), item.get("notes")),
            )
        self._conn.commit()

    # -- settings -------------------------------------------------------------

    def get_setting(self, key, default=""):
        row = self._conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default

    def set_setting(self, key, value):
        self._conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
            (key, value, value),
        )
        self._conn.commit()

    def close(self):
        self._conn.close()


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
