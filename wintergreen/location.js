// Wintergreen location detail page — Phase 5. One shared template (locations/index.html)
// for every location, same pattern as product.js. See functions/_middleware.ts.

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
    if (cents === null || cents === undefined) return "Priced individually";
    return `$${(cents / 100).toFixed(2)}`;
}

function getLocationIdFromPath() {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const idx = segments.indexOf("locations");
    return idx !== -1 && segments[idx + 1] ? segments[idx + 1] : null;
}

function renderLocationsIndex(locations) {
    document.title = "Locations — Wintergreen";
    document.getElementById("locations-index-grid").innerHTML = locations.map((l) => `
        <a class="location-index-card env-card" href="/wintergreen/locations/${l.id}/" data-env="${l.environment}">
            <div class="env-card-media" aria-hidden="true"></div>
            <div class="env-card-label">
                <span>${l.name}</span>
                <svg class="env-card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
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

function renderTiers(location) {
    const grid = document.getElementById("tiers-grid");
    const confirmation = document.getElementById("tier-add-confirmation");

    grid.innerHTML = location.tiers.map((tier, i) => {
        const isPrimary = i === 0;
        const pieceCount = tier.productIds.length;
        return `
            <div class="tier-card ${isPrimary ? "tier-card-primary" : ""}">
                ${isPrimary ? '<p class="tier-badge">Recommended</p>' : ""}
                <h3 class="tier-name">${tier.name}</h3>
                <p class="tier-price">${formatPrice(tier.priceCents)}</p>
                <p class="tier-meta">${pieceCount} piece${pieceCount === 1 ? "" : "s"} included</p>
                <button type="button" class="btn ${isPrimary ? "btn-primary" : "btn-secondary"} tier-cta" data-tier="${i}">
                    Add ${tier.name} to Cart
                </button>
            </div>
        `;
    }).join("");

    grid.querySelectorAll(".tier-cta").forEach((btn, i) => {
        btn.addEventListener("click", () => {
            location.tiers[i].productIds.forEach((productId) => window.WintergreenCart.add(productId, 1));
            confirmation.hidden = false;
            confirmation.textContent = "Added to cart.";
            window.clearTimeout(renderTiers._t);
            renderTiers._t = window.setTimeout(() => { confirmation.hidden = true; }, 2500);
        });
    });
}

async function init() {
    const id = getLocationIdFromPath();
    const [locations, products] = await Promise.all([
        fetch("/data/locations.json", { cache: "no-store" }).then((r) => r.json()),
        fetch("/data/products.json", { cache: "no-store" }).then((r) => r.json()),
    ]);

    if (!id) {
        document.getElementById("location-content").hidden = true;
        document.getElementById("location-not-found").hidden = true;
        document.getElementById("locations-index").hidden = false;
        renderLocationsIndex(locations);
        return;
    }

    const location = locations.find((l) => l.id === id);
    if (!location) {
        document.getElementById("location-not-found").hidden = false;
        document.getElementById("location-content").hidden = true;
        return;
    }

    document.title = `${location.name} — Wintergreen`;
    document.getElementById("location-hero").dataset.env = location.environment;
    document.getElementById("location-name").textContent = location.name;
    document.getElementById("location-tagline").textContent = location.tagline;
    document.getElementById("location-story").textContent = location.story;
    document.getElementById("use-case-tags").textContent = location.useCases.join(" · ");

    const included = products.filter((p) => p.locationIds.includes(location.id));
    document.getElementById("included-terrain-grid").innerHTML = included.map(renderProductCard).join("");

    renderTiers(location);
}

document.addEventListener("DOMContentLoaded", init);
