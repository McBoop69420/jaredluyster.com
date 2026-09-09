"""Tests for the admin "clear all inventory" endpoint."""

import os
import tempfile
import unittest
from pathlib import Path

import server
from store import Store


class ClearInventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.db_path = Path(self.temp_dir.name) / "marketplace.db"
        self.original_store = server.store
        server.store = Store(self.db_path)
        server.app.config.update(TESTING=True, SECRET_KEY="test-secret")
        self.client = server.app.test_client()
        self.addCleanup(self._teardown)

    def _teardown(self):
        server.store.close()
        server.store = self.original_store

    def _login_as_admin(self):
        """Create an admin account and log in with it."""
        from store import ALL_ADMIN_EMAILS
        email = ALL_ADMIN_EMAILS[0]
        server.store.create_account(email, "Test Admin", "password123")
        self.client.post("/marketplace/api/login", json={
            "email": email, "password": "password123"
        })

    def _seed_inventory(self, count=5):
        """Put `count` cards into the live inventory."""
        items = []
        for i in range(1, count + 1):
            items.append({
                "id": i, "name": f"Card {i}", "set_code": "DOM",
                "collector_number": str(i), "foil": False, "condition": "Near Mint",
                "quantity": 1, "category": "MTG Card", "sell_price": None,
                "market_price": 0.25, "image_url": None, "notes": None,
            })
        server.store.replace_inventory(items)
        return items

    def test_clear_requires_login(self):
        """Anonymous users get redirected to login, not 200."""
        response = self.client.post("/marketplace/api/admin/inventory/clear")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login", response.headers.get("Location", ""))

    def test_clear_requires_admin(self):
        """A regular (non-admin) account gets 403."""
        server.store.create_account("nobody@example.com", "Regular", "password123")
        self.client.post("/marketplace/api/login", json={
            "email": "nobody@example.com", "password": "password123"
        })
        response = self.client.post("/marketplace/api/admin/inventory/clear")
        self.assertEqual(response.status_code, 403)

    def test_clear_removes_all_cards(self):
        """A logged-in admin can empty the inventory in one call."""
        self._login_as_admin()
        self._seed_inventory(5)
        self.assertEqual(len(server.store.list_inventory()), 5)

        response = self.client.post("/marketplace/api/admin/inventory/clear")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["inventory_count"], 0)
        self.assertEqual(len(server.store.list_inventory()), 0)

    def test_clear_takes_a_snapshot_so_restore_works(self):
        """After clearing, the pre-clear inventory can be restored."""
        self._login_as_admin()
        self._seed_inventory(5)

        self.client.post("/marketplace/api/admin/inventory/clear")
        self.assertEqual(len(server.store.list_inventory()), 0)

        # Publish key is the same one used by bulk-publish/restore.
        os.environ["PUBLISH_API_KEY"] = "test-publish-key"
        try:
            response = self.client.post(
                "/marketplace/api/admin/inventory/restore",
                json={},
                headers={"X-Publish-Key": "test-publish-key"},
            )
        finally:
            del os.environ["PUBLISH_API_KEY"]

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["restored"], 5)
        self.assertEqual(len(server.store.list_inventory()), 5)


if __name__ == "__main__":
    unittest.main()
