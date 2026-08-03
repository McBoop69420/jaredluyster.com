"""Route-level tests for the marketplace: auth, cart, cash checkout, admin, pricing.

test_paypal.py already covers the PayPal checkout/refund flow in depth, so this
file focuses on the cash-checkout path, cart mutation edge cases, auth/session
handling, admin authorization, and order status transitions.
"""

import json
import tempfile
import unittest
from pathlib import Path

import server
from store import Store


class MarketplaceTestCase(unittest.TestCase):
    """Common fixture: a fresh Store + inventory.json per test, like test_paypal.py."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        temp_path = Path(self.temp_dir.name)
        self.original_store = server.store
        self.original_inventory_path = server.INVENTORY_PATH
        server.store = Store(temp_path / "marketplace.db")
        server.INVENTORY_PATH = temp_path / "inventory.json"
        self.set_inventory(self.default_inventory())
        server.app.config.update(TESTING=True, SECRET_KEY="test-secret")
        self.client = server.app.test_client()
        self.addCleanup(self._teardown)

    def _teardown(self):
        server.store.close()
        server.store = self.original_store
        server.INVENTORY_PATH = self.original_inventory_path

    def default_inventory(self):
        return [
            {"id": 1, "name": "Test Card", "set_code": "tst", "collector_number": "1",
             "foil": False, "quantity": 2, "sell_price": 1.25, "market_price": 1.25,
             "image_url": None, "condition": "Near Mint", "category": "MTG Card", "notes": None},
            {"id": 2, "name": "Second Card", "set_code": "tst", "collector_number": "2",
             "foil": True, "quantity": 1, "sell_price": 5.00, "market_price": 5.00,
             "image_url": None, "condition": "Near Mint", "category": "MTG Card", "notes": None},
        ]

    def set_inventory(self, items):
        server.INVENTORY_PATH.write_text(json.dumps(items), encoding="utf-8")

    def inventory(self):
        return json.loads(server.INVENTORY_PATH.read_text(encoding="utf-8"))

    def set_cart(self, cart):
        with self.client.session_transaction() as s:
            s["cart"] = cart

    def get_cart(self):
        with self.client.session_transaction() as s:
            return s.get("cart", {})

    def login_as(self, email, name="Somebody", password="password"):
        account = server.store.create_account(email, name, password)
        with self.client.session_transaction() as s:
            s["account_id"] = account["id"]
        return account


class CartAddTests(MarketplaceTestCase):
    def test_add_unknown_item_is_404(self):
        response = self.client.post("/marketplace/api/cart/add", json={"id": 999, "quantity": 1})
        self.assertEqual(response.status_code, 404)

    def test_add_more_than_available_stock_is_rejected(self):
        response = self.client.post("/marketplace/api/cart/add", json={"id": 1, "quantity": 3})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.get_cart(), {})

    def test_add_accumulates_existing_cart_quantity(self):
        self.client.post("/marketplace/api/cart/add", json={"id": 1, "quantity": 1})
        response = self.client.post("/marketplace/api/cart/add", json={"id": 1, "quantity": 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["cart_count"], 2)

    def test_add_that_would_exceed_stock_after_accumulation_is_rejected(self):
        self.client.post("/marketplace/api/cart/add", json={"id": 1, "quantity": 2})
        response = self.client.post("/marketplace/api/cart/add", json={"id": 1, "quantity": 1})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.get_cart(), {"1": 2})

    def test_negative_quantity_is_rejected(self):
        response = self.client.post("/marketplace/api/cart/add", json={"id": 1, "quantity": -5})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.get_cart(), {})

    def test_zero_quantity_is_rejected(self):
        response = self.client.post("/marketplace/api/cart/add", json={"id": 1, "quantity": 0})
        self.assertEqual(response.status_code, 400)

    def test_non_numeric_quantity_is_a_clean_400_not_a_crash(self):
        response = self.client.post("/marketplace/api/cart/add", json={"id": 1, "quantity": "banana"})
        self.assertEqual(response.status_code, 400)

    def test_missing_id_is_a_clean_400_not_a_crash(self):
        response = self.client.post("/marketplace/api/cart/add", json={"quantity": 1})
        self.assertEqual(response.status_code, 400)

    def test_non_numeric_id_is_a_clean_400_not_a_crash(self):
        response = self.client.post("/marketplace/api/cart/add", json={"id": "not-an-id", "quantity": 1})
        self.assertEqual(response.status_code, 400)


class CartUpdateAndClearTests(MarketplaceTestCase):
    def test_update_to_zero_removes_item(self):
        self.set_cart({"1": 2})
        response = self.client.post("/marketplace/api/cart/update", json={"id": 1, "quantity": 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.get_cart(), {})

    def test_update_to_negative_removes_item(self):
        self.set_cart({"1": 2})
        response = self.client.post("/marketplace/api/cart/update", json={"id": 1, "quantity": -1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.get_cart(), {})

    def test_update_does_not_enforce_stock_limits(self):
        # api_cart_update does not clamp to available stock; checkout re-validates
        # instead. This documents that on-purpose asymmetry with api_cart_add.
        self.set_cart({})
        response = self.client.post("/marketplace/api/cart/update", json={"id": 1, "quantity": 500})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.get_cart(), {"1": 500})

    def test_update_with_bad_id_is_a_clean_400(self):
        response = self.client.post("/marketplace/api/cart/update", json={"id": "nope", "quantity": 1})
        self.assertEqual(response.status_code, 400)

    def test_clear_empties_the_cart(self):
        self.set_cart({"1": 2, "2": 1})
        response = self.client.post("/marketplace/api/cart/clear")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.get_cart(), {})

    def test_cart_get_reflects_session(self):
        self.set_cart({"1": 2})
        response = self.client.get("/marketplace/api/cart")
        self.assertEqual(response.get_json()["cart"], {"1": 2})


class CashCheckoutTests(MarketplaceTestCase):
    def test_empty_cart_cannot_check_out(self):
        response = self.client.post("/marketplace/api/orders", json={
            "guest_name": "Bob", "guest_email": "bob@example.com",
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("empty", response.get_json()["error"].lower())

    def test_guest_checkout_requires_name_and_email(self):
        self.set_cart({"1": 1})
        response = self.client.post("/marketplace/api/orders", json={"guest_name": "Bob"})
        self.assertEqual(response.status_code, 400)

    def test_guest_checkout_rejects_email_without_at_sign(self):
        self.set_cart({"1": 1})
        response = self.client.post("/marketplace/api/orders", json={
            "guest_name": "Bob", "guest_email": "not-an-email",
        })
        self.assertEqual(response.status_code, 400)

    def test_successful_guest_order_deducts_stock_and_clears_cart(self):
        self.set_cart({"1": 1})
        response = self.client.post("/marketplace/api/orders", json={
            "guest_name": "Bob", "guest_email": "bob@example.com", "notes": "Thursday please",
        })
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body["is_guest"])
        self.assertEqual(self.get_cart(), {})
        inv = {i["id"]: i for i in self.inventory()}
        self.assertEqual(inv[1]["quantity"], 1)

        order = server.store.get_order(body["order_id"])
        self.assertEqual(order["order"]["notes"], "Thursday please")
        self.assertEqual(order["order"]["payment_method"], "cash")
        self.assertEqual(order["order"]["payment_status"], "unpaid")

    def test_logged_in_checkout_ignores_guest_fields_and_uses_session_account(self):
        account = self.login_as("shopper@example.com")
        self.set_cart({"1": 1})
        response = self.client.post("/marketplace/api/orders", json={})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["is_guest"])
        orders = server.store.get_orders_for_account(account["id"])
        self.assertEqual(len(orders), 1)

    def test_item_removed_from_inventory_after_cart_add_is_caught_at_checkout(self):
        self.set_cart({"1": 1})
        # Simulate the item selling out / being deleted between add-to-cart and checkout.
        self.set_inventory([i for i in self.default_inventory() if i["id"] != 1])
        response = self.client.post("/marketplace/api/orders", json={
            "guest_name": "Bob", "guest_email": "bob@example.com",
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("no longer available", response.get_json()["error"])

    def test_cart_quantity_exceeding_restocked_but_lower_availability_is_caught(self):
        self.set_cart({"1": 2})
        inv = self.default_inventory()
        inv[0]["quantity"] = 1  # someone else bought one first
        self.set_inventory(inv)
        response = self.client.post("/marketplace/api/orders", json={
            "guest_name": "Bob", "guest_email": "bob@example.com",
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("Insufficient stock", response.get_json()["error"])
        # Stock must be untouched -- the order should not have been partially placed.
        self.assertEqual(self.inventory()[0]["quantity"], 1)

    def test_a_negative_quantity_smuggled_into_the_session_cart_cannot_be_checked_out(self):
        # Bypasses api_cart_add entirely by writing straight into the session, simulating
        # a forged/older cart. Cash checkout must reject it the same way PayPal does,
        # rather than creating a negative-priced order that inflates inventory.
        self.set_cart({"1": -5})
        response = self.client.post("/marketplace/api/orders", json={
            "guest_name": "Bob", "guest_email": "bob@example.com",
        })
        self.assertEqual(response.status_code, 400)
        self.assertEqual(server.store.get_all_orders(), [], "no order should have been created")
        self.assertEqual(self.inventory()[0]["quantity"], 2, "stock must not be inflated")

    def test_a_zero_quantity_smuggled_into_the_session_cart_is_rejected(self):
        self.set_cart({"1": 0})
        response = self.client.post("/marketplace/api/orders", json={
            "guest_name": "Bob", "guest_email": "bob@example.com",
        })
        self.assertEqual(response.status_code, 400)

    def test_purchasing_the_last_unit_removes_the_listing_entirely(self):
        self.set_cart({"2": 1})
        response = self.client.post("/marketplace/api/orders", json={
            "guest_name": "Bob", "guest_email": "bob@example.com",
        })
        self.assertEqual(response.status_code, 200)
        remaining_ids = [i["id"] for i in self.inventory()]
        self.assertNotIn(2, remaining_ids)

    def test_order_confirmation_email_failure_does_not_fail_the_order(self):
        # No SMTP settings are configured in this test fixture, so _send_order_confirmation_email
        # is never even attempted; the checkout should still succeed either way.
        self.set_cart({"1": 1})
        response = self.client.post("/marketplace/api/orders", json={
            "guest_name": "Bob", "guest_email": "bob@example.com",
        })
        self.assertEqual(response.status_code, 200)


class AuthTests(MarketplaceTestCase):
    def test_signup_requires_name_email_and_password(self):
        response = self.client.post("/marketplace/api/signup", json={"email": "a@b.com", "password": "abcd"})
        self.assertEqual(response.status_code, 400)

    def test_signup_requires_password_at_least_four_chars(self):
        response = self.client.post("/marketplace/api/signup", json={
            "email": "a@b.com", "name": "A", "password": "abc",
        })
        self.assertEqual(response.status_code, 400)

    def test_signup_duplicate_email_is_conflict(self):
        server.store.create_account("dup@example.com", "Dup", "password")
        response = self.client.post("/marketplace/api/signup", json={
            "email": "dup@example.com", "name": "Dup2", "password": "password",
        })
        self.assertEqual(response.status_code, 409)

    def test_signup_logs_the_new_account_in(self):
        response = self.client.post("/marketplace/api/signup", json={
            "email": "new@example.com", "name": "New", "password": "password",
        })
        self.assertEqual(response.status_code, 200)
        me = self.client.get("/marketplace/api/me").get_json()
        self.assertTrue(me["logged_in"])
        self.assertEqual(me["email"], "new@example.com")

    def test_login_wrong_password_is_401(self):
        server.store.create_account("bob@example.com", "Bob", "password")
        response = self.client.post("/marketplace/api/login", json={
            "email": "bob@example.com", "password": "wrong",
        })
        self.assertEqual(response.status_code, 401)

    def test_login_unknown_email_is_401(self):
        response = self.client.post("/marketplace/api/login", json={
            "email": "nobody@example.com", "password": "whatever",
        })
        self.assertEqual(response.status_code, 401)

    def test_login_success_reports_admin_flag(self):
        server.store.create_account("jared.luyster@gmail.com", "Admin", "password")
        response = self.client.post("/marketplace/api/login", json={
            "email": "jared.luyster@gmail.com", "password": "password",
        })
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["is_admin"])

    def test_logout_clears_session(self):
        self.login_as("bob@example.com")
        self.client.post("/marketplace/api/logout")
        me = self.client.get("/marketplace/api/me").get_json()
        self.assertFalse(me["logged_in"])

    def test_me_reflects_cart_count_when_logged_out(self):
        self.set_cart({"1": 2})
        me = self.client.get("/marketplace/api/me").get_json()
        self.assertFalse(me["logged_in"])
        self.assertEqual(me["cart_count"], 2)

    def test_me_with_deleted_account_id_in_session_reports_logged_out(self):
        with self.client.session_transaction() as s:
            s["account_id"] = 999999
        me = self.client.get("/marketplace/api/me").get_json()
        self.assertFalse(me["logged_in"])

    def test_forgot_password_unknown_email_still_reports_ok(self):
        # Must not leak whether an email is registered.
        response = self.client.post("/marketplace/api/forgot-password", json={"email": "nobody@example.com"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])

    def test_reset_password_too_short_is_rejected(self):
        response = self.client.post("/marketplace/api/reset-password", json={"token": "x", "password": "abc"})
        self.assertEqual(response.status_code, 400)

    def test_reset_password_bad_token_is_rejected(self):
        response = self.client.post("/marketplace/api/reset-password", json={
            "token": "not-a-real-token", "password": "newpassword",
        })
        self.assertEqual(response.status_code, 400)


class AuthorizationGuardTests(MarketplaceTestCase):
    def test_orders_page_redirects_when_logged_out(self):
        response = self.client.get("/marketplace/orders")
        self.assertEqual(response.status_code, 302)

    def test_admin_page_redirects_when_logged_out(self):
        response = self.client.get("/marketplace/admin")
        self.assertEqual(response.status_code, 302)

    def test_admin_page_is_forbidden_for_a_non_admin_account(self):
        self.login_as("shopper@example.com")
        response = self.client.get("/marketplace/admin")
        self.assertEqual(response.status_code, 403)

    def test_admin_page_allowed_for_admin_account(self):
        self.login_as("jared.luyster@gmail.com")
        response = self.client.get("/marketplace/admin")
        self.assertEqual(response.status_code, 200)

    def test_admin_api_is_forbidden_for_a_non_admin_account(self):
        self.login_as("shopper@example.com")
        response = self.client.post("/marketplace/api/admin/settings", json={"smtp_host": "x"})
        self.assertEqual(response.status_code, 403)

    def test_admin_quick_add_is_forbidden_for_a_non_admin_account(self):
        self.login_as("shopper@example.com")
        response = self.client.post("/marketplace/api/admin/quick-add/add", json={"cards": []})
        self.assertEqual(response.status_code, 403)

    def test_admin_cards_delete_is_forbidden_for_a_non_admin_account(self):
        self.login_as("shopper@example.com")
        response = self.client.post("/marketplace/api/admin/cards/delete", json={"id": 1})
        self.assertEqual(response.status_code, 403)


class AdminOrderStatusTests(MarketplaceTestCase):
    def setUp(self):
        super().setUp()
        self.admin = self.login_as("jared.luyster@gmail.com")

    def _cash_order(self, quantity=1, item_id=1):
        order_id = server.store.create_order(
            self.admin["id"],
            [{"id": item_id, "name": "Test Card", "set_code": "tst", "collector_number": "1",
              "foil": False, "quantity": quantity, "price": 1.25}],
        )
        return order_id

    def test_unknown_order_id_is_404(self):
        response = self.client.post("/marketplace/api/admin/orders/999999/status", json={"status": "shipped"})
        self.assertEqual(response.status_code, 404)

    def test_invalid_status_value_is_rejected(self):
        order_id = self._cash_order()
        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/status", json={"status": "teleported"},
        )
        self.assertEqual(response.status_code, 400)

    def test_setting_the_same_status_is_a_no_op_success(self):
        order_id = self._cash_order()
        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/status", json={"status": "pending"},
        )
        self.assertEqual(response.status_code, 200)

    def test_cannot_cancel_a_shipped_order(self):
        order_id = self._cash_order()
        self.client.post(f"/marketplace/api/admin/orders/{order_id}/status", json={"status": "shipped"})
        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/status", json={"status": "cancelled"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(server.store.get_order(order_id)["order"]["status"], "shipped")

    def test_cannot_cancel_a_completed_order(self):
        order_id = self._cash_order()
        self.client.post(f"/marketplace/api/admin/orders/{order_id}/status", json={"status": "shipped"})
        self.client.post(f"/marketplace/api/admin/orders/{order_id}/status", json={"status": "completed"})
        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/status", json={"status": "cancelled"},
        )
        self.assertEqual(response.status_code, 400)

    def test_cancelling_restores_stock_and_reopening_deducts_it_again(self):
        order_id = self._cash_order(quantity=1)
        before = self.inventory()[0]["quantity"]

        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/status", json={"status": "cancelled"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.inventory()[0]["quantity"], before + 1)

        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/status", json={"status": "pending"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.inventory()[0]["quantity"], before)

    def test_cancelling_an_order_for_an_item_no_longer_in_inventory_recreates_a_listing(self):
        order_id = self._cash_order(quantity=1)
        self.set_inventory([])
        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/status", json={"status": "cancelled"},
        )
        self.assertEqual(response.status_code, 200)
        restored = self.inventory()
        self.assertEqual(len(restored), 1)
        self.assertEqual(restored[0]["quantity"], 1)

    def test_update_notes(self):
        order_id = self._cash_order()
        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/notes", json={"notes": "Called customer"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(server.store.get_order(order_id)["order"]["admin_notes"], "Called customer")

    def test_update_payment_status_on_cash_order(self):
        order_id = self._cash_order()
        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/payment", json={"payment_status": "paid"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(server.store.get_order(order_id)["order"]["payment_status"], "paid")

    def test_update_payment_status_rejects_bad_value(self):
        order_id = self._cash_order()
        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/payment", json={"payment_status": "sideways"},
        )
        self.assertEqual(response.status_code, 400)


class PricingTests(MarketplaceTestCase):
    def test_price_is_rounded_to_the_nearest_quarter(self):
        self.assertEqual(server._quarter(1.10), 1.00)
        self.assertEqual(server._quarter(1.13), 1.25)
        self.assertEqual(server._quarter(0.0), 0)
        self.assertEqual(server._quarter(None), 0)

    def test_basic_land_nonfoil_gets_flat_price_regardless_of_market_price(self):
        item = {"name": "Forest", "foil": False, "sell_price": None, "market_price": 50.00}
        self.assertEqual(server._price_for(item), server.BASIC_LAND_FLAT_PRICE)

    def test_foil_basic_land_is_not_flat_priced(self):
        item = {"name": "Forest", "foil": True, "sell_price": None, "market_price": 3.00}
        self.assertEqual(server._price_for(item), server._quarter(3.00))

    def test_sell_price_takes_priority_over_market_price(self):
        item = {"name": "Opt", "foil": False, "sell_price": 0.50, "market_price": 5.00}
        self.assertEqual(server._price_for(item), 0.50)

    def test_missing_prices_default_to_zero(self):
        item = {"name": "Mystery Card", "foil": False, "sell_price": None, "market_price": None}
        self.assertEqual(server._price_for(item), 0)

    def test_amount_string_sums_with_correct_rounding(self):
        items = [{"price": 0.10, "quantity": 3}, {"price": 0.25, "quantity": 1}]
        # 0.10 * 3 = 0.30 (avoiding binary-float drift via Decimal), + 0.25 = 0.55
        self.assertEqual(server._amount_string(items), "0.55")

    def test_valid_paypal_id_rejects_junk(self):
        self.assertTrue(server._valid_paypal_id("8AB123456C789012D"))
        self.assertFalse(server._valid_paypal_id(""))
        self.assertFalse(server._valid_paypal_id("a" * 65))
        self.assertFalse(server._valid_paypal_id("has spaces"))
        self.assertFalse(server._valid_paypal_id("<script>"))
        self.assertFalse(server._valid_paypal_id(None))
        self.assertFalse(server._valid_paypal_id(12345))


class StaticFileServingTests(MarketplaceTestCase):
    def test_inventory_json_is_served(self):
        response = self.client.get("/marketplace/inventory.json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.get_json()), 2)

    def test_path_traversal_outside_site_root_is_not_found(self):
        response = self.client.get("/../marketplace/server.py")
        self.assertIn(response.status_code, (404, 308, 301))

    def test_unknown_site_static_file_is_404(self):
        response = self.client.get("/this-file-does-not-exist.html")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
