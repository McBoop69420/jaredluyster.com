"""Tests for publishing POS inventory without wiping hand-added listings."""

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from publish import MANUAL_ID_BASE, publish

SCHEMA = """
CREATE TABLE collection_items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    set_code TEXT NOT NULL,
    collector_number TEXT NOT NULL,
    foil INTEGER NOT NULL DEFAULT 0,
    condition TEXT NOT NULL DEFAULT 'Near Mint',
    quantity INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'MTG Card',
    sell_price REAL,
    last_price_usd REAL,
    price_usd_at_scan REAL,
    image_url TEXT,
    notes TEXT
);
"""


def listing(**overrides):
    item = {"id": 1, "name": "Opt", "set_code": "DOM", "collector_number": "60", "foil": False,
            "condition": "Near Mint", "quantity": 1, "category": "MTG Card", "sell_price": None,
            "market_price": 0.25, "image_url": None, "notes": None}
    item.update(overrides)
    return item


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.db = root / "collection.db"
        self.out = root / "inventory.json"

        connection = sqlite3.connect(self.db)
        connection.executescript(SCHEMA)
        self.add_pos_card(connection, 1, "Opt", "DOM", "60", quantity=3, price=0.25)
        self.add_pos_card(connection, 2, "Sol Ring", "C21", "263", quantity=2, price=2.00)
        self.add_pos_card(connection, 3, "Ancestral Vision", "TSP", "45", quantity=0, price=9.00)
        connection.commit()
        connection.close()

    def add_pos_card(self, connection, item_id, name, set_code, number, *, quantity, price, foil=0):
        connection.execute(
            "INSERT INTO collection_items (id, name, set_code, collector_number, foil, condition,"
            " quantity, category, sell_price, last_price_usd, price_usd_at_scan, image_url, notes)"
            " VALUES (?,?,?,?,?,'Near Mint',?,'MTG Card',NULL,?,?,NULL,NULL)",
            (item_id, name, set_code, number, foil, quantity, price, price))

    def write_site(self, listings):
        self.out.write_text(json.dumps(listings, indent=2), encoding="utf-8")

    def published(self):
        return json.loads(self.out.read_text(encoding="utf-8"))

    def names(self):
        return sorted(item["name"] for item in self.published())

    def test_publishes_stocked_pos_cards_and_skips_sold_out_ones(self):
        publish(self.db, self.out)
        self.assertEqual(self.names(), ["Opt", "Sol Ring"])

    def test_hand_added_listing_survives_a_publish(self):
        self.write_site([listing(id=MANUAL_ID_BASE, name="Sealed Booster Box", set_code="LTR",
                                 collector_number="BOX", market_price=99.0)])
        publish(self.db, self.out)
        self.assertEqual(self.names(), ["Opt", "Sealed Booster Box", "Sol Ring"])
        kept = next(item for item in self.published() if item["name"] == "Sealed Booster Box")
        self.assertEqual(kept["id"], MANUAL_ID_BASE, "a non-clashing id should stay put")

    def test_pos_card_that_sold_out_is_still_delisted(self):
        self.write_site([listing(id=3, name="Ancestral Vision", set_code="TSP", collector_number="45")])
        publish(self.db, self.out)
        self.assertNotIn("Ancestral Vision", self.names())

    def test_pos_quantity_wins_over_the_published_copy(self):
        self.write_site([listing(id=1, name="Opt", set_code="DOM", collector_number="60", quantity=99)])
        publish(self.db, self.out)
        opt = next(item for item in self.published() if item["name"] == "Opt")
        self.assertEqual(opt["quantity"], 3)

    def test_matching_is_per_printing_not_per_name(self):
        self.write_site([listing(id=MANUAL_ID_BASE, name="Opt", set_code="ELD", collector_number="59")])
        publish(self.db, self.out)
        self.assertEqual([item["set_code"] for item in self.published() if item["name"] == "Opt"],
                         ["DOM", "ELD"])

    def test_foil_and_nonfoil_are_different_listings(self):
        self.write_site([listing(id=MANUAL_ID_BASE, name="Opt", set_code="DOM",
                                 collector_number="60", foil=True)])
        publish(self.db, self.out)
        self.assertEqual(len([item for item in self.published() if item["name"] == "Opt"]), 2)

    def test_a_clashing_id_is_renumbered_out_of_the_pos_range(self):
        self.write_site([listing(id=2, name="Playmat", set_code="ACC", collector_number="PM1")])
        publish(self.db, self.out)
        playmat = next(item for item in self.published() if item["name"] == "Playmat")
        self.assertGreaterEqual(playmat["id"], MANUAL_ID_BASE)
        ids = [item["id"] for item in self.published()]
        self.assertEqual(len(ids), len(set(ids)), "ids must stay unique")

    def test_replace_restores_the_old_wipe_everything_behaviour(self):
        self.write_site([listing(id=MANUAL_ID_BASE, name="Sealed Booster Box", set_code="LTR",
                                 collector_number="BOX")])
        publish(self.db, self.out, replace=True)
        self.assertEqual(self.names(), ["Opt", "Sol Ring"])

    def test_min_price_filter_still_applies(self):
        publish(self.db, self.out, min_price=1.0)
        self.assertEqual(self.names(), ["Sol Ring"])

    def test_zero_quantity_listings_are_not_carried_over(self):
        self.write_site([listing(id=MANUAL_ID_BASE, name="Playmat", set_code="ACC",
                                 collector_number="PM1", quantity=0)])
        publish(self.db, self.out)
        self.assertNotIn("Playmat", self.names())

    def test_previous_file_is_backed_up_and_written_atomically(self):
        self.write_site([listing(id=MANUAL_ID_BASE, name="Playmat", set_code="ACC", collector_number="PM1")])
        publish(self.db, self.out)
        backup = self.out.with_name(self.out.name + ".bak")
        self.assertTrue(backup.exists())
        self.assertEqual(json.loads(backup.read_text(encoding="utf-8"))[0]["name"], "Playmat")
        self.assertFalse(self.out.with_name(self.out.name + ".tmp").exists())

    def test_unreadable_site_file_does_not_stop_a_publish(self):
        self.out.write_text("{ this is not json", encoding="utf-8")
        publish(self.db, self.out)
        self.assertEqual(self.names(), ["Opt", "Sol Ring"])

    def test_output_shape_matches_what_the_storefront_expects(self):
        publish(self.db, self.out)
        self.assertEqual(set(self.published()[0]), {
            "id", "name", "set_code", "collector_number", "foil", "condition", "quantity",
            "category", "sell_price", "market_price", "image_url", "notes"})


if __name__ == "__main__":
    unittest.main()
