"""Marketplace Flask server — accounts, cart, orders, admin packing dashboard."""

import os
import random
import re
import secrets
import smtplib
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from email.mime.text import MIMEText
from functools import wraps
from pathlib import Path
from urllib.parse import urlencode

import requests

from flask import (Flask, request, session, redirect, url_for,
                   render_template, jsonify, send_from_directory)

from store import Store
from inventory_carry import carry_over

ROOT = Path(__file__).resolve().parent
SITE_ROOT = ROOT.parent

app = Flask(__name__, template_folder=str(ROOT / "templates"), static_folder=str(ROOT / "static"))

store = Store()

existing_key = store.get_setting("flask_secret_key")
if not existing_key:
    existing_key = secrets.token_hex(32)
    store.set_setting("flask_secret_key", existing_key)
app.secret_key = existing_key

PAYPAL_API_BASES = {
    "sandbox": "https://api-m.sandbox.paypal.com",
    "live": "https://api-m.paypal.com",
}
_paypal_token_lock = threading.Lock()
_paypal_token_cache = {
    "access_token": "",
    "expires_at": 0.0,
    "config_key": ("", "", ""),
}


class PayPalAPIError(Exception):
    def __init__(self, message, issue="", status_code=0, debug_id=""):
        super().__init__(message)
        self.issue = issue
        self.status_code = status_code
        self.debug_id = debug_id


def _paypal_config():
    environment = (
        os.environ.get("PAYPAL_ENVIRONMENT")
        or store.get_setting("paypal_env", "sandbox")
    ).strip().lower()
    if environment not in PAYPAL_API_BASES:
        environment = "sandbox"
    currency = os.environ.get("PAYPAL_CURRENCY", "USD").strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        currency = "USD"
    return {
        "client_id": (
            os.environ.get("PAYPAL_CLIENT_ID")
            or store.get_setting("paypal_client_id", "")
        ).strip(),
        "client_secret": (
            os.environ.get("PAYPAL_CLIENT_SECRET")
            or store.get_setting("paypal_secret", "")
        ).strip(),
        "environment": environment,
        "currency": currency,
        "api_base": PAYPAL_API_BASES[environment],
    }


def _paypal_sdk_url(config):
    if not config["client_id"]:
        return ""
    params = {
        "client-id": config["client_id"],
        "currency": config["currency"],
        "intent": "capture",
        "commit": "true",
        "components": "buttons",
    }
    return "https://www.paypal.com/sdk/js?" + urlencode(params)


def _paypal_access_token(config):
    now = time.time()
    config_key = (
        config["api_base"],
        config["client_id"],
        config["client_secret"],
    )
    if (_paypal_token_cache["access_token"]
            and _paypal_token_cache["config_key"] == config_key
            and _paypal_token_cache["expires_at"] > now + 60):
        return _paypal_token_cache["access_token"]

    with _paypal_token_lock:
        now = time.time()
        if (_paypal_token_cache["access_token"]
                and _paypal_token_cache["config_key"] == config_key
                and _paypal_token_cache["expires_at"] > now + 60):
            return _paypal_token_cache["access_token"]
        try:
            response = requests.post(
                config["api_base"] + "/v1/oauth2/token",
                auth=(config["client_id"], config["client_secret"]),
                data={"grant_type": "client_credentials"},
                headers={"Accept": "application/json"},
                timeout=15,
            )
        except requests.RequestException as exc:
            raise PayPalAPIError("Could not connect to PayPal.") from exc
        if not response.ok:
            raise PayPalAPIError(
                "PayPal credentials were rejected.",
                status_code=response.status_code,
            )
        payload = response.json()
        access_token = payload.get("access_token", "")
        if not access_token:
            raise PayPalAPIError("PayPal did not return an access token.")
        _paypal_token_cache["access_token"] = access_token
        _paypal_token_cache["expires_at"] = now + int(payload.get("expires_in", 300))
        _paypal_token_cache["config_key"] = config_key
        return access_token


def _paypal_api_request(method, path, config, payload=None, request_id=""):
    headers = {
        "Authorization": "Bearer " + _paypal_access_token(config),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if request_id:
        headers["PayPal-Request-Id"] = request_id
    try:
        response = requests.request(
            method,
            config["api_base"] + path,
            headers=headers,
            json=payload,
            timeout=20,
        )
    except requests.RequestException as exc:
        raise PayPalAPIError("Could not connect to PayPal.") from exc
    if response.ok:
        return response.json()

    try:
        error = response.json()
    except ValueError:
        error = {}
    details = error.get("details") or []
    first_detail = details[0] if details else {}
    issue = first_detail.get("issue") or error.get("name") or ""
    message = first_detail.get("description") or error.get("message") or "PayPal rejected the request."
    raise PayPalAPIError(
        message,
        issue=issue,
        status_code=response.status_code,
        debug_id=error.get("debug_id", ""),
    )


def _smtp_config():
    return {
        "host": store.get_setting("smtp_host", "smtp.gmail.com"),
        "port": int(store.get_setting("smtp_port", "587")),
        "user": store.get_setting("smtp_user", ""),
        "password": store.get_setting("smtp_pass", ""),
        "from": store.get_setting("smtp_from", "") or store.get_setting("smtp_user", ""),
    }


def _send_reset_email(to_email, reset_url):
    cfg = _smtp_config()
    body = (
        "You requested a password reset for your Bluegrass Memorabilia account.\n\n"
        f"Click here to reset your password:\n{reset_url}\n\n"
        "This link expires in 30 minutes. If you didn't request this, ignore this email."
    )
    msg = MIMEText(body)
    msg["Subject"] = "Password Reset — Bluegrass Memorabilia"
    msg["From"] = cfg["from"]
    msg["To"] = to_email
    with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
        server.starttls()
        server.login(cfg["user"], cfg["password"])
        server.send_message(msg)


def _send_order_confirmation_email(to_email, order_id, items, total, notes,
                                   payment_method="cash", payment_status="unpaid"):
    cfg = _smtp_config()
    lines = [f"Thanks for your order! Here's a copy for your records.\n", f"Order #{order_id}\n"]
    for item in items:
        foil = " (foil)" if item.get("foil") else ""
        lines.append(
            f"  {item['quantity']}x {item['name']}{foil} — ${item['price'] * item['quantity']:.2f}"
        )
    lines.append(f"\nTotal: ${total:.2f}")
    if notes:
        lines.append(f"\nNotes: {notes}")
    if payment_method == "paypal" and payment_status == "paid":
        lines.append(
            "\n\nPayment received via PayPal — thank you! "
            "I'll be at Tabletop Tavern every Thursday to hand off your cards. "
            "Reach out to me on Discord (McBoop) if you'd like to make other arrangements."
        )
    else:
        lines.append(
            "\n\nCash on pickup — I'll be at Tabletop Tavern every Thursday to deliver orders. "
            "Reach out to me on Discord (McBoop) if you'd like to make other arrangements."
        )
    body = "\n".join(lines)
    msg = MIMEText(body)
    msg["Subject"] = f"Order Confirmation #{order_id} — Bluegrass Memorabilia"
    msg["From"] = cfg["from"]
    msg["To"] = to_email
    with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
        server.starttls()
        server.login(cfg["user"], cfg["password"])
        server.send_message(msg)

_inventory_lock = threading.Lock()

# Below this many live listings a shrinking publish is ordinary (a shop just starting out),
# so the guard only applies once there is a real inventory to lose.
SHRINK_FLOOR = 10


def _load_inventory():
    return store.list_inventory()


def _save_inventory(items):
    store.replace_inventory(items)


def _inventory_by_id():
    return {item["id"]: item for item in _load_inventory()}


def login_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if "account_id" not in session:
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return wrapped


def admin_required(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if "account_id" not in session:
            return redirect(url_for("login_page"))
        account = store.get_account(session["account_id"])
        if not account or not account["is_admin"]:
            return "Unauthorized", 403
        return f(*args, **kwargs)
    return wrapped


def publish_key_required(f):
    """Header-based auth for the local publish.py script -- it has no browser session."""
    @wraps(f)
    def wrapped(*args, **kwargs):
        expected = os.environ.get("PUBLISH_API_KEY")
        if not expected:
            return jsonify(error="Publishing is not configured on this server."), 503
        if not secrets.compare_digest(request.headers.get("X-Publish-Key", ""), expected):
            return jsonify(error="Unauthorized"), 403
        return f(*args, **kwargs)
    return wrapped


def _external_base_url():
    """Public-facing base URL, honoring the reverse proxy in front of us.

    When served behind Cloudflare Pages, the proxy sets X-Forwarded-Host/Proto so
    generated links (e.g. password-reset URLs) use the public domain rather than
    this origin's own hostname.
    """
    proto = request.headers.get("X-Forwarded-Proto", request.scheme)
    host = request.headers.get("X-Forwarded-Host", request.host)
    return f"{proto}://{host}"


def _quarter(price):
    return round(price * 4) / 4 if price else 0


BASIC_LAND_NAMES = {"Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"}
BASIC_LAND_FLAT_PRICE = 0.50


def _price_for(item):
    if item.get("name") in BASIC_LAND_NAMES and not item.get("foil"):
        return BASIC_LAND_FLAT_PRICE
    return _quarter(item.get("sell_price") or item.get("market_price") or 0)


def _money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _valid_paypal_id(value):
    return (
        isinstance(value, str)
        and 1 <= len(value) <= 64
        and value.replace("-", "").isalnum()
    )


def _amount_string(items):
    total = sum(
        (_money(item["price"]) * item["quantity"] for item in items),
        Decimal("0.00"),
    )
    return f"{total:.2f}"


def _checkout_items(cart, inventory=None):
    inventory = inventory if inventory is not None else _load_inventory()
    inv_by_id = {item["id"]: item for item in inventory}
    items = []
    out_of_stock = []
    for item_id_str, raw_qty in cart.items():
        try:
            item_id = int(item_id_str)
            quantity = int(raw_qty)
        except (TypeError, ValueError):
            out_of_stock.append(f"Invalid cart item #{item_id_str}")
            continue
        item = inv_by_id.get(item_id)
        if not item:
            out_of_stock.append(f"Item #{item_id_str} is no longer available")
            continue
        available = int(item.get("quantity", 0))
        if quantity <= 0 or quantity > available:
            out_of_stock.append(f"{item['name']} (have {available}, want {quantity})")
            continue
        items.append({
            "id": item["id"],
            "name": item["name"],
            "set_code": item.get("set_code", ""),
            "collector_number": item.get("collector_number", ""),
            "foil": item.get("foil", False),
            "quantity": quantity,
            "price": _price_for(item),
        })
    return items, out_of_stock


def _checkout_customer(data):
    if "account_id" in session:
        return session["account_id"], "", "", ""
    guest_name = (data.get("guest_name") or "").strip()
    guest_email = (data.get("guest_email") or "").strip().lower()
    guest_phone = (data.get("guest_phone") or "").strip()
    if not guest_name or "@" not in guest_email:
        return None, guest_name, guest_email, guest_phone
    account_id = store.get_or_create_guest_account()["id"]
    return account_id, guest_name, guest_email, guest_phone


def _paypal_purchase_unit(items, amount, currency):
    paypal_items = []
    for item in items:
        description_parts = []
        if item.get("set_code"):
            description_parts.append(item["set_code"].upper())
        if item.get("collector_number"):
            description_parts.append("#" + item["collector_number"])
        if item.get("foil"):
            description_parts.append("Foil")
        paypal_item = {
            "name": item["name"][:127],
            "quantity": str(item["quantity"]),
            "unit_amount": {
                "currency_code": currency,
                "value": f"{_money(item['price']):.2f}",
            },
            "sku": str(item["id"]),
        }
        if description_parts:
            paypal_item["description"] = " / ".join(description_parts)[:127]
        paypal_items.append(paypal_item)
    return {
        "description": "Bluegrass Memorabilia order",
        "amount": {
            "currency_code": currency,
            "value": amount,
            "breakdown": {
                "item_total": {
                    "currency_code": currency,
                    "value": amount,
                },
            },
        },
        "items": paypal_items,
    }


def _completed_paypal_capture(payload):
    if payload.get("status") != "COMPLETED":
        raise PayPalAPIError("PayPal has not completed this payment.")
    captures = []
    for purchase_unit in payload.get("purchase_units") or []:
        captures.extend(
            ((purchase_unit.get("payments") or {}).get("captures") or [])
        )
    completed = [capture for capture in captures if capture.get("status") == "COMPLETED"]
    if len(completed) != 1:
        raise PayPalAPIError("PayPal returned an unexpected capture result.")
    capture = completed[0]
    amount = capture.get("amount") or {}
    return {
        "id": capture.get("id", ""),
        "amount": amount.get("value", ""),
        "currency": amount.get("currency_code", ""),
        "paid_at": capture.get("create_time", ""),
    }


def _send_order_email(account_id, guest_email, order_id, items, notes,
                      payment_method):
    confirm_email = guest_email
    if not confirm_email:
        account = store.get_account(account_id)
        confirm_email = account["email"] if account else ""
    cfg = _smtp_config()
    if not confirm_email or not cfg["user"] or not cfg["password"]:
        return
    try:
        _send_order_confirmation_email(
            confirm_email,
            order_id,
            items,
            float(Decimal(_amount_string(items))),
            notes,
            payment_method,
            "paid" if payment_method == "paypal" else "unpaid",
        )
    except Exception:
        app.logger.exception("Failed to send confirmation for order %s", order_id)


# -- main site ----------------------------------------------------------------

@app.route("/")
def home_page():
    host = request.host.split(":")[0]
    if host.startswith("shop."):
        return redirect("/marketplace/")
    return send_from_directory(str(SITE_ROOT), "index.html")


@app.route("/<path:filename>")
def site_static(filename):
    if os.path.isfile(SITE_ROOT / filename):
        return send_from_directory(str(SITE_ROOT), filename)
    return "Not found", 404


# -- marketplace pages --------------------------------------------------------

@app.route("/marketplace/")
def shop_page():
    return send_from_directory(str(ROOT), "index.html")


@app.route("/marketplace/inventory.json")
def inventory_json():
    return jsonify(store.list_inventory())


@app.route("/marketplace/lands.json")
def lands_json():
    return send_from_directory(str(ROOT), "lands.json")


@app.route("/marketplace/login")
def login_page():
    if "account_id" in session:
        return redirect(url_for("shop_page"))
    return render_template("login.html")


@app.route("/marketplace/forgot-password")
def forgot_password_page():
    return render_template("forgot_password.html")


@app.route("/marketplace/reset-password/<token>")
def reset_password_page(token):
    row = store.validate_reset_token(token)
    if not row:
        return render_template("reset_password.html", valid=False, token="")
    return render_template("reset_password.html", valid=True, token=token)


@app.route("/marketplace/cart")
def cart_page():
    cart = session.get("cart", {})
    inv = _inventory_by_id()
    items = []
    for item_id_str, qty in cart.items():
        item = inv.get(int(item_id_str))
        if item:
            price = _price_for(item)
            items.append({**item, "cart_qty": qty, "price": price})
    total = sum(i["price"] * i["cart_qty"] for i in items)
    account = store.get_account(session["account_id"]) if "account_id" in session else None
    paypal_config = _paypal_config()
    paypal_enabled = bool(
        paypal_config["client_id"] and paypal_config["client_secret"]
    )
    return render_template(
        "cart.html",
        items=items,
        total=total,
        account=account,
        paypal_enabled=paypal_enabled,
        paypal_sdk_url=_paypal_sdk_url(paypal_config) if paypal_enabled else "",
    )


@app.route("/marketplace/orders")
@login_required
def orders_page():
    orders = store.get_orders_for_account(session["account_id"])
    account = store.get_account(session["account_id"])
    return render_template("orders.html", orders=orders, account=account)


@app.route("/marketplace/admin")
@admin_required
def admin_page():
    status_filter = request.args.get("status", "")
    orders = store.get_all_orders()
    if status_filter:
        orders = [o for o in orders if o["order"]["status"] == status_filter]
    account = store.get_account(session["account_id"])
    return render_template("admin.html", orders=orders, account=account,
                           current_status=status_filter)


# -- auth API ----------------------------------------------------------------

@app.route("/marketplace/api/signup", methods=["POST"])
def api_signup():
    data = request.get_json()
    email = (data.get("email") or "").strip().lower()
    name = (data.get("name") or "").strip()
    password = data.get("password") or ""
    if not email or not name or len(password) < 4:
        return jsonify(error="Name, email, and password (4+ chars) required."), 400
    account = store.create_account(email, name, password)
    if not account:
        return jsonify(error="An account with that email already exists."), 409
    session["account_id"] = account["id"]
    return jsonify(ok=True, name=account["name"])


@app.route("/marketplace/api/login", methods=["POST"])
def api_login():
    data = request.get_json()
    account = store.authenticate(data.get("email", ""), data.get("password", ""))
    if not account:
        return jsonify(error="Invalid email or password."), 401
    session["account_id"] = account["id"]
    return jsonify(ok=True, name=account["name"], is_admin=bool(account["is_admin"]))


@app.route("/marketplace/api/forgot-password", methods=["POST"])
def api_forgot_password():
    data = request.get_json()
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify(error="Email is required."), 400
    token = store.create_reset_token(email)
    cfg = _smtp_config()
    if token and cfg["user"] and cfg["password"]:
        reset_url = _external_base_url() + f"/marketplace/reset-password/{token}"
        try:
            _send_reset_email(email, reset_url)
        except Exception:
            return jsonify(error="Failed to send email. Check SMTP settings."), 500
    return jsonify(ok=True, message="If that email exists, a reset link has been sent.")


@app.route("/marketplace/api/reset-password", methods=["POST"])
def api_reset_password():
    data = request.get_json()
    token = data.get("token", "")
    password = data.get("password", "")
    if len(password) < 4:
        return jsonify(error="Password must be at least 4 characters."), 400
    if store.reset_password(token, password):
        return jsonify(ok=True)
    return jsonify(error="Invalid or expired reset link."), 400


@app.route("/marketplace/api/logout", methods=["POST"])
def api_logout():
    session.pop("account_id", None)
    return jsonify(ok=True)


@app.route("/marketplace/api/me")
def api_me():
    cart_count = sum(session.get("cart", {}).values())
    if "account_id" not in session:
        return jsonify(logged_in=False, cart_count=cart_count)
    account = store.get_account(session["account_id"])
    if not account:
        session.pop("account_id", None)
        return jsonify(logged_in=False, cart_count=cart_count)
    return jsonify(logged_in=True, name=account["name"],
                   email=account["email"], is_admin=bool(account["is_admin"]),
                   cart_count=cart_count)


# -- cart API -----------------------------------------------------------------

@app.route("/marketplace/api/cart", methods=["GET"])
def api_cart_get():
    return jsonify(cart=session.get("cart", {}))


@app.route("/marketplace/api/cart/add", methods=["POST"])
def api_cart_add():
    data = request.get_json()
    try:
        item_id = int(data.get("id"))
        qty = int(data.get("quantity", 1))
    except (TypeError, ValueError):
        return jsonify(error="Invalid item or quantity."), 400
    if qty < 1:
        return jsonify(error="Quantity must be at least 1."), 400
    inv = _inventory_by_id()
    item = inv.get(item_id)
    if not item:
        return jsonify(error="Item not found."), 404
    item_id = str(item_id)
    cart = session.get("cart", {})
    new_qty = cart.get(item_id, 0) + qty
    available = item.get("quantity", 0)
    if new_qty > available:
        return jsonify(error=f"Only {available} in stock."), 400
    cart[item_id] = new_qty
    session["cart"] = cart
    return jsonify(ok=True, cart_count=sum(cart.values()))


@app.route("/marketplace/api/cart/update", methods=["POST"])
def api_cart_update():
    data = request.get_json()
    try:
        item_id = str(int(data.get("id")))
        qty = int(data.get("quantity", 0))
    except (TypeError, ValueError):
        return jsonify(error="Invalid item or quantity."), 400
    cart = session.get("cart", {})
    if qty <= 0:
        cart.pop(item_id, None)
    else:
        cart[item_id] = qty
    session["cart"] = cart
    return jsonify(ok=True, cart_count=sum(cart.values()))


@app.route("/marketplace/api/cart/clear", methods=["POST"])
def api_cart_clear():
    session["cart"] = {}
    return jsonify(ok=True)


# -- order API ----------------------------------------------------------------

def _validate_and_price_cart(cart):
    """Resolve a session cart into priced line items against current inventory."""
    inv_by_id = _inventory_by_id()
    items = []
    out_of_stock = []
    for item_id_str, qty in cart.items():
        item = inv_by_id.get(int(item_id_str))
        if not item:
            out_of_stock.append(f"Item #{item_id_str} is no longer available")
            continue
        available = item.get("quantity", 0)
        if qty <= 0 or qty > available:
            out_of_stock.append(f"{item['name']} (have {available}, want {qty})")
            continue
        price = _price_for(item)
        items.append({
            "id": item["id"], "name": item["name"],
            "set_code": item.get("set_code", ""),
            "collector_number": item.get("collector_number", ""),
            "foil": item.get("foil", False),
            "quantity": qty, "price": price,
        })
    return items, out_of_stock


def _resolve_customer(data):
    """Return (account_id, guest_name, guest_email, guest_phone, error)."""
    if "account_id" in session:
        return session["account_id"], "", "", "", None
    guest_name = (data.get("guest_name") or "").strip()
    guest_email = (data.get("guest_email") or "").strip().lower()
    guest_phone = (data.get("guest_phone") or "").strip()
    if not guest_name or "@" not in guest_email:
        return None, "", "", "", "Name and a valid email are required for guest checkout."
    account_id = store.get_or_create_guest_account()["id"]
    return account_id, guest_name, guest_email, guest_phone, None


def _place_order(items, account_id, guest_name, guest_email, guest_phone,
                 notes, payment_method, payment_status, paypal_order_id,
                 enforce_stock=True):
    """Persist an order and adjust inventory. Returns {"order_id": ...} or {"error": ...}."""
    with _inventory_lock:
        inventory = _load_inventory()
        inv_by_id = {item["id"]: item for item in inventory}
        short = []
        for line in items:
            it = inv_by_id.get(line["id"])
            available = it.get("quantity", 0) if it else 0
            if line["quantity"] > available:
                short.append(f"{line['name']} (have {available}, want {line['quantity']})")
        if short and enforce_stock:
            return {"error": "Insufficient stock: " + "; ".join(short)}

        order_id = store.create_order(account_id, items, notes, guest_name,
                                      guest_email, guest_phone, payment_method,
                                      payment_status, paypal_order_id)
        # Payment was already captured, so record even if stock slipped; flag for admin.
        if short:
            store.update_admin_notes(order_id, "STOCK SHORT at capture: " + "; ".join(short))
        for line in items:
            it = inv_by_id.get(line["id"])
            if it:
                it["quantity"] = max(0, it["quantity"] - line["quantity"])
        inventory = [item for item in inventory if item.get("quantity", 0) > 0]
        _save_inventory(inventory)

    confirm_email = guest_email
    if not confirm_email:
        account = store.get_account(account_id)
        confirm_email = account["email"] if account else ""
    cfg = _smtp_config()
    if confirm_email and cfg["user"] and cfg["password"]:
        total = sum(item["price"] * item["quantity"] for item in items)
        try:
            _send_order_confirmation_email(confirm_email, order_id, items, total, notes,
                                           payment_method, payment_status)
        except Exception:
            pass

    return {"order_id": order_id}


@app.route("/marketplace/api/orders", methods=["POST"])
def api_order_submit():
    cart = session.get("cart", {})
    if not cart:
        return jsonify(error="Cart is empty."), 400
    data = request.get_json() or {}
    notes = (data.get("notes") or "").strip()

    account_id, guest_name, guest_email, guest_phone, err = _resolve_customer(data)
    if err:
        return jsonify(error=err), 400

    items, out_of_stock = _validate_and_price_cart(cart)
    if out_of_stock:
        return jsonify(error="Insufficient stock: " + "; ".join(out_of_stock)), 400
    if not items:
        return jsonify(error="No valid items in cart."), 400

    result = _place_order(items, account_id, guest_name, guest_email, guest_phone,
                          notes, "cash", "unpaid", "", enforce_stock=True)
    if "error" in result:
        return jsonify(error=result["error"]), 400

    session["cart"] = {}
    is_guest = "account_id" not in session
    return jsonify(ok=True, order_id=result["order_id"], is_guest=is_guest)

# -- PayPal API ---------------------------------------------------------------

@app.route("/marketplace/api/paypal/config")
def api_paypal_config():
    cfg = _paypal_config()
    return jsonify(
        enabled=bool(cfg["client_id"] and cfg["client_secret"]),
        client_id=cfg["client_id"],
        env=cfg["environment"],
    )


@app.route("/marketplace/api/paypal/orders", methods=["POST"])
def api_paypal_order_create():
    config = _paypal_config()
    if not config["client_id"] or not config["client_secret"]:
        return jsonify(error="PayPal checkout is not configured."), 503

    cart = session.get("cart", {})
    if not cart:
        return jsonify(error="Cart is empty."), 400
    data = request.get_json() or {}
    notes = (data.get("notes") or "").strip()
    account_id, guest_name, guest_email, guest_phone = _checkout_customer(data)
    if account_id is None:
        return jsonify(error="Name and a valid email are required for guest checkout."), 400

    with _inventory_lock:
        items, out_of_stock = _checkout_items(cart)
    if out_of_stock:
        return jsonify(error="Insufficient stock: " + "; ".join(out_of_stock)), 409
    if not items:
        return jsonify(error="No valid items in cart."), 400

    amount = _amount_string(items)
    if Decimal(amount) <= 0:
        return jsonify(error="Cart total must be greater than zero for PayPal."), 400
    request_id = "shop-create-" + secrets.token_urlsafe(24)
    paypal_payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            _paypal_purchase_unit(items, amount, config["currency"])
        ],
        "application_context": {
            "brand_name": "Bluegrass Memorabilia",
            "shipping_preference": "NO_SHIPPING",
            "user_action": "PAY_NOW",
        },
    }
    try:
        paypal_order = _paypal_api_request(
            "POST",
            "/v2/checkout/orders",
            config,
            payload=paypal_payload,
            request_id=request_id,
        )
    except PayPalAPIError as exc:
        app.logger.warning(
            "PayPal create failed: issue=%s debug_id=%s", exc.issue, exc.debug_id
        )
        return jsonify(error="PayPal could not start checkout. Please try again."), 502

    paypal_order_id = paypal_order.get("id", "")
    if not _valid_paypal_id(paypal_order_id):
        app.logger.error("PayPal create response did not contain an order ID.")
        return jsonify(error="PayPal returned an invalid checkout response."), 502
    store.create_paypal_checkout(
        paypal_order_id,
        account_id,
        cart,
        amount,
        config["currency"],
        notes,
        guest_name,
        guest_email,
        guest_phone,
    )
    checkout_ids = session.get("paypal_checkout_ids", [])
    session["paypal_checkout_ids"] = (
        [value for value in checkout_ids if value != paypal_order_id]
        + [paypal_order_id]
    )[-5:]
    return jsonify(id=paypal_order_id), 201


@app.route("/marketplace/api/paypal/orders/<paypal_order_id>/capture", methods=["POST"])
def api_paypal_order_capture(paypal_order_id):
    if not _valid_paypal_id(paypal_order_id):
        return jsonify(error="Invalid PayPal order ID."), 400
    if paypal_order_id not in session.get("paypal_checkout_ids", []):
        return jsonify(error="This PayPal checkout does not belong to this session."), 403

    existing = store.get_order_by_paypal_order_id(paypal_order_id)
    if existing:
        order = existing["order"]
        return jsonify(
            ok=True,
            order_id=order["id"],
            is_guest=bool(order["guest_email"]),
            capture_id=order["paypal_capture_id"],
        )

    checkout = store.get_paypal_checkout(paypal_order_id)
    if not checkout:
        return jsonify(error="PayPal checkout was not found."), 404
    config = _paypal_config()
    if not config["client_id"] or not config["client_secret"]:
        return jsonify(error="PayPal checkout is not configured."), 503

    is_guest = bool(checkout["guest_email"])
    with _inventory_lock:
        inventory = _load_inventory()
        inv_by_id = {item["id"]: item for item in inventory}
        items, out_of_stock = _checkout_items(checkout["cart"], inventory)
        if out_of_stock:
            return jsonify(
                error="An item sold out before payment was completed. "
                      "Your PayPal payment was not captured."
            ), 409
        expected_amount = _amount_string(items)
        if (expected_amount != checkout["expected_amount"]
                or config["currency"] != checkout["currency"]):
            app.logger.error(
                "Checkout total changed for PayPal order %s: expected %s %s, got %s %s",
                paypal_order_id,
                checkout["expected_amount"],
                checkout["currency"],
                expected_amount,
                config["currency"],
            )
            return jsonify(error="The cart total changed. Please restart checkout."), 409

        try:
            capture_payload = _paypal_api_request(
                "POST",
                f"/v2/checkout/orders/{paypal_order_id}/capture",
                config,
                payload={},
                request_id="shop-capture-" + paypal_order_id,
            )
        except PayPalAPIError as capture_error:
            if capture_error.issue == "INSTRUMENT_DECLINED":
                return jsonify(
                    error="PayPal declined that payment method.",
                    code="INSTRUMENT_DECLINED",
                ), 422
            try:
                capture_payload = _paypal_api_request(
                    "GET",
                    f"/v2/checkout/orders/{paypal_order_id}",
                    config,
                )
                if capture_payload.get("status") != "COMPLETED":
                    raise capture_error
            except PayPalAPIError:
                app.logger.warning(
                    "PayPal capture failed: issue=%s debug_id=%s",
                    capture_error.issue,
                    capture_error.debug_id,
                )
                return jsonify(
                    error="PayPal could not complete checkout. Please try again."
                ), 502

        try:
            capture = _completed_paypal_capture(capture_payload)
        except PayPalAPIError as exc:
            app.logger.error(
                "Invalid PayPal capture for order %s: %s", paypal_order_id, exc
            )
            return jsonify(error="PayPal has not completed this payment."), 502
        if (capture["amount"] != checkout["expected_amount"]
                or capture["currency"] != checkout["currency"]
                or not capture["id"]):
            app.logger.critical(
                "PayPal capture mismatch for %s: %s %s",
                paypal_order_id,
                capture["amount"],
                capture["currency"],
            )
            return jsonify(error="PayPal returned an unexpected payment total."), 502

        paid_at = capture["paid_at"] or datetime.now(timezone.utc).isoformat(
            timespec="seconds"
        )
        order_id = store.create_order(
            checkout["account_id"],
            items,
            checkout["notes"],
            checkout["guest_name"],
            checkout["guest_email"],
            checkout["guest_phone"],
            payment_method="paypal",
            payment_status="paid",
            paypal_order_id=paypal_order_id,
            paypal_capture_id=capture["id"],
            paid_at=paid_at,
        )
        for order_item in items:
            inv_by_id[order_item["id"]]["quantity"] -= order_item["quantity"]
        inventory = [item for item in inventory if item.get("quantity", 0) > 0]
        _save_inventory(inventory)
        store.complete_paypal_checkout(paypal_order_id, order_id)

    current_cart = session.get("cart", {})
    for item_id, purchased_qty in checkout["cart"].items():
        remaining = int(current_cart.get(str(item_id), 0)) - int(purchased_qty)
        if remaining > 0:
            current_cart[str(item_id)] = remaining
        else:
            current_cart.pop(str(item_id), None)
    session["cart"] = current_cart
    _send_order_email(
        checkout["account_id"],
        checkout["guest_email"],
        order_id,
        items,
        checkout["notes"],
        payment_method="paypal",
    )
    return jsonify(
        ok=True,
        order_id=order_id,
        is_guest=is_guest,
        capture_id=capture["id"],
    )


# -- admin API ----------------------------------------------------------------

@app.route("/marketplace/api/admin/orders/<int:order_id>/status", methods=["POST"])
@admin_required
def api_admin_update_status(order_id):
    data = request.get_json()
    new_status = data.get("status", "")
    order_data = store.get_order(order_id)
    if not order_data:
        return jsonify(error="Order not found."), 404
    old_status = order_data["order"]["status"]
    if old_status == new_status:
        return jsonify(ok=True)
    if new_status == "cancelled" and old_status in ("shipped", "completed"):
        return jsonify(error="Cannot cancel an order that has been shipped or completed."), 400
    order = order_data["order"]
    if (old_status == "cancelled"
            and new_status != "cancelled"
            and order["payment_method"] == "paypal"
            and order["payment_status"] in ("refunded", "refund_pending")):
        return jsonify(error="A refunded PayPal order cannot be reopened."), 400
    if (new_status == "cancelled"
            and order["payment_method"] == "paypal"
            and order["payment_status"] == "paid"):
        config = _paypal_config()
        if not config["client_id"] or not config["client_secret"]:
            return jsonify(
                error="PayPal must be configured before this order can be refunded."
            ), 503
        try:
            refund = _paypal_api_request(
                "POST",
                f"/v2/payments/captures/{order['paypal_capture_id']}/refund",
                config,
                payload={},
                request_id=f"shop-refund-{order_id}-{order['paypal_capture_id']}",
            )
        except PayPalAPIError as exc:
            app.logger.warning(
                "PayPal refund failed for order %s: issue=%s debug_id=%s",
                order_id,
                exc.issue,
                exc.debug_id,
            )
            return jsonify(
                error="PayPal could not refund this order. It was not cancelled."
            ), 502
        refund_status = refund.get("status", "")
        refund_id = refund.get("id", "")
        if refund_status not in ("COMPLETED", "PENDING") or not refund_id:
            return jsonify(
                error="PayPal did not confirm the refund. The order was not cancelled."
            ), 502
        payment_status = (
            "refunded" if refund_status == "COMPLETED" else "refund_pending"
        )
        refunded_at = refund.get("create_time") or datetime.now(
            timezone.utc
        ).isoformat(timespec="seconds")
        store.update_paypal_refund(
            order_id, refund_id, payment_status, refunded_at
        )
    if not store.update_order_status(order_id, new_status):
        return jsonify(error="Invalid status."), 400
    with _inventory_lock:
        if new_status == "cancelled" and old_status != "cancelled":
            _restore_order_stock(order_data["items"])
        elif old_status == "cancelled" and new_status != "cancelled":
            _deduct_order_stock(order_data["items"])
    return jsonify(ok=True)


def _restore_order_stock(line_items):
    inventory = _load_inventory()
    inv_by_id = {item["id"]: item for item in inventory}
    for line in line_items:
        item_id = line["inventory_id"]
        qty = line["quantity"]
        if item_id in inv_by_id:
            inv_by_id[item_id]["quantity"] += qty
        else:
            inventory.append({
                "id": item_id, "name": line["name"],
                "set_code": line["set_code"],
                "collector_number": line["collector_number"],
                "foil": bool(line["foil"]),
                "condition": "Near Mint", "quantity": qty,
                "category": "MTG Card",
                "sell_price": None,
                "market_price": line["unit_price"],
                "image_url": None, "notes": None,
            })
    _save_inventory(inventory)


def _deduct_order_stock(line_items):
    inventory = _load_inventory()
    inv_by_id = {item["id"]: item for item in inventory}
    for line in line_items:
        item_id = line["inventory_id"]
        qty = line["quantity"]
        if item_id in inv_by_id:
            inv_by_id[item_id]["quantity"] = max(0, inv_by_id[item_id]["quantity"] - qty)
    inventory = [item for item in inventory if item.get("quantity", 0) > 0]
    _save_inventory(inventory)


@app.route("/marketplace/api/admin/orders/<int:order_id>/notes", methods=["POST"])
@admin_required
def api_admin_update_notes(order_id):
    data = request.get_json()
    store.update_admin_notes(order_id, data.get("notes", ""))
    return jsonify(ok=True)


@app.route("/marketplace/api/admin/orders/<int:order_id>/payment", methods=["POST"])
@admin_required
def api_admin_update_payment(order_id):
    data = request.get_json()
    order_data = store.get_order(order_id)
    if not order_data:
        return jsonify(error="Order not found."), 404
    if order_data["order"]["payment_method"] == "paypal":
        return jsonify(
            error="PayPal payment status is managed automatically."
        ), 400
    if not store.set_payment_status(order_id, data.get("payment_status", "")):
        return jsonify(error="Invalid payment status."), 400
    return jsonify(ok=True)


@app.route("/marketplace/api/admin/settings", methods=["GET"])
@admin_required
def api_admin_settings_get():
    return jsonify(
        smtp_host=store.get_setting("smtp_host", "smtp.gmail.com"),
        smtp_port=store.get_setting("smtp_port", "587"),
        smtp_user=store.get_setting("smtp_user", ""),
        smtp_pass=store.get_setting("smtp_pass", ""),
        paypal_client_id=store.get_setting("paypal_client_id", ""),
        paypal_secret=store.get_setting("paypal_secret", ""),
        paypal_env=store.get_setting("paypal_env", "sandbox"),
    )


@app.route("/marketplace/api/admin/settings", methods=["POST"])
@admin_required
def api_admin_settings_save():
    data = request.get_json()
    for key in ("smtp_host", "smtp_port", "smtp_user", "smtp_pass",
                "paypal_client_id", "paypal_secret", "paypal_env"):
        if key in data:
            store.set_setting(key, (data[key] or "").strip())
    return jsonify(ok=True)


@app.route("/marketplace/api/admin/settings/test-email", methods=["POST"])
@admin_required
def api_admin_test_email():
    account = store.get_account(session["account_id"])
    cfg = _smtp_config()
    if not cfg["user"] or not cfg["password"]:
        return jsonify(error="SMTP credentials not configured."), 400
    try:
        msg = MIMEText("This is a test email from Bluegrass Memorabilia. SMTP is working!")
        msg["Subject"] = "Test Email — Bluegrass Memorabilia"
        msg["From"] = cfg["from"]
        msg["To"] = account["email"]
        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.starttls()
            server.login(cfg["user"], cfg["password"])
            server.send_message(msg)
        return jsonify(ok=True, message=f"Test email sent to {account['email']}")
    except Exception as e:
        return jsonify(error=str(e)), 500


# -- admin quick-add API ------------------------------------------------------

_SCRYFALL_HEADERS = {"User-Agent": "BluegrassMemorabiliaMarketplace/1.0"}


def _scryfall_get(url, params=None):
    r = requests.get(url, params=params, headers=_SCRYFALL_HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def _scryfall_find_card(name, collector_number, foil=False):
    fuzzy = _scryfall_get("https://api.scryfall.com/cards/named", {"fuzzy": name})
    time.sleep(0.08)

    exact_name = fuzzy["name"]

    search_url = "https://api.scryfall.com/cards/search"
    query = f'!"{exact_name}"'
    printings = []
    page_url = search_url
    params = {"q": query, "unique": "prints", "order": "released"}

    while page_url:
        data = _scryfall_get(page_url, params)
        printings.extend(data.get("data", []))
        if data.get("has_more"):
            page_url = data["next_page"]
            params = None
        else:
            break
        time.sleep(0.08)

    for p in printings:
        if p.get("collector_number") == collector_number:
            prices = p.get("prices", {})
            if foil:
                price = float(prices.get("usd_foil") or prices.get("usd") or 0)
            else:
                price = float(prices.get("usd") or prices.get("usd_foil") or 0)
            image = (p.get("image_uris") or {}).get("normal")
            if not image and p.get("card_faces"):
                image = (p["card_faces"][0].get("image_uris") or {}).get("normal")
            is_flat_basic = p["name"] in BASIC_LAND_NAMES and not foil
            return {
                "name": p["name"],
                "set_code": p["set"],
                "collector_number": p["collector_number"],
                "foil": foil,
                "market_price": price,
                "sell_price": BASIC_LAND_FLAT_PRICE if is_flat_basic else _quarter(price),
                "image_url": image,
            }

    available = [f"{p['set'].upper()}#{p['collector_number']}" for p in printings[:8]]
    return {"error": f"No #{collector_number} printing. Try: {', '.join(available)}"}


@app.route("/marketplace/api/admin/cards/autocomplete")
@admin_required
def api_admin_cards_autocomplete():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify(names=[])
    # Build a name query where each typed word must be a prefix of a word in the
    # card name. This lets fragments like "det sph" match "Detention Sphere",
    # which Scryfall's /cards/autocomplete (contiguous prefix only) cannot do.
    words = [w for w in q.split() if w]
    query = " ".join('name:/\\b{}/'.format(re.escape(w)) for w in words)
    try:
        data = _scryfall_get(
            "https://api.scryfall.com/cards/search",
            {"q": query, "order": "name", "unique": "cards"},
        )
    except Exception:
        return jsonify(names=[])
    seen = set()
    names = []
    for card in data.get("data", []):
        name = card.get("name")
        if name and name not in seen:
            seen.add(name)
            names.append(name)
        if len(names) >= 20:
            break
    return jsonify(names=names)


@app.route("/marketplace/api/admin/inventory/export-batch")
@admin_required
def api_admin_inventory_export_batch():
    try:
        min_price = float(request.args.get("min", 0.5))
        max_price = float(request.args.get("max", 1.0))
        count = int(request.args.get("count", 10))
    except ValueError:
        return jsonify(error="min, max, and count must be numbers."), 400

    candidates = store.inventory_in_price_range(min_price, max_price)

    # Cards already undercutting their own market value are the ones most worth moving
    # to TCGplayer instead, where they'd fetch closer to market -- fill from those first.
    underpriced = [c for c in candidates if c.get("sell_price") is not None and c["sell_price"] < c["market_price"]]
    rest = [c for c in candidates if c not in underpriced]
    random.shuffle(underpriced)
    random.shuffle(rest)
    picked = (underpriced + rest)[:count]

    return jsonify(results=picked, pool_size=len(candidates), underpriced_pool_size=len(underpriced))


@app.route("/marketplace/api/admin/cards/search")
@admin_required
def api_admin_cards_search():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify(results=[])
    return jsonify(results=store.search_inventory(q))


@app.route("/marketplace/api/admin/cards/printings")
@admin_required
def api_admin_cards_printings():
    name = (request.args.get("name") or "").strip()
    if not name:
        return jsonify(error="Name is required."), 400

    try:
        printings = []
        page_url = "https://api.scryfall.com/cards/search"
        params = {"q": f'!"{name}"', "unique": "prints", "order": "released"}
        while page_url:
            data = _scryfall_get(page_url, params)
            printings.extend(data.get("data", []))
            if data.get("has_more"):
                page_url = data["next_page"]
                params = None
            else:
                break
            time.sleep(0.08)
    except Exception as e:
        return jsonify(error=str(e)), 500

    results = []
    for p in printings:
        prices = p.get("prices", {})
        finishes = p.get("finishes", [])
        image = (p.get("image_uris") or {}).get("normal")
        if not image and p.get("card_faces"):
            image = (p["card_faces"][0].get("image_uris") or {}).get("normal")
        results.append({
            "name": p["name"],
            "set_code": p["set"],
            "set_name": p.get("set_name", ""),
            "collector_number": p["collector_number"],
            "image_url": image,
            "nonfoil": "nonfoil" in finishes,
            "foil": "foil" in finishes,
            "usd": float(prices.get("usd") or 0),
            "usd_foil": float(prices.get("usd_foil") or 0),
        })
    return jsonify(results=results)


@app.route("/marketplace/api/admin/quick-add/lookup", methods=["POST"])
@admin_required
def api_admin_quick_add_lookup():
    data = request.get_json()
    lines = [l.strip() for l in (data.get("lines") or "").splitlines() if l.strip()]
    if not lines:
        return jsonify(error="No input."), 400

    results = []
    errors = []

    for line in lines:
        tokens = line.split()
        qty = 1
        foil = False

        if tokens[0].isdigit():
            qty = int(tokens.pop(0))
        if tokens and tokens[0].lower() == "foil":
            foil = True
            tokens.pop(0)
        if len(tokens) < 2:
            errors.append({"line": line, "error": "Need at least card name + collector number"})
            continue

        collector_num = tokens.pop()
        name = " ".join(tokens)

        try:
            result = _scryfall_find_card(name, collector_num, foil)
        except Exception as e:
            errors.append({"line": line, "error": str(e)})
            continue

        if "error" in result:
            errors.append({"line": line, "error": result["error"]})
        else:
            result["qty"] = qty
            result["line_total"] = result["sell_price"] * qty
            results.append(result)

    return jsonify(results=results, errors=errors)


@app.route("/marketplace/api/admin/quick-add/add", methods=["POST"])
@admin_required
def api_admin_quick_add_add():
    data = request.get_json()
    cards = data.get("cards", [])
    if not cards:
        return jsonify(error="No cards to add."), 400

    with _inventory_lock:
        inventory = _load_inventory()
        max_id = max((item["id"] for item in inventory), default=0)

        for card in cards:
            existing = None
            for item in inventory:
                if (item["set_code"] == card["set_code"]
                        and item["collector_number"] == card["collector_number"]
                        and item.get("foil", False) == card.get("foil", False)):
                    existing = item
                    break

            if existing:
                existing["quantity"] += card.get("qty", 1)
                if card.get("sell_price"):
                    existing["sell_price"] = card["sell_price"]
                if card.get("market_price"):
                    existing["market_price"] = card["market_price"]
                if card.get("image_url"):
                    existing["image_url"] = card["image_url"]
            else:
                max_id += 1
                inventory.append({
                    "id": max_id,
                    "name": card["name"],
                    "set_code": card["set_code"],
                    "collector_number": card["collector_number"],
                    "foil": card.get("foil", False),
                    "condition": "Near Mint",
                    "quantity": card.get("qty", 1),
                    "category": "MTG Card",
                    "sell_price": card.get("sell_price"),
                    "market_price": card.get("market_price", 0),
                    "image_url": card.get("image_url"),
                    "notes": None,
                })

        inventory.sort(key=lambda x: (x["name"].lower(), x["set_code"]))
        _save_inventory(inventory)

    total_cards = sum(c.get("qty", 1) for c in cards)
    return jsonify(ok=True, added=total_cards, inventory_count=len(inventory))


@app.route("/marketplace/api/admin/quick-add/undo", methods=["POST"])
@admin_required
def api_admin_quick_add_undo():
    data = request.get_json()
    set_code = data.get("set_code")
    collector_number = data.get("collector_number")
    foil = bool(data.get("foil", False))
    qty = data.get("qty", 1)
    if not set_code or not collector_number:
        return jsonify(error="set_code and collector_number are required."), 400

    with _inventory_lock:
        inventory = _load_inventory()
        existing = None
        for item in inventory:
            if (item["set_code"] == set_code
                    and item["collector_number"] == collector_number
                    and item.get("foil", False) == foil):
                existing = item
                break

        if not existing:
            return jsonify(error="Matching inventory item not found."), 404

        existing["quantity"] -= qty
        removed = existing["quantity"] <= 0
        if removed:
            inventory = [item for item in inventory if item["id"] != existing["id"]]

        _save_inventory(inventory)

    return jsonify(ok=True, removed=removed, inventory_count=len(inventory))


@app.route("/marketplace/api/admin/inventory/bulk-publish", methods=["POST"])
@publish_key_required
def api_admin_inventory_bulk_publish():
    """Replace the POS-tracked slice of inventory, carrying over hand-added listings.

    Called by the local publish.py script after a POS scan -- see inventory_carry.py
    for what "carry over" means.
    """
    data = request.get_json()
    items = data.get("items", [])
    pos_printings = data.get("pos_printings", [])
    pos_ids = data.get("pos_ids", [])
    replace = bool(data.get("replace", False))
    force = bool(data.get("force", False))

    with _inventory_lock:
        existing = _load_inventory()
        carried = [] if replace else carry_over(existing, pos_printings, pos_ids)
        listings = sorted(items + carried,
                          key=lambda item: (str(item.get("name") or "").lower(), str(item.get("set_code") or "")))

        # A partly scanned POS is already safe: cards it does not mention are carried over.
        # What guts the shop is a POS that still tracks everything but reports it out of
        # stock, or a --replace run. Refuse those, and make saying "yes, really" deliberate.
        if not force and len(existing) >= SHRINK_FLOOR and len(listings) * 2 < len(existing):
            return jsonify(
                ok=False,
                error=(f"This publish would cut the shop from {len(existing)} listings to "
                       f"{len(listings)}. If the POS database is complete, publish again with "
                       f"--force."),
            ), 409

        store.snapshot_inventory()
        _save_inventory(listings)

    return jsonify(ok=True, published=len(items), carried=len(carried), total=len(listings))


@app.route("/marketplace/api/admin/inventory/restore", methods=["POST"])
@publish_key_required
def api_admin_inventory_restore():
    """Put back the inventory as it was before the last publish or restore."""
    with _inventory_lock:
        items, taken_at = store.get_inventory_snapshot()
        if items is None:
            return jsonify(ok=False, error="There is no inventory snapshot to restore."), 404
        replaced = store.snapshot_inventory()   # so a restore can itself be undone
        _save_inventory(items)

    return jsonify(ok=True, restored=len(items), replaced=replaced, taken_at=taken_at)


@app.route("/marketplace/api/admin/cards/delete", methods=["POST"])
@admin_required
def api_admin_cards_delete():
    data = request.get_json()
    card_id = data.get("id")
    if not card_id:
        return jsonify(error="Card id is required."), 400
    with _inventory_lock:
        inventory = _load_inventory()
        inventory = [item for item in inventory if item["id"] != int(card_id)]
        _save_inventory(inventory)
    return jsonify(ok=True, inventory_count=len(inventory))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Marketplace server running at http://localhost:{port}")
    from waitress import serve
    serve(app, host="0.0.0.0", port=port)
