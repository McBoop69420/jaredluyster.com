"""Publish inventory from the Bluegrass POS database to the marketplace website.

Reads collection.db from the MTG Scanner project and writes inventory.json
for the marketplace page to consume.

Listings the POS has never tracked -- cards added through the admin quick add or the
Gard Same Chop desktop app -- are carried over rather than wiped. A card the POS does
know about is still republished from the POS, so selling out there still delists it here.

Usage:
    py publish.py                  # publish all items with quantity > 0
    py publish.py --min-price 1    # only items worth $1+
    py publish.py --replace        # overwrite everything, ignoring hand-added listings
"""

import argparse
import json
import shutil
import sqlite3
from pathlib import Path

def _quarter(price):
    return round(price * 4) / 4 if price is not None else None

DB_PATH = Path(r"C:\Users\Jared Server\Software\MTG Scanner\data\collection.db")
OUT_PATH = Path(__file__).resolve().parent / "inventory.json"

# Hand-added listings are numbered from here up, above anything the POS will allocate.
MANUAL_ID_BASE = 1_000_000


def _printing(item):
    """What makes a listing the same card: set, collector number, and finish."""
    return (str(item.get("set_code") or "").strip().casefold(),
            str(item.get("collector_number") or "").strip().casefold(),
            bool(item.get("foil")))


def _read_existing(out_path):
    try:
        listings = json.loads(out_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return listings if isinstance(listings, list) else []


def _carry_over(existing, pos_printings, pos_ids):
    """Keep listings the POS has never seen, renumbering only where a POS id would clash."""
    kept = [dict(item) for item in existing
            if int(item.get("quantity") or 0) > 0 and _printing(item) not in pos_printings]

    # Reserve the ids that can stay as they are, so carts and past orders still point at
    # the same card, then hand out fresh ones only to the listings that clash.
    taken = set(pos_ids)
    keeps_its_id = set()
    for item in kept:
        item_id = int(item.get("id") or 0)
        if item_id and item_id not in taken:
            taken.add(item_id)
            keeps_its_id.add(id(item))

    next_id = max([*taken, MANUAL_ID_BASE - 1]) + 1
    for item in kept:
        if id(item) not in keeps_its_id:
            while next_id in taken:
                next_id += 1
            item["id"] = next_id
            taken.add(next_id)
    return kept


def _write(out_path, listings):
    """Back up, then swap the file in atomically -- the storefront reads it live."""
    if out_path.exists():
        shutil.copy2(out_path, out_path.with_name(out_path.name + ".bak"))
    temporary = out_path.with_name(out_path.name + ".tmp")
    temporary.write_text(json.dumps(listings, indent=2), encoding="utf-8")
    temporary.replace(out_path)


def publish(db_path: Path, out_path: Path, *, min_price: float = 0.0, replace: bool = False) -> int:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    # Every row, not just the stocked ones: a card the POS has sold out of should drop off
    # the site, which means telling "sold out" apart from "the POS never had it".
    rows = conn.execute(
        "SELECT * FROM collection_items ORDER BY name COLLATE NOCASE, set_code"
    ).fetchall()

    items = []
    pos_printings = set()
    pos_ids = set()
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
        pos_printings.add(_printing(listing))
        pos_ids.add(int(row["id"]))

        if row["quantity"] <= 0:
            continue
        if price is not None and price < min_price:
            continue
        items.append(listing)

    conn.close()

    carried = [] if replace else _carry_over(_read_existing(out_path), pos_printings, pos_ids)
    listings = sorted(items + carried,
                      key=lambda item: (str(item.get("name") or "").lower(), str(item.get("set_code") or "")))
    _write(out_path, listings)

    print(f"Published {len(items)} items to {out_path}")
    if carried:
        print(f"Carried over {len(carried)} hand-added listing(s) the POS does not track")
    return len(listings)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publish inventory to marketplace")
    parser.add_argument("--min-price", type=float, default=0.0,
                        help="Only include items worth at least this much (default: all)")
    parser.add_argument("--db", type=str, default=str(DB_PATH),
                        help="Path to collection.db")
    parser.add_argument("--out", type=str, default=str(OUT_PATH),
                        help="Output JSON path")
    parser.add_argument("--replace", action="store_true",
                        help="Overwrite everything, dropping listings added outside the POS")
    args = parser.parse_args()
    publish(Path(args.db), Path(args.out), min_price=args.min_price, replace=args.replace)
