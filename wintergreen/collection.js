// Wintergreen collection page — Phase 6. One shared template (collections/index.html) for
// every collection, same pattern as location.js/product.js.

const ENVIRONMENT_LABELS = {
    desert: "Desert",
    harbor: "Harbor & Coastal",
    "medieval-town": "Medieval Town",
    "temples-ruins": "Temples & Ruins",
    dungeons: "Dungeons",
    wilderness: "Wilderness",
};

const SCALE_LABELS = {
    small: "Small Terrain",
    medium: "Medium Terrain",
    large: "Large Terrain",
    centerpiece: "Table Centerpiece",
};

function formatPrice(cents) {
    return `$${(cents / 100).toFixed(2)}`;
}

function getIdFromPath(segmentName) {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const idx = segments.indexOf(segmentName);
    return idx !== -1 && segments[idx + 1] ? segments[idx + 1] : null;
}

function renderCollectionsIndex(collections) {
    document.title = "Collections — Wintergreen";
    document.getElementById("collections-index-grid").innerHTML = collections.map((c) => `
        <a class="collection-index-card designer-card" href="/wintergreen/collections/${c.id}/">
            <div class="designer-card-media" aria-hidden="true"></div>
            <div class="designer-card-body">
                <h3>${c.name}</h3>
                <p>${c.description}</p>
                <span class="designer-card-link">Browse Collection
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </span>
            </div>
        </a>
    `).join("");
}

function renderProductCard(p) {
    return `
        <a class="product-card" href="/wintergreen/products/${p.id}/">
            <div class="product-card-media" data-env="${p.environment}" aria-hidden="true"></div>
            <div class="product-card-body">
                <p class="product-card-eyebrow">${ENVIRONMENT_LABELS[p.environment] || p.environment} Terrain</p>
                <h3 class="product-card-name">${p.name}</h3>
                <p class="product-card-price">${formatPrice(p.priceCents)}</p>
                <p class="product-card-meta">${SCALE_LABELS[p.scale] || p.scale}</p>
            </div>
        </a>
    `;
}

async function init() {
    const id = getIdFromPath("collections");
    const [collections, products] = await Promise.all([
        fetch("/data/collections.json", { cache: "no-store" }).then((r) => r.json()),
        fetch("/data/products.json", { cache: "no-store" }).then((r) => r.json()),
    ]);

    if (!id) {
        document.getElementById("collection-content").hidden = true;
        document.getElementById("collection-not-found").hidden = true;
        document.getElementById("collections-index").hidden = false;
        renderCollectionsIndex(collections);
        return;
    }

    const collection = collections.find((c) => c.id === id);
    if (!collection) {
        document.getElementById("collection-not-found").hidden = false;
        document.getElementById("collection-content").hidden = true;
        return;
    }

    document.title = `${collection.name} — Wintergreen`;
    document.getElementById("collection-title").textContent = collection.name;
    document.getElementById("collection-description").textContent = collection.description;

    const included = products.filter((p) => p.collectionIds.includes(collection.id));
    const grid = document.getElementById("collection-product-grid");
    const empty = document.getElementById("collection-empty");
    grid.innerHTML = included.map(renderProductCard).join("");
    grid.hidden = included.length === 0;
    empty.hidden = included.length > 0;
}

document.addEventListener("DOMContentLoaded", init);
