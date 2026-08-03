"""Tests for carrying hand-added listings through a POS publish."""

import unittest

from inventory_carry import MANUAL_ID_BASE, carry_over, printing_key


def listing(**overrides):
    item = {"id": 1, "name": "Opt", "set_code": "DOM", "collector_number": "60", "foil": False,
            "condition": "Near Mint", "quantity": 1, "category": "MTG Card", "sell_price": None,
            "market_price": 0.25, "image_url": None, "notes": None}
    item.update(overrides)
    return item


class CarryOverTests(unittest.TestCase):
    def test_hand_added_listing_survives_a_publish(self):
        existing = [listing(id=MANUAL_ID_BASE, name="Sealed Booster Box", set_code="LTR",
                            collector_number="BOX", market_price=99.0)]
        kept = carry_over(existing, pos_printings=[("dom", "60", False)], pos_ids=[1])
        self.assertEqual([item["name"] for item in kept], ["Sealed Booster Box"])
        self.assertEqual(kept[0]["id"], MANUAL_ID_BASE, "a non-clashing id should stay put")

    def test_pos_card_that_sold_out_is_still_delisted(self):
        # The POS still knows about this printing (it showed up in a scan, just at qty 0),
        # so a previously-published copy should not be treated as hand-added and kept.
        existing = [listing(id=3, name="Ancestral Vision", set_code="TSP", collector_number="45")]
        kept = carry_over(existing, pos_printings=[("tsp", "45", False)], pos_ids=[3])
        self.assertEqual(kept, [])

    def test_matching_is_per_printing_not_per_name(self):
        existing = [listing(id=MANUAL_ID_BASE, name="Opt", set_code="ELD", collector_number="59")]
        kept = carry_over(existing, pos_printings=[("dom", "60", False)], pos_ids=[1])
        self.assertEqual([item["set_code"] for item in kept], ["ELD"])

    def test_foil_and_nonfoil_are_different_listings(self):
        existing = [listing(id=MANUAL_ID_BASE, name="Opt", set_code="DOM",
                            collector_number="60", foil=True)]
        kept = carry_over(existing, pos_printings=[("dom", "60", False)], pos_ids=[1])
        self.assertEqual(len(kept), 1, "the foil printing was never seen by the POS")

    def test_a_clashing_id_is_renumbered_out_of_the_pos_range(self):
        existing = [listing(id=2, name="Playmat", set_code="ACC", collector_number="PM1")]
        kept = carry_over(existing, pos_printings=[("dom", "60", False)], pos_ids=[1, 2, 3])
        self.assertGreaterEqual(kept[0]["id"], MANUAL_ID_BASE)

    def test_non_clashing_id_is_left_alone(self):
        existing = [listing(id=MANUAL_ID_BASE + 5, name="Playmat", set_code="ACC", collector_number="PM1")]
        kept = carry_over(existing, pos_printings=[("dom", "60", False)], pos_ids=[1, 2, 3])
        self.assertEqual(kept[0]["id"], MANUAL_ID_BASE + 5)

    def test_zero_quantity_listings_are_not_carried_over(self):
        existing = [listing(id=MANUAL_ID_BASE, name="Playmat", set_code="ACC",
                            collector_number="PM1", quantity=0)]
        kept = carry_over(existing, pos_printings=[], pos_ids=[])
        self.assertEqual(kept, [])

    def test_printing_key_ignores_case_and_whitespace(self):
        self.assertEqual(
            printing_key({"set_code": " Dom ", "collector_number": "60", "foil": False}),
            printing_key({"set_code": "dom", "collector_number": "60", "foil": False}),
        )


if __name__ == "__main__":
    unittest.main()
