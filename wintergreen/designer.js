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
    if (idx !== -1 && segments[idx + 1]) return segments[idx + 1];
    return segments[segments.length - 1] || null;
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
