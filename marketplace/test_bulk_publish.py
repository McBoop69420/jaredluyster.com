"""Integration tests for the /admin/inventory/bulk-publish endpoint that publish.py calls."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from store import Store


class BulkPublishTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.original_store = server.store
        server.store = Store(Path(self.temp_dir.name) / "marketplace.db")
        server.app.config.update(TESTING=True, SECRET_KEY="test-secret")
        self.client = server.app.test_client()
        self.env = patch.dict(os.environ, {"PUBLISH_API_KEY": "test-publish-key"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self._teardown)

    def _teardown(self):
        server.store.close()
        server.store = self.original_store

    def publish(self, **body):
        body.setdefault("items", [])
        body.setdefault("pos_printings", [])
        body.setdefault("pos_ids", [])
        return self.client.post(
            "/marketplace/api/admin/inventory/bulk-publish",
            json=body,
            headers={"X-Publish-Key": "test-publish-key"},
        )

    def pos_item(self, **overrides):
        item = {"id": 1, "name": "Opt", "set_code": "DOM", "collector_number": "60",
                "foil": False, "condition": "Near Mint", "quantity": 3, "category": "MTG Card",
                "sell_price": None, "market_price": 0.25, "image_url": None, "notes": None}
        item.update(overrides)
        return item

    def test_missing_key_configuration_is_rejected(self):
        with patch.dict(os.environ, {"PUBLISH_API_KEY": ""}):
            response = self.client.post(
                "/marketplace/api/admin/inventory/bulk-publish",
                json={"items": [], "pos_printings": [], "pos_ids": []},
                headers={"X-Publish-Key": "anything"},
            )
        self.assertEqual(response.status_code, 503)

    def test_wrong_key_is_rejected(self):
        response = self.client.post(
            "/marketplace/api/admin/inventory/bulk-publish",
            json={"items": [], "pos_printings": [], "pos_ids": []},
            headers={"X-Publish-Key": "wrong"},
        )
        self.assertEqual(response.status_code, 403)

    def test_publishes_pos_items(self):
        response = self.publish(items=[self.pos_item()], pos_printings=[["dom", "60", False]], pos_ids=[1])
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data, {"ok": True, "published": 1, "carried": 0, "total": 1})
        self.assertEqual([i["name"] for i in server.store.list_inventory()], ["Opt"])

    def test_hand_added_listing_survives_a_publish(self):
        server.store.replace_inventory([{
            "id": 1_000_000, "name": "Sealed Booster Box", "set_code": "LTR",
            "collector_number": "BOX", "foil": False, "condition": "Near Mint", "quantity": 1,
            "category": "MTG Card", "sell_price": 99.0, "market_price": 99.0,
            "image_url": None, "notes": None,
        }])

        response = self.publish(items=[self.pos_item()], pos_printings=[["dom", "60", False]], pos_ids=[1])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["carried"], 1)
        names = sorted(i["name"] for i in server.store.list_inventory())
        self.assertEqual(names, ["Opt", "Sealed Booster Box"])

    def test_pos_quantity_replaces_the_carried_copy_for_the_same_printing(self):
        server.store.replace_inventory([self.pos_item(id=1, quantity=99)])

        response = self.publish(items=[self.pos_item(id=1, quantity=3)],
                                 pos_printings=[["dom", "60", False]], pos_ids=[1])

        self.assertEqual(response.status_code, 200)
        inventory = server.store.list_inventory()
        self.assertEqual(len(inventory), 1)
        self.assertEqual(inventory[0]["quantity"], 3, "the fresh POS scan should win")

    def test_replace_flag_drops_hand_added_listings(self):
        server.store.replace_inventory([{
            "id": 1_000_000, "name": "Playmat", "set_code": "ACC", "collector_number": "PM1",
            "foil": False, "condition": "Near Mint", "quantity": 1, "category": "MTG Card",
            "sell_price": 20.0, "market_price": 20.0, "image_url": None, "notes": None,
        }])

        response = self.publish(items=[self.pos_item()], pos_printings=[["dom", "60", False]],
                                 pos_ids=[1], replace=True)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["carried"], 0)
        self.assertEqual([i["name"] for i in server.store.list_inventory()], ["Opt"])


if __name__ == "__main__":
    unittest.main()
