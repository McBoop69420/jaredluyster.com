# Wintergreen data schema

Static JSON, hand-edited for now (see [CLAUDE.md](../CLAUDE.md) — no backend yet). Each
file is an array of records. IDs are lowercase-hyphenated strings, referenced by other
files instead of nesting — this is what lets a product belong to multiple collections and
locations at once (DESIGN.md §21) instead of one rigid parent.

## `designers.json`

```jsonc
{
  "id": "aether-studios",
  "name": "Aether Studios",
  "tagline": "Fantasy environments built for exploration.",
  "description": "Longer paragraph for the designer page.",
  "logo": "images/designers/aether-studios-logo.png", // optional
  "categories": ["temples-ruins", "wilderness"], // environment slugs this designer covers
  "featured": true // shown in the homepage Featured Designers row (2-4 should be true)
}
```

## `products.json`

```jsonc
{
  "id": "sandstone-watchtower",
  "name": "Sandstone Watchtower",
  "designerId": "aether-studios",
  "environment": "desert",          // one of: desert, harbor, medieval-town, temples-ruins, dungeons, wilderness
  "productType": "buildings",        // one of: buildings, terrain, scatter, modular-tiles, centerpieces, encounter-sets
  "scale": "large",                  // one of: small, medium, large, centerpiece
  "priceCents": 4500,
  "dimensions": { "widthIn": 4, "depthIn": 4, "heightIn": 7.5 },
  "printMaterial": "Commercial-quality resin",
  "description": "Short product description.",
  "images": ["images/products/sandstone-watchtower-1.jpg"],
  "collectionIds": ["desert-settlements"],   // array — can be in more than one
  "locationIds": ["desert-caravanserai"]      // array — can be in more than one
}
```

## `collections.json`

```jsonc
{
  "id": "desert-settlements",
  "name": "Desert Settlements",
  "description": "Everything you need to begin building a desert settlement or expand an existing table.",
  "image": "images/collections/desert-settlements.jpg"
}
```

Products reference a collection by ID in their own `collectionIds` array — a collection
record does not list its products, to avoid keeping two sides of the relationship in sync
by hand.

## `locations.json`

```jsonc
{
  "id": "desert-caravanserai",
  "name": "The Desert Caravanserai",
  "tagline": "A fortified desert outpost built for markets, intrigue, ambushes, and adventure.",
  "story": "Longer paragraph: what the environment supports (social, combat, exploration, markets, inns, ambushes).",
  "heroImage": "images/locations/desert-caravanserai-hero.jpg",
  "environment": "desert", // one of the environment slugs — used to tint the hero placeholder until real photography exists
  "featured": true, // shown in the homepage Featured Location section — exactly one should be true
  "useCases": ["Markets", "Intrigue", "Ambushes", "Exploration"], // short tags shown on the location page's story section
  "stats": { "buildings": 12, "terrainPieces": 34, "expandable": true },
  "tiers": [
    { "name": "Complete Set", "priceCents": 32000, "productIds": ["sandstone-watchtower"] },
    { "name": "Building Bundle", "priceCents": 18000, "productIds": ["sandstone-watchtower"] },
    { "name": "Individual Pieces", "priceCents": null, "productIds": ["sandstone-watchtower"] }
  ]
}
```

Same pattern as collections: products reference a location by ID in `locationIds`; the
location's own `tiers[].productIds` defines what each purchase tier bundles.
