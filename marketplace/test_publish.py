"""Tests for reading the POS database and posting it to the marketplace API."""

import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from publish import _read_pos_rows, publish

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


class PosDbTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db = Path(self.directory.name) / "collection.db"

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

    def test_publishes_stocked_pos_cards_and_skips_sold_out_ones(self):
        items, _, _ = _read_pos_rows(self.db)
        self.assertEqual(sorted(i["name"] for i in items), ["Opt", "Sol Ring"])

    def test_min_price_filter_still_applies(self):
        items, _, _ = _read_pos_rows(self.db, min_price=1.0)
        self.assertEqual([i["name"] for i in items], ["Sol Ring"])

    def test_pos_printings_and_ids_cover_every_row_including_sold_out(self):
        _, pos_printings, pos_ids = _read_pos_rows(self.db)
        self.assertEqual(len(pos_printings), 3)
        self.assertEqual(sorted(pos_ids), [1, 2, 3])
        self.assertIn(("tsp", "45", False), pos_printings)

    def test_output_shape_matches_what_the_storefront_expects(self):
        items, _, _ = _read_pos_rows(self.db)
        self.assertEqual(set(items[0]), {
            "id", "name", "set_code", "collector_number", "foil", "condition", "quantity",
            "category", "sell_price", "market_price", "image_url", "notes"})


class PublishRequestTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db = Path(self.directory.name) / "collection.db"
        connection = sqlite3.connect(self.db)
        connection.executescript(SCHEMA)
        connection.execute(
            "INSERT INTO collection_items (id, name, set_code, collector_number, quantity,"
            " sell_price, last_price_usd, price_usd_at_scan) VALUES (1, 'Opt', 'DOM', '60', 3, NULL, 0.25, 0.25)"
        )
        connection.commit()
        connection.close()

    @patch("publish.requests.post")
    def test_posts_items_and_key_to_the_bulk_publish_endpoint(self, mock_post):
        mock_post.return_value.json.return_value = {"ok": True, "published": 1, "carried": 0, "total": 1}
        mock_post.return_value.raise_for_status.return_value = None

        publish(self.db, base_url="https://example.test", api_key="secret123")

        mock_post.assert_called_once()
        url, kwargs = mock_post.call_args[0][0], mock_post.call_args[1]
        self.assertEqual(url, "https://example.test/marketplace/api/admin/inventory/bulk-publish")
        self.assertEqual(kwargs["headers"]["X-Publish-Key"], "secret123")
        self.assertEqual([i["name"] for i in kwargs["json"]["items"]], ["Opt"])
        self.assertEqual(kwargs["json"]["replace"], False)

    @patch("publish.requests.post")
    def test_raises_when_the_server_reports_failure(self, mock_post):
        mock_post.return_value.json.return_value = {"ok": False, "error": "Unauthorized"}
        mock_post.return_value.raise_for_status.return_value = None

        with self.assertRaises(RuntimeError):
            publish(self.db, base_url="https://example.test", api_key="wrong")


if __name__ == "__main__":
    unittest.main()
