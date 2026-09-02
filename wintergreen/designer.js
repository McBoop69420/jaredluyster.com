// Wintergreen designer page — Phase 6. One shared template (designers/index.html) for
// every designer. The attribution box below is deliberately its own visually distinct
// component (not just prose word order) per DESIGN.md §13: never imply the store designed
// the terrain it sells.

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

function renderDesignersIndex(designers) {
    document.title = "Designers — Wintergreen";
    document.getElementById("designers-index-grid").innerHTML = designers.map((d) => `
        <a class="designer-card" href="/wintergreen/designers/${d.id}/">
            <div class="designer-card-media" aria-hidden="true"></div>
            <div class="designer-card-body">
                <h3>${d.name}</h3>
                <p>${d.tagline}</p>
                <span class="designer-card-link">Explore Designs
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
    const id = getIdFromPath("designers");
    const [designers, products] = await Promise.all([
        fetch("/data/designers.json", { cache: "no-store" }).then((r) => r.json()),
        fetch("/data/products.json", { cache: "no-store" }).then((r) => r.json()),
    ]);

    if (!id) {
        document.getElementById("designer-content").hidden = true;
        document.getElementById("designer-not-found").hidden = true;
        document.getElementById("designers-index").hidden = false;
        renderDesignersIndex(designers);
        return;
    }

    const designer = designers.find((d) => d.id === id);
    if (!designer) {
        document.getElementById("designer-not-found").hidden = false;
        document.getElementById("designer-content").hidden = true;
        return;
    }

    document.title = `${designer.name} — Wintergreen`;
    document.getElementById("designer-name").textContent = designer.name;
    document.getElementById("designer-tagline").textContent = designer.tagline;
    document.getElementById("designer-description").textContent = designer.description;
    document.getElementById("attribution-designer-name").textContent = designer.name;
    document.getElementById("designer-categories").textContent =
        designer.categories.map((c) => ENVIRONMENT_LABELS[c] || c).join(" · ");

    const shopLink = document.getElementById("shop-designer-link");
    shopLink.textContent = `Shop ${designer.name} Terrain`;
    shopLink.href = `/wintergreen/shop/?designer=${designer.id}`;

    const included = products.filter((p) => p.designerId === designer.id);
    document.getElementById("designer-product-grid").innerHTML = included.map(renderProductCard).join("");
}

document.addEventListener("DOMContentLoaded", init);
