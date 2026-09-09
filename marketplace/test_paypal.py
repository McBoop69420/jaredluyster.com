import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from store import Store


class PayPalCheckoutTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        temp_path = Path(self.temp_dir.name)
        self.original_store = server.store
        server.store = Store(temp_path / "marketplace.db")
        server.store.replace_inventory([
            {
                "id": 1,
                "name": "Test Card",
                "set_code": "tst",
                "collector_number": "1",
                "foil": False,
                "quantity": 2,
                "sell_price": 1.25,
                "market_price": 1.25,
                "image_url": None,
            }
        ])
        server.app.config.update(TESTING=True, SECRET_KEY="test-secret")
        self.client = server.app.test_client()
        self.env = patch.dict(
            os.environ,
            {
                "PAYPAL_CLIENT_ID": "sandbox-client-id",
                "PAYPAL_CLIENT_SECRET": "sandbox-client-secret",
                "PAYPAL_ENVIRONMENT": "sandbox",
                "PAYPAL_CURRENCY": "USD",
            },
        )
        self.env.start()

    def tearDown(self):
        self.env.stop()
        server.store.close()
        server.store = self.original_store
        self.temp_dir.cleanup()

    def _set_cart(self, quantity=1):
        with self.client.session_transaction() as checkout_session:
            checkout_session["cart"] = {"1": quantity}

    def _guest_payload(self):
        return {
            "guest_name": "Test Buyer",
            "guest_email": "buyer@example.com",
            "guest_phone": "555-0100",
            "notes": "Thursday pickup",
        }

    def _create_paypal_order(self, quantity=1):
        self._set_cart(quantity)
        with patch.object(
            server,
            "_paypal_api_request",
            return_value={"id": "PAYPAL123", "status": "CREATED"},
        ) as paypal_request:
            response = self.client.post(
                "/marketplace/api/paypal/orders",
                json=self._guest_payload(),
            )
        self.assertEqual(response.status_code, 201)
        return response, paypal_request

    def test_create_order_uses_server_cart_total(self):
        response, paypal_request = self._create_paypal_order(quantity=2)

        self.assertEqual(response.get_json()["id"], "PAYPAL123")
        request_payload = paypal_request.call_args.kwargs["payload"]
        purchase_unit = request_payload["purchase_units"][0]
        self.assertEqual(purchase_unit["amount"]["value"], "2.50")
        self.assertEqual(purchase_unit["items"][0]["unit_amount"]["value"], "1.25")
        checkout = server.store.get_paypal_checkout("PAYPAL123")
        self.assertEqual(checkout["expected_amount"], "2.50")
        self.assertEqual(checkout["cart"], {"1": 2})

    def test_capture_creates_one_paid_order_and_deducts_inventory(self):
        self._create_paypal_order()
        capture_payload = {
            "id": "PAYPAL123",
            "status": "COMPLETED",
            "purchase_units": [{
                "payments": {
                    "captures": [{
                        "id": "CAPTURE456",
                        "status": "COMPLETED",
                        "amount": {"currency_code": "USD", "value": "1.25"},
                        "create_time": "2026-07-26T18:00:00Z",
                    }]
                }
            }],
        }
        with patch.object(
            server, "_paypal_api_request", return_value=capture_payload
        ) as paypal_request:
            response = self.client.post(
                "/marketplace/api/paypal/orders/PAYPAL123/capture"
            )

        self.assertEqual(response.status_code, 200)
        result = response.get_json()
        order = server.store.get_order(result["order_id"])["order"]
        self.assertEqual(order["payment_method"], "paypal")
        self.assertEqual(order["payment_status"], "paid")
        self.assertEqual(order["paypal_order_id"], "PAYPAL123")
        self.assertEqual(order["paypal_capture_id"], "CAPTURE456")
        inventory = server.store.list_inventory()
        self.assertEqual(inventory[0]["quantity"], 1)
        self.assertEqual(paypal_request.call_count, 1)

        with patch.object(
            server,
            "_paypal_api_request",
            side_effect=AssertionError("PayPal should not be called twice"),
        ):
            repeated = self.client.post(
                "/marketplace/api/paypal/orders/PAYPAL123/capture"
            )
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.get_json()["order_id"], result["order_id"])

    def test_capture_sends_a_discord_notification_when_configured(self):
        server.store.set_setting("discord_webhook_url", "https://discord.com/api/webhooks/test")
        self._create_paypal_order()
        capture_payload = {
            "id": "PAYPAL123",
            "status": "COMPLETED",
            "purchase_units": [{
                "payments": {
                    "captures": [{
                        "id": "CAPTURE456",
                        "status": "COMPLETED",
                        "amount": {"currency_code": "USD", "value": "1.25"},
                        "create_time": "2026-07-26T18:00:00Z",
                    }]
                }
            }],
        }
        with patch.object(server, "_paypal_api_request", return_value=capture_payload), \
             patch("server.requests.post") as mock_post:
            response = self.client.post("/marketplace/api/paypal/orders/PAYPAL123/capture")

        self.assertEqual(response.status_code, 200)
        mock_post.assert_called_once()
        self.assertEqual(mock_post.call_args[0][0], "https://discord.com/api/webhooks/test")
        content = mock_post.call_args[1]["json"]["content"]
        self.assertIn("paypal", content)
        self.assertIn("paid", content)

    def test_capture_stops_before_payment_when_price_changes(self):
        self._create_paypal_order()
        inventory = server.store.list_inventory()
        inventory[0]["sell_price"] = 2.00
        server.store.replace_inventory(inventory)

        with patch.object(
            server,
            "_paypal_api_request",
            side_effect=AssertionError("Changed total must not be captured"),
        ):
            response = self.client.post(
                "/marketplace/api/paypal/orders/PAYPAL123/capture"
            )

        self.assertEqual(response.status_code, 409)
        self.assertIn("cart total changed", response.get_json()["error"].lower())
        self.assertIsNone(server.store.get_order_by_paypal_order_id("PAYPAL123"))

    def test_cart_keeps_cash_fallback_without_paypal_credentials(self):
        self._set_cart()
        with patch.dict(
            os.environ,
            {"PAYPAL_CLIENT_ID": "", "PAYPAL_CLIENT_SECRET": ""},
        ):
            response = self.client.get("/marketplace/cart")

        html = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn("PayPal checkout is temporarily unavailable.", html)
        self.assertIn("Reserve for cash pickup", html)
        self.assertNotIn("https://www.paypal.com/sdk/js?", html)

    def test_cart_loads_paypal_sdk_when_configured(self):
        self._set_cart()
        response = self.client.get("/marketplace/cart")

        html = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn("https://www.paypal.com/sdk/js?", html)
        self.assertIn("client-id=sandbox-client-id", html)
        self.assertIn('id="paypal-button-container"', html)
        self.assertNotIn("PayPal checkout is temporarily unavailable.", html)

    def test_cart_uses_protected_admin_paypal_settings(self):
        server.store.set_setting("paypal_client_id", "stored-client-id")
        server.store.set_setting("paypal_secret", "stored-client-secret")
        server.store.set_setting("paypal_env", "live")
        self._set_cart()

        with patch.dict(
            os.environ,
            {
                "PAYPAL_CLIENT_ID": "",
                "PAYPAL_CLIENT_SECRET": "",
                "PAYPAL_ENVIRONMENT": "",
            },
        ):
            response = self.client.get("/marketplace/cart")

        html = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn("client-id=stored-client-id", html)
        self.assertIn('id="paypal-button-container"', html)

    def test_capture_reconciles_a_completed_payment_after_api_error(self):
        self._create_paypal_order()
        completed_order = {
            "id": "PAYPAL123",
            "status": "COMPLETED",
            "purchase_units": [{
                "payments": {
                    "captures": [{
                        "id": "CAPTURE456",
                        "status": "COMPLETED",
                        "amount": {"currency_code": "USD", "value": "1.25"},
                    }]
                }
            }],
        }
        with patch.object(
            server,
            "_paypal_api_request",
            side_effect=[
                server.PayPalAPIError("Capture timed out."),
                completed_order,
            ],
        ) as paypal_request:
            response = self.client.post(
                "/marketplace/api/paypal/orders/PAYPAL123/capture"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(paypal_request.call_count, 2)
        self.assertIsNotNone(
            server.store.get_order_by_paypal_order_id("PAYPAL123")
        )

    def test_cancelling_paid_order_refunds_before_restoring_stock(self):
        admin = server.store.create_account(
            "jared.luyster@gmail.com", "Admin", "password"
        )
        items = [{
            "id": 1,
            "name": "Test Card",
            "set_code": "tst",
            "collector_number": "1",
            "foil": False,
            "quantity": 1,
            "price": 1.25,
        }]
        order_id = server.store.create_order(
            admin["id"],
            items,
            payment_method="paypal",
            payment_status="paid",
            paypal_order_id="PAYPALREFUND1",
            paypal_capture_id="CAPTURE456",
            paid_at="2026-07-26T18:00:00Z",
        )
        server.store.replace_inventory([])
        with self.client.session_transaction() as checkout_session:
            checkout_session["account_id"] = admin["id"]

        refund_payload = {
            "id": "REFUND789",
            "status": "COMPLETED",
            "create_time": "2026-07-26T19:00:00Z",
        }
        with patch.object(
            server, "_paypal_api_request", return_value=refund_payload
        ) as paypal_request:
            response = self.client.post(
                f"/marketplace/api/admin/orders/{order_id}/status",
                json={"status": "cancelled"},
            )

        self.assertEqual(response.status_code, 200)
        order = server.store.get_order(order_id)["order"]
        self.assertEqual(order["status"], "cancelled")
        self.assertEqual(order["payment_status"], "refunded")
        self.assertEqual(order["paypal_refund_id"], "REFUND789")
        self.assertIn("/v2/payments/captures/CAPTURE456/refund",
                      paypal_request.call_args.args)
        inventory = server.store.list_inventory()
        self.assertEqual(inventory[0]["id"], 1)
        self.assertEqual(inventory[0]["quantity"], 1)

    def test_admin_cannot_override_paypal_payment_status(self):
        admin = server.store.create_account(
            "jared.luyster@gmail.com", "Admin", "password"
        )
        order_id = server.store.create_order(
            admin["id"],
            [{
                "id": 1,
                "name": "Test Card",
                "quantity": 1,
                "price": 1.25,
            }],
            payment_method="paypal",
            payment_status="paid",
            paypal_order_id="PAYPALLOCK1",
            paypal_capture_id="CAPTURE456",
        )
        with self.client.session_transaction() as checkout_session:
            checkout_session["account_id"] = admin["id"]

        response = self.client.post(
            f"/marketplace/api/admin/orders/{order_id}/payment",
            json={"payment_status": "unpaid"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            server.store.get_order(order_id)["order"]["payment_status"],
            "paid",
        )


if __name__ == "__main__":
    unittest.main()
