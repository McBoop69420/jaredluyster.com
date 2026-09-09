"""Shared logic for carrying hand-added listings through a POS publish.

Used by both publish.py (builds the POS side of a publish) and server.py
(applies a publish against the live inventory store).
"""

# Hand-added listings are numbered from here up, above anything the POS will allocate.
MANUAL_ID_BASE = 1_000_000


def printing_key(item):
    """What makes a listing the same card: set, collector number, and finish."""
    return (str(item.get("set_code") or "").strip().casefold(),
            str(item.get("collector_number") or "").strip().casefold(),
            bool(item.get("foil")))


def carry_over(existing, pos_printings, pos_ids):
    """Keep listings the POS has never seen, renumbering only where a POS id would clash."""
    pos_printings = set(tuple(p) for p in pos_printings)
    pos_ids = set(int(i) for i in pos_ids)

    kept = [dict(item) for item in existing
            if int(item.get("quantity") or 0) > 0 and printing_key(item) not in pos_printings]

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
