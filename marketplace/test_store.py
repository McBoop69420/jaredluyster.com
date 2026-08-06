"""Tests for the Store data layer: accounts, password resets, orders, settings."""

import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from store import ALL_ADMIN_EMAILS, GUEST_EMAIL, ORDER_STATUSES, Store, _TursoConnection


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.store = Store(Path(self.temp_dir.name) / "m.db")
        self.addCleanup(self.store.close)

    def test_create_account_lowercases_and_strips_email(self):
        account = self.store.create_account("  Bob@Example.com  ", "Bob", "password")
        self.assertEqual(account["email"], "bob@example.com")

    def test_duplicate_email_signup_returns_none(self):
        self.store.create_account("bob@example.com", "Bob", "password")
        again = self.store.create_account("BOB@example.com", "Bob Two", "password2")
        self.assertIsNone(again)

    def test_authenticate_is_case_insensitive_on_email(self):
        self.store.create_account("bob@example.com", "Bob", "password")
        account = self.store.authenticate("BOB@EXAMPLE.COM", "password")
        self.assertIsNotNone(account)

    def test_authenticate_rejects_wrong_password(self):
        self.store.create_account("bob@example.com", "Bob", "password")
        self.assertIsNone(self.store.authenticate("bob@example.com", "wrong"))

    def test_authenticate_rejects_unknown_email(self):
        self.assertIsNone(self.store.authenticate("nobody@example.com", "password"))

    def test_known_admin_email_is_auto_admin_on_creation(self):
        account = self.store.create_account(ALL_ADMIN_EMAILS[0], "Admin", "password")
        self.assertEqual(account["is_admin"], 1)

    def test_ordinary_signup_is_not_admin(self):
        account = self.store.create_account("bob@example.com", "Bob", "password")
        self.assertEqual(account["is_admin"], 0)

    def test_get_account_promotes_admin_email_retroactively(self):
        # Simulate an account that predates being added to the admin allowlist:
        # created as non-admin, but its email is (now) in ALL_ADMIN_EMAILS.
        self.store._conn.execute(
            "INSERT INTO accounts (email, name, password_hash, is_admin, created_at) "
            "VALUES (?, 'Legacy', 'hash', 0, ?)",
            (ALL_ADMIN_EMAILS[0], "2020-01-01T00:00:00+00:00"),
        )
        self.store._conn.commit()
        account = self.store.get_account_by_email(ALL_ADMIN_EMAILS[0])
        self.assertEqual(account["is_admin"], 0)
        promoted = self.store.get_account(account["id"])
        self.assertEqual(promoted["is_admin"], 1)

    def test_get_or_create_guest_account_is_idempotent(self):
        first = self.store.get_or_create_guest_account()
        second = self.store.get_or_create_guest_account()
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["email"], GUEST_EMAIL)

    def test_get_account_missing_id_returns_none(self):
        self.assertIsNone(self.store.get_account(999999))

    def test_get_account_by_email_missing_returns_none(self):
        self.assertIsNone(self.store.get_account_by_email("nobody@example.com"))


class PasswordResetTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.store = Store(Path(self.temp_dir.name) / "m.db")
        self.addCleanup(self.store.close)
        self.account = self.store.create_account("bob@example.com", "Bob", "password")

    def test_reset_token_for_unknown_email_is_none(self):
        self.assertIsNone(self.store.create_reset_token("nobody@example.com"))

    def test_reset_token_round_trip_changes_password(self):
        token = self.store.create_reset_token("bob@example.com")
        self.assertTrue(self.store.reset_password(token, "newpassword"))
        self.assertIsNotNone(self.store.authenticate("bob@example.com", "newpassword"))
        self.assertIsNone(self.store.authenticate("bob@example.com", "password"))

    def test_bogus_token_is_rejected(self):
        self.assertIsNone(self.store.validate_reset_token("not-a-real-token"))
        self.assertFalse(self.store.reset_password("not-a-real-token", "newpassword"))

    def test_token_cannot_be_reused_after_a_successful_reset(self):
        token = self.store.create_reset_token("bob@example.com")
        self.assertTrue(self.store.reset_password(token, "newpassword"))
        # Second use of the same token must fail even though it once was valid.
        self.assertFalse(self.store.reset_password(token, "anotherpassword"))
        self.assertIsNotNone(self.store.authenticate("bob@example.com", "newpassword"))

    def test_expired_token_is_rejected(self):
        token = self.store.create_reset_token("bob@example.com")
        stale = (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat(timespec="seconds")
        self.store._conn.execute(
            "UPDATE password_reset_tokens SET created_at = ? WHERE token = ?",
            (stale, token),
        )
        self.store._conn.commit()
        self.assertIsNone(self.store.validate_reset_token(token))
        self.assertFalse(self.store.reset_password(token, "newpassword"))

    def test_token_just_inside_expiry_window_is_still_valid(self):
        token = self.store.create_reset_token("bob@example.com")
        fresh = (datetime.now(timezone.utc) - timedelta(minutes=29)).isoformat(timespec="seconds")
        self.store._conn.execute(
            "UPDATE password_reset_tokens SET created_at = ? WHERE token = ?",
            (fresh, token),
        )
        self.store._conn.commit()
        self.assertIsNotNone(self.store.validate_reset_token(token))

    def test_reset_tokens_for_different_accounts_do_not_cross_wires(self):
        self.store.create_account("alice@example.com", "Alice", "alicepw")
        bob_token = self.store.create_reset_token("bob@example.com")
        self.assertTrue(self.store.reset_password(bob_token, "newbobpw"))
        self.assertIsNotNone(self.store.authenticate("alice@example.com", "alicepw"))
        self.assertIsNone(self.store.authenticate("alice@example.com", "newbobpw"))


class OrderTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.store = Store(Path(self.temp_dir.name) / "m.db")
        self.addCleanup(self.store.close)
        self.account = self.store.create_account("bob@example.com", "Bob", "password")

    def _items(self):
        return [
            {"id": 1, "name": "Opt", "set_code": "DOM", "collector_number": "60",
             "foil": False, "quantity": 2, "price": 0.25},
            {"id": 2, "name": "Sol Ring", "set_code": "C21", "collector_number": "263",
             "foil": True, "quantity": 1, "price": 2.00},
        ]

    def test_create_and_fetch_order_round_trips_line_items(self):
        order_id = self.store.create_order(self.account["id"], self._items(), notes="Thanks!")
        fetched = self.store.get_order(order_id)
        self.assertEqual(fetched["order"]["notes"], "Thanks!")
        self.assertEqual(fetched["order"]["status"], "pending")
        self.assertEqual(len(fetched["items"]), 2)
        self.assertEqual({i["name"] for i in fetched["items"]}, {"Opt", "Sol Ring"})

    def test_get_order_missing_id_returns_none(self):
        self.assertIsNone(self.store.get_order(999999))

    def test_get_order_by_paypal_order_id_round_trips(self):
        order_id = self.store.create_order(
            self.account["id"], self._items(), payment_method="paypal",
            payment_status="paid", paypal_order_id="PP-1", paypal_capture_id="CAP-1",
        )
        found = self.store.get_order_by_paypal_order_id("PP-1")
        self.assertEqual(found["order"]["id"], order_id)
        self.assertIsNone(self.store.get_order_by_paypal_order_id("PP-NONEXISTENT"))

    def test_two_orders_cannot_share_a_paypal_order_id(self):
        self.store.create_order(self.account["id"], self._items(), paypal_order_id="PP-DUP")
        with self.assertRaises(Exception):
            self.store.create_order(self.account["id"], self._items(), paypal_order_id="PP-DUP")

    def test_orders_for_account_are_scoped_and_newest_first(self):
        other = self.store.create_account("alice@example.com", "Alice", "pw")
        first = self.store.create_order(self.account["id"], self._items())
        self.store.create_order(other["id"], self._items())
        second = self.store.create_order(self.account["id"], self._items())
        orders = self.store.get_orders_for_account(self.account["id"])
        self.assertEqual([o["order"]["id"] for o in orders], [second, first])

    def test_get_all_orders_filters_by_status(self):
        pending = self.store.create_order(self.account["id"], self._items())
        shipped = self.store.create_order(self.account["id"], self._items())
        self.store.update_order_status(shipped, "shipped")
        only_shipped = self.store.get_all_orders(status="shipped")
        self.assertEqual([o["order"]["id"] for o in only_shipped], [shipped])
        self.assertNotIn(pending, [o["order"]["id"] for o in only_shipped])

    def test_get_all_orders_includes_account_details(self):
        order_id = self.store.create_order(self.account["id"], self._items())
        [entry] = [o for o in self.store.get_all_orders() if o["order"]["id"] == order_id]
        self.assertEqual(entry["account"]["email"], "bob@example.com")

    def test_update_order_status_rejects_unknown_status(self):
        order_id = self.store.create_order(self.account["id"], self._items())
        self.assertFalse(self.store.update_order_status(order_id, "teleported"))
        self.assertEqual(self.store.get_order(order_id)["order"]["status"], "pending")

    def test_all_declared_statuses_are_individually_settable(self):
        order_id = self.store.create_order(self.account["id"], self._items())
        for status in ORDER_STATUSES:
            self.assertTrue(self.store.update_order_status(order_id, status))
            self.assertEqual(self.store.get_order(order_id)["order"]["status"], status)

    def test_set_payment_status_rejects_anything_but_paid_or_unpaid(self):
        order_id = self.store.create_order(self.account["id"], self._items())
        self.assertFalse(self.store.set_payment_status(order_id, "refunded"))
        self.assertTrue(self.store.set_payment_status(order_id, "paid"))
        self.assertEqual(self.store.get_order(order_id)["order"]["payment_status"], "paid")

    def test_update_admin_notes_overwrites_not_appends(self):
        order_id = self.store.create_order(self.account["id"], self._items())
        self.store.update_admin_notes(order_id, "first note")
        self.store.update_admin_notes(order_id, "second note")
        self.assertEqual(self.store.get_order(order_id)["order"]["admin_notes"], "second note")

    def test_update_paypal_refund_stamps_all_three_fields(self):
        order_id = self.store.create_order(
            self.account["id"], self._items(), payment_method="paypal",
            payment_status="paid", paypal_order_id="PP-REFUND",
        )
        self.store.update_paypal_refund(order_id, "REFUND-1", "refunded", "2026-01-01T00:00:00+00:00")
        order = self.store.get_order(order_id)["order"]
        self.assertEqual(order["paypal_refund_id"], "REFUND-1")
        self.assertEqual(order["payment_status"], "refunded")
        self.assertEqual(order["refunded_at"], "2026-01-01T00:00:00+00:00")

    def test_order_with_no_line_items_is_still_creatable(self):
        order_id = self.store.create_order(self.account["id"], [])
        fetched = self.store.get_order(order_id)
        self.assertEqual(fetched["items"], [])


class PaypalCheckoutStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.store = Store(Path(self.temp_dir.name) / "m.db")
        self.addCleanup(self.store.close)
        self.account = self.store.create_account("bob@example.com", "Bob", "password")

    def test_paypal_checkout_round_trips_cart_json(self):
        cart = {"1": 2, "2": 1}
        self.store.create_paypal_checkout("PP-1", self.account["id"], cart, "2.50", "USD")
        checkout = self.store.get_paypal_checkout("PP-1")
        self.assertEqual(checkout["cart"], cart)
        self.assertEqual(checkout["status"], "created")

    def test_missing_paypal_checkout_returns_none(self):
        self.assertIsNone(self.store.get_paypal_checkout("PP-NONEXISTENT"))

    def test_complete_paypal_checkout_links_local_order(self):
        self.store.create_paypal_checkout("PP-1", self.account["id"], {"1": 1}, "1.00", "USD")
        self.store.complete_paypal_checkout("PP-1", 42)
        checkout = self.store.get_paypal_checkout("PP-1")
        self.assertEqual(checkout["status"], "completed")
        self.assertEqual(checkout["local_order_id"], 42)


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.store = Store(Path(self.temp_dir.name) / "m.db")
        self.addCleanup(self.store.close)

    def test_missing_setting_returns_default(self):
        self.assertEqual(self.store.get_setting("nope", "fallback"), "fallback")
        self.assertEqual(self.store.get_setting("nope"), "")

    def test_set_then_get_round_trips(self):
        self.store.set_setting("smtp_host", "smtp.example.com")
        self.assertEqual(self.store.get_setting("smtp_host"), "smtp.example.com")

    def test_set_setting_upserts_rather_than_duplicating(self):
        self.store.set_setting("k", "first")
        self.store.set_setting("k", "second")
        self.assertEqual(self.store.get_setting("k"), "second")
        rows = self.store._conn.execute("SELECT COUNT(*) AS n FROM settings WHERE key='k'").fetchone()
        self.assertEqual(rows["n"], 1)


class _FakeCursor:
    def __init__(self, value):
        self.description = [("value",)]
        self._value = value

    def fetchone(self):
        return (self._value,)

    def fetchall(self):
        return [(self._value,)]

    @property
    def lastrowid(self):
        return 1


class _FakeStreamConn:
    """Stands in for a real libsql connection whose Hrana stream has gone stale."""

    def __init__(self, name, fail_first_execute):
        self.name = name
        self.fail_first_execute = fail_first_execute
        self.calls = 0

    def execute(self, sql, params):
        self.calls += 1
        if self.fail_first_execute and self.calls == 1:
            raise ValueError(
                'Hrana: `api error: `status=404 Not Found, '
                'body={"error":"stream not found: 7112d115:4182b"}``'
            )
        return _FakeCursor(self.name)


class TursoReconnectTests(unittest.TestCase):
    def _connection_with(self, conns):
        """A _TursoConnection whose self._libsql.connect() yields `conns` in order."""
        conn = _TursoConnection.__new__(_TursoConnection)
        remaining = list(conns)
        fake_libsql = type("FakeLibsql", (), {"connect": staticmethod(lambda **kw: remaining.pop(0))})
        conn._libsql = fake_libsql
        conn._url = "libsql://example"
        conn._auth_token = "token"
        conn._connect()
        return conn

    def test_stale_stream_triggers_one_reconnect_and_retry(self):
        stale = _FakeStreamConn("stale", fail_first_execute=True)
        fresh = _FakeStreamConn("fresh", fail_first_execute=False)
        conn = self._connection_with([stale, fresh])

        cursor = conn.execute("SELECT 1", ())

        self.assertEqual(cursor.fetchone()["value"], "fresh")
        self.assertEqual(stale.calls, 1)
        self.assertEqual(fresh.calls, 1)

    def test_unrelated_value_error_is_not_treated_as_a_stale_stream(self):
        conn = self._connection_with([_FakeStreamConn("only", fail_first_execute=False)])
        conn._conn.execute = lambda sql, params: (_ for _ in ()).throw(ValueError("something else broke"))

        with self.assertRaises(ValueError):
            conn.execute("SELECT 1", ())

    def test_unique_constraint_still_maps_to_integrity_error(self):
        conn = self._connection_with([_FakeStreamConn("only", fail_first_execute=False)])
        conn._conn.execute = lambda sql, params: (_ for _ in ()).throw(ValueError("UNIQUE constraint failed: accounts.email"))

        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("SELECT 1", ())


if __name__ == "__main__":
    unittest.main()
