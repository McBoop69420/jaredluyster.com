// Wintergreen homepage — Phase 2. Renders Shop by Environment (static list, DESIGN.md §6),
// Featured Location, and Featured Designers (both data-driven from data/*.json).

const ENVIRONMENTS = [
    { slug: "desert", name: "Desert" },
    { slug: "harbor", name: "Harbor" },
    { slug: "medieval-town", name: "Medieval Town" },
    { slug: "temples-ruins", name: "Temples & Ruins" },
    { slug: "dungeons", name: "Dungeons" },
    { slug: "wilderness", name: "Wilderness" },
];

function renderEnvironmentGrid() {
    const grid = document.getElementById("env-grid");
    if (!grid) return;
    grid.innerHTML = ENVIRONMENTS.map(({ slug, name }) => `
        <a class="env-card" href="/wintergreen/shop/?environment=${slug}" data-env="${slug}">
            <div class="env-card-media" aria-hidden="true"></div>
            <div class="env-card-label">
                <span>${name}</span>
                <svg class="env-card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </div>
        </a>
    `).join("");
}

async function renderFeaturedLocation() {
    const section = document.getElementById("featured-location");
    if (!section) return;
    const locations = await fetch("data/locations.json", { cache: "no-store" }).then((r) => r.json());
    const location = locations.find((l) => l.featured) || locations[0];
    if (!location) { section.remove(); return; }

    const { buildings, terrainPieces, expandable } = location.stats;
    section.innerHTML = `
        <div class="featured-location-media" data-env="${location.id}" aria-hidden="true"></div>
        <div class="featured-location-content">
            <p class="eyebrow">Featured Location</p>
            <h2>${location.name}</h2>
            <p class="featured-location-tagline">${location.tagline}</p>
            <a class="btn btn-primary" href="/wintergreen/locations/${location.id}/">Explore the Location</a>
            <p class="featured-location-stats">${buildings} BUILDINGS &middot; ${terrainPieces} TERRAIN PIECES &middot; ${expandable ? "FULLY EXPANDABLE" : ""}</p>
        </div>
    `;
}

async function renderFeaturedDesigners() {
    const grid = document.getElementById("designers-grid");
    if (!grid) return;
    const designers = await fetch("data/designers.json", { cache: "no-store" }).then((r) => r.json());
    const featured = designers.filter((d) => d.featured).slice(0, 4);
    if (featured.length === 0) { grid.closest("section")?.remove(); return; }

    grid.innerHTML = featured.map((d) => `
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

document.addEventListener("DOMContentLoaded", () => {
    renderEnvironmentGrid();
    renderFeaturedLocation();
    renderFeaturedDesigners();
});
