"""A bulk publish replaces the whole shop, so it has to be refusable and undoable.

A half-scanned POS is already safe: cards it does not mention are carried over as if
hand-added. What collapses the shop is a POS that still tracks every card but reports
them out of stock, or a --replace publish. Those are what the guard is for.
"""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from store import Store


class PublishRecoveryTests(unittest.TestCase):
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

    # -- helpers --------------------------------------------------------------

    def item(self, item_id, name="Card"):
        return {"id": item_id, "name": f"{name} {item_id}", "set_code": "DOM",
                "collector_number": str(item_id), "foil": False, "condition": "Near Mint",
                "quantity": 1, "category": "MTG Card", "sell_price": None,
                "market_price": 0.25, "image_url": None, "notes": None}

    def stock(self, count):
        """Put `count` POS-tracked listings live, the way a normal publish would."""
        items = [self.item(i) for i in range(1, count + 1)]
        response = self.publish(items=items,
                                pos_printings=[["dom", str(i), False] for i in range(1, count + 1)],
                                pos_ids=list(range(1, count + 1)))
        self.assertEqual(response.status_code, 200)
        return items

    def tracked(self, count):
        """Printings/ids for a POS that knows all `count` cards, whatever their stock."""
        return ([["dom", str(i), False] for i in range(1, count + 1)], list(range(1, count + 1)))

    def sold_out_publish(self, live, keeping, **extra):
        """A POS that still tracks every card but now reports only `keeping` in stock."""
        printings, ids = self.tracked(live)
        return self.publish(items=[self.item(i) for i in range(1, keeping + 1)],
                            pos_printings=printings, pos_ids=ids, **extra)

    def publish(self, **body):
        body.setdefault("items", [])
        body.setdefault("pos_printings", [])
        body.setdefault("pos_ids", [])
        return self.client.post("/marketplace/api/admin/inventory/bulk-publish", json=body,
                                headers={"X-Publish-Key": "test-publish-key"})

    def restore(self, key="test-publish-key"):
        return self.client.post("/marketplace/api/admin/inventory/restore", json={},
                                headers={"X-Publish-Key": key})

    def live_names(self):
        return sorted(i["name"] for i in server.store.list_inventory())

    # -- the guard ------------------------------------------------------------

    def test_a_publish_that_collapses_the_shop_is_refused(self):
        self.stock(20)
        response = self.sold_out_publish(20, 1)
        self.assertEqual(response.status_code, 409)
        self.assertFalse(response.get_json()["ok"])
        self.assertIn("20 listings to 1", response.get_json()["error"])
        self.assertEqual(len(server.store.list_inventory()), 20, "the shop must be left alone")

    def test_the_refusal_says_how_to_go_ahead(self):
        self.stock(20)
        self.assertIn("--force", self.sold_out_publish(20, 1).get_json()["error"])

    def test_force_publishes_anyway(self):
        self.stock(20)
        response = self.sold_out_publish(20, 1, force=True)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(server.store.list_inventory()), 1)

    def test_an_ordinary_shrink_is_not_blocked(self):
        self.stock(20)
        items = [self.item(i) for i in range(1, 12)]
        response = self.publish(items=items,
                                pos_printings=[["dom", str(i), False] for i in range(1, 21)],
                                pos_ids=list(range(1, 21)))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(server.store.list_inventory()), 11)

    def test_a_small_shop_is_not_guarded(self):
        # Starting out, publishing fewer listings than are live is ordinary, not a mistake.
        self.stock(4)
        self.assertEqual(self.sold_out_publish(4, 1).status_code, 200)

    def test_the_guard_counts_carried_listings_too(self):
        # Hand-added stock survives a publish, so it counts towards what is left: without
        # it this same publish would leave 1 of 45 and be refused.
        self.stock(20)
        hand_added = [self.item(1_000_000 + i, name="Sealed") for i in range(25)]
        server.store.replace_inventory(server.store.list_inventory() + hand_added)
        response = self.sold_out_publish(20, 1)
        self.assertEqual(response.status_code, 200, "26 of 45 listings survive, so this is no collapse")
        self.assertEqual(len(server.store.list_inventory()), 26)

    def test_replace_is_guarded_too(self):
        # --replace drops hand-added stock by design; that is not licence to empty the shop.
        self.stock(20)
        response = self.publish(items=[self.item(1)], pos_printings=[["dom", "1", False]],
                                pos_ids=[1], replace=True)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(len(server.store.list_inventory()), 20)

    def test_replace_with_force_goes_through(self):
        self.stock(20)
        response = self.publish(items=[self.item(1)], pos_printings=[["dom", "1", False]],
                                pos_ids=[1], replace=True, force=True)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(server.store.list_inventory()), 1)

    # -- the snapshot ---------------------------------------------------------

    def test_a_publish_can_be_undone(self):
        self.stock(20)
        before = self.live_names()
        self.sold_out_publish(20, 1, force=True)
        self.assertEqual(len(server.store.list_inventory()), 1)

        response = self.restore()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["restored"], 20)
        self.assertEqual(self.live_names(), before)

    def test_the_restore_itself_can_be_undone(self):
        self.stock(20)
        self.sold_out_publish(20, 1, force=True)
        self.restore()
        self.assertEqual(len(server.store.list_inventory()), 20)

        self.restore()
        self.assertEqual(len(server.store.list_inventory()), 1, "restoring again returns to the publish")

    def test_the_snapshot_records_when_it_was_taken(self):
        self.stock(3)
        self.sold_out_publish(3, 1)
        self.assertTrue(self.restore().get_json()["taken_at"])

    def test_restoring_with_nothing_kept_says_so(self):
        response = self.restore()
        self.assertEqual(response.status_code, 404)
        self.assertIn("no inventory snapshot", response.get_json()["error"])

    def test_a_refused_publish_leaves_the_snapshot_alone(self):
        self.stock(20)
        self.publish(items=[self.item(i) for i in range(1, 21)],
                     pos_printings=[["dom", str(i), False] for i in range(1, 21)],
                     pos_ids=list(range(1, 21)))
        kept, _ = server.store.get_inventory_snapshot()
        self.sold_out_publish(20, 1)
        still_kept, _ = server.store.get_inventory_snapshot()
        self.assertEqual(kept, still_kept)

    def test_restore_needs_the_publish_key(self):
        self.assertEqual(self.restore(key="wrong").status_code, 403)


if __name__ == "__main__":
    unittest.main()
