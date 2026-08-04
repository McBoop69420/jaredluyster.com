"""Publish inventory from the Bluegrass POS database to the live marketplace.

Reads collection.db from the MTG Scanner project and posts it to the
marketplace admin API, which republishes the POS-tracked slice of inventory.

Listings the POS has never tracked -- cards added through the admin quick add or the
Gard Same Chop desktop app -- are carried over rather than wiped. A card the POS does
know about is still republished from the POS, so selling out there still delists it here.
The carry-over itself happens server-side, against whatever is live at publish time.

Every publish keeps the inventory it replaced, so a wrong one can be undone with --restore.
A publish that would cut the shop to less than half its listings -- the shape a half-scanned
POS database takes -- is refused unless --force says it is intended.

Usage:
    py publish.py                  # publish all items with quantity > 0
    py publish.py --min-price 1    # only items worth $1+
    py publish.py --replace        # overwrite everything, ignoring hand-added listings
    py publish.py --force          # publish even if it collapses the shop
    py publish.py --restore        # undo the last publish
"""

import argparse
import os
import sqlite3
from pathlib import Path

import requests

from inventory_carry import printing_key

def _quarter(price):
    return round(price * 4) / 4 if price is not None else None

DB_PATH = Path(r"C:\Users\Jared Server\Software\MTG Scanner\data\collection.db")
DEFAULT_URL = "https://shop.jaredluyster.com"


def _read_pos_rows(db_path: Path, min_price: float = 0.0):
    """Read collection.db and split it into (items to publish, everything the POS knows)."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Every row, not just the stocked ones: a card the POS has sold out of should drop off
    # the site, which means telling "sold out" apart from "the POS never had it".
    rows = conn.execute(
        "SELECT * FROM collection_items ORDER BY name COLLATE NOCASE, set_code"
    ).fetchall()

    items = []
    pos_printings = []
    pos_ids = []
    for row in rows:
        sell = row["sell_price"]
        market = row["last_price_usd"] if row["last_price_usd"] is not None else row["price_usd_at_scan"]
        price = sell if sell is not None else market

        listing = {
            "id": row["id"],
            "name": row["name"],
            "set_code": row["set_code"],
            "collector_number": row["collector_number"],
            "foil": bool(row["foil"]),
            "condition": row["condition"],
            "quantity": row["quantity"],
            "category": row["category"],
            "sell_price": _quarter(sell),
            "market_price": _quarter(market),
            "image_url": row["image_url"],
            "notes": row["notes"] if row["notes"] else None,
        }
        pos_printings.append(printing_key(listing))
        pos_ids.append(int(row["id"]))

        if row["quantity"] <= 0:
            continue
        if price is not None and price < min_price:
            continue
        items.append(listing)

    conn.close()
    return items, pos_printings, pos_ids


def _post(base_url: str, endpoint: str, api_key: str, payload: dict) -> dict:
    resp = requests.post(base_url.rstrip("/") + endpoint, json=payload,
                         headers={"X-Publish-Key": api_key}, timeout=30)
    # A refused publish answers 409 with an explanation, which is worth more than the status.
    if resp.status_code not in (200, 409):
        resp.raise_for_status()
    result = resp.json()
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Publish failed"))
    return result


def publish(db_path: Path, *, min_price: float = 0.0, replace: bool = False, force: bool = False,
            base_url: str = DEFAULT_URL, api_key: str = "") -> int:
    items, pos_printings, pos_ids = _read_pos_rows(db_path, min_price)

    result = _post(base_url, "/marketplace/api/admin/inventory/bulk-publish", api_key,
                   {"items": items, "pos_printings": pos_printings, "pos_ids": pos_ids,
                    "replace": replace, "force": force})

    print(f"Published {result['published']} items to {base_url}")
    if result.get("carried"):
        print(f"Carried over {result['carried']} hand-added listing(s) the POS does not track")
    return result["total"]


def restore(*, base_url: str = DEFAULT_URL, api_key: str = "") -> int:
    """Undo the last publish, putting back the inventory it replaced."""
    result = _post(base_url, "/marketplace/api/admin/inventory/restore", api_key, {})
    print(f"Restored {result['restored']} listing(s) from the snapshot taken {result['taken_at']}")
    print(f"The {result['replaced']} listing(s) just replaced were kept, so this can be undone too")
    return result["restored"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publish inventory to marketplace")
    parser.add_argument("--min-price", type=float, default=0.0,
                        help="Only include items worth at least this much (default: all)")
    parser.add_argument("--db", type=str, default=str(DB_PATH),
                        help="Path to collection.db")
    parser.add_argument("--url", type=str, default=DEFAULT_URL,
                        help="Marketplace base URL")
    parser.add_argument("--api-key", type=str, default=os.environ.get("MARKETPLACE_PUBLISH_KEY", ""),
                        help="Publish API key (defaults to MARKETPLACE_PUBLISH_KEY env var)")
    parser.add_argument("--replace", action="store_true",
                        help="Overwrite everything, dropping listings added outside the POS")
    parser.add_argument("--force", action="store_true",
                        help="Publish even if it would cut the shop to less than half its listings")
    parser.add_argument("--restore", action="store_true",
                        help="Undo the last publish instead of publishing")
    args = parser.parse_args()
    if not args.api_key:
        parser.error("An API key is required: pass --api-key or set MARKETPLACE_PUBLISH_KEY")
    if args.restore:
        restore(base_url=args.url, api_key=args.api_key)
    else:
        publish(Path(args.db), min_price=args.min_price, replace=args.replace, force=args.force,
                base_url=args.url, api_key=args.api_key)
