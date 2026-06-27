"""Publish inventory from the Bluegrass POS database to the marketplace website.

Reads collection.db from the MTG Scanner project and writes inventory.json
for the marketplace page to consume.

Usage:
    py publish.py                  # publish all items with quantity > 0
    py publish.py --min-price 1    # only items worth $1+
"""

import argparse
import json
import sqlite3
from pathlib import Path

def _quarter(price):
    return round(price * 4) / 4 if price is not None else None

DB_PATH = Path(r"C:\Users\Jared Server\Software\MTG Scanner\data\collection.db")
OUT_PATH = Path(__file__).resolve().parent / "inventory.json"


def publish(db_path: Path, out_path: Path, *, min_price: float = 0.0) -> int:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        "SELECT * FROM collection_items WHERE quantity > 0 ORDER BY name COLLATE NOCASE, set_code"
    ).fetchall()

    items = []
    for row in rows:
        sell = row["sell_price"]
        market = row["last_price_usd"] if row["last_price_usd"] is not None else row["price_usd_at_scan"]
        price = sell if sell is not None else market
        if price is not None and price < min_price:
            continue

        items.append({
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
        })

    conn.close()

    out_path.write_text(json.dumps(items, indent=2), encoding="utf-8")
    print(f"Published {len(items)} items to {out_path}")
    return len(items)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publish inventory to marketplace")
    parser.add_argument("--min-price", type=float, default=0.0,
                        help="Only include items worth at least this much (default: all)")
    parser.add_argument("--db", type=str, default=str(DB_PATH),
                        help="Path to collection.db")
    parser.add_argument("--out", type=str, default=str(OUT_PATH),
                        help="Output JSON path")
    args = parser.parse_args()
    publish(Path(args.db), Path(args.out), min_price=args.min_price)
