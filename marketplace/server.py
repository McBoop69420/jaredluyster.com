"""Marketplace Flask server — accounts, cart, orders, admin packing dashboard."""

import json
import os
import secrets
import smtplib
import threading
import time
from email.mime.text import MIMEText
from pathlib import Path
from functools import wraps

import requests

from flask import (Flask, request, session, redirect, url_for,
                   render_template, jsonify, send_from_directory)

from store import Store

ROOT = Path(__file__).resolve().parent
INVENTORY_PATH = ROOT / "inventory.json"

app = Flask(__name__, template_folder=str(ROOT / "templates"), static_folder=str(ROOT / "static"))

store = Store()

existing_key = store.get_setting("flask_secret_key")
if not existing_key:
    existing_key = secrets.token_hex(32)
    store.set_setting("flask_secret_key", existing_key)
app.secret_key = existing_key

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


_inventory_lock = threading.Lock()


def _load_inventory():
    if INVENTORY_PATH.exists():
        return json.loads(INVENTORY_PATH.read_text(encoding="utf-8"))
    return []


def _save_inventory(items):
    INVENTORY_PATH.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")


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


def _quarter(price):
    return round(price * 4) / 4 if price else 0


# -- pages --------------------------------------------------------------------

@app.route("/")
def shop_page():
    return send_from_directory(str(ROOT), "index.html")


@app.route("/inventory.json")
def inventory_json():
    return send_from_directory(str(ROOT), "inventory.json")


@app.route("/lands.json")
def lands_json():
    return send_from_directory(str(ROOT), "lands.json")


@app.route("/login")
def login_page():
    if "account_id" in session:
        return redirect(url_for("shop_page"))
    return render_template("login.html")


@app.route("/forgot-password")
def forgot_password_page():
    return render_template("forgot_password.html")


@app.route("/reset-password/<token>")
def reset_password_page(token):
    row = store.validate_reset_token(token)
    if not row:
        return render_template("reset_password.html", valid=False, token="")
    return render_template("reset_password.html", valid=True, token=token)


@app.route("/cart")
@login_required
def cart_page():
    cart = session.get("cart", {})
    inv = _inventory_by_id()
    items = []
    for item_id_str, qty in cart.items():
        item = inv.get(int(item_id_str))
        if item:
            price = _quarter(item.get("sell_price") or item.get("market_price") or 0)
            items.append({**item, "cart_qty": qty, "price": price})
    total = sum(i["price"] * i["cart_qty"] for i in items)
    account = store.get_account(session["account_id"])
    return render_template("cart.html", items=items, total=total, account=account)


@app.route("/orders")
@login_required
def orders_page():
    orders = store.get_orders_for_account(session["account_id"])
    account = store.get_account(session["account_id"])
    return render_template("orders.html", orders=orders, account=account)


@app.route("/admin")
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

@app.route("/api/signup", methods=["POST"])
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


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json()
    account = store.authenticate(data.get("email", ""), data.get("password", ""))
    if not account:
        return jsonify(error="Invalid email or password."), 401
    session["account_id"] = account["id"]
    return jsonify(ok=True, name=account["name"], is_admin=bool(account["is_admin"]))


@app.route("/api/forgot-password", methods=["POST"])
def api_forgot_password():
    data = request.get_json()
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify(error="Email is required."), 400
    token = store.create_reset_token(email)
    cfg = _smtp_config()
    if token and cfg["user"] and cfg["password"]:
        reset_url = request.host_url.rstrip("/") + f"/reset-password/{token}"
        try:
            _send_reset_email(email, reset_url)
        except Exception:
            return jsonify(error="Failed to send email. Check SMTP settings."), 500
    return jsonify(ok=True, message="If that email exists, a reset link has been sent.")


@app.route("/api/reset-password", methods=["POST"])
def api_reset_password():
    data = request.get_json()
    token = data.get("token", "")
    password = data.get("password", "")
    if len(password) < 4:
        return jsonify(error="Password must be at least 4 characters."), 400
    if store.reset_password(token, password):
        return jsonify(ok=True)
    return jsonify(error="Invalid or expired reset link."), 400


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify(ok=True)


@app.route("/api/me")
def api_me():
    if "account_id" not in session:
        return jsonify(logged_in=False)
    account = store.get_account(session["account_id"])
    if not account:
        session.clear()
        return jsonify(logged_in=False)
    return jsonify(logged_in=True, name=account["name"],
                   email=account["email"], is_admin=bool(account["is_admin"]),
                   cart_count=sum(session.get("cart", {}).values()))


# -- cart API -----------------------------------------------------------------

@app.route("/api/cart", methods=["GET"])
@login_required
def api_cart_get():
    return jsonify(cart=session.get("cart", {}))


@app.route("/api/cart/add", methods=["POST"])
@login_required
def api_cart_add():
    data = request.get_json()
    item_id = str(data.get("id"))
    qty = int(data.get("quantity", 1))
    inv = _inventory_by_id()
    item = inv.get(int(item_id))
    if not item:
        return jsonify(error="Item not found."), 404
    cart = session.get("cart", {})
    new_qty = cart.get(item_id, 0) + qty
    available = item.get("quantity", 0)
    if new_qty > available:
        return jsonify(error=f"Only {available} in stock."), 400
    cart[item_id] = new_qty
    session["cart"] = cart
    return jsonify(ok=True, cart_count=sum(cart.values()))


@app.route("/api/cart/update", methods=["POST"])
@login_required
def api_cart_update():
    data = request.get_json()
    item_id = str(data.get("id"))
    qty = int(data.get("quantity", 0))
    cart = session.get("cart", {})
    if qty <= 0:
        cart.pop(item_id, None)
    else:
        cart[item_id] = qty
    session["cart"] = cart
    return jsonify(ok=True, cart_count=sum(cart.values()))


@app.route("/api/cart/clear", methods=["POST"])
@login_required
def api_cart_clear():
    session["cart"] = {}
    return jsonify(ok=True)


# -- order API ----------------------------------------------------------------

@app.route("/api/orders", methods=["POST"])
@login_required
def api_order_submit():
    cart = session.get("cart", {})
    if not cart:
        return jsonify(error="Cart is empty."), 400
    notes = (request.get_json() or {}).get("notes", "")
    with _inventory_lock:
        inventory = _load_inventory()
        inv_by_id = {item["id"]: item for item in inventory}
        items = []
        out_of_stock = []
        for item_id_str, qty in cart.items():
            item = inv_by_id.get(int(item_id_str))
            if not item:
                out_of_stock.append(f"Item #{item_id_str} is no longer available")
                continue
            available = item.get("quantity", 0)
            if qty > available:
                out_of_stock.append(f"{item['name']} (have {available}, want {qty})")
                continue
            price = _quarter(item.get("sell_price") or item.get("market_price") or 0)
            items.append({
                "id": item["id"], "name": item["name"],
                "set_code": item.get("set_code", ""),
                "collector_number": item.get("collector_number", ""),
                "foil": item.get("foil", False),
                "quantity": qty, "price": price,
            })
        if out_of_stock:
            return jsonify(error="Insufficient stock: " + "; ".join(out_of_stock)), 400
        if not items:
            return jsonify(error="No valid items in cart."), 400
        order_id = store.create_order(session["account_id"], items, notes)
        for order_item in items:
            inv_by_id[order_item["id"]]["quantity"] -= order_item["quantity"]
        inventory = [item for item in inventory if item.get("quantity", 0) > 0]
        _save_inventory(inventory)
    session["cart"] = {}
    return jsonify(ok=True, order_id=order_id)


# -- admin API ----------------------------------------------------------------

@app.route("/api/admin/orders/<int:order_id>/status", methods=["POST"])
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


@app.route("/api/admin/orders/<int:order_id>/notes", methods=["POST"])
@admin_required
def api_admin_update_notes(order_id):
    data = request.get_json()
    store.update_admin_notes(order_id, data.get("notes", ""))
    return jsonify(ok=True)


@app.route("/api/admin/settings", methods=["GET"])
@admin_required
def api_admin_settings_get():
    return jsonify(
        smtp_host=store.get_setting("smtp_host", "smtp.gmail.com"),
        smtp_port=store.get_setting("smtp_port", "587"),
        smtp_user=store.get_setting("smtp_user", ""),
        smtp_pass=store.get_setting("smtp_pass", ""),
    )


@app.route("/api/admin/settings", methods=["POST"])
@admin_required
def api_admin_settings_save():
    data = request.get_json()
    for key in ("smtp_host", "smtp_port", "smtp_user", "smtp_pass"):
        if key in data:
            store.set_setting(key, data[key])
    return jsonify(ok=True)


@app.route("/api/admin/settings/test-email", methods=["POST"])
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
            return {
                "name": p["name"],
                "set_code": p["set"],
                "collector_number": p["collector_number"],
                "foil": foil,
                "market_price": price,
                "sell_price": _quarter(price),
                "image_url": image,
            }

    available = [f"{p['set'].upper()}#{p['collector_number']}" for p in printings[:8]]
    return {"error": f"No #{collector_number} printing. Try: {', '.join(available)}"}


@app.route("/api/admin/quick-add/lookup", methods=["POST"])
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


@app.route("/api/admin/quick-add/add", methods=["POST"])
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Marketplace server running at http://localhost:{port}")
    from waitress import serve
    serve(app, host="127.0.0.1", port=port)
