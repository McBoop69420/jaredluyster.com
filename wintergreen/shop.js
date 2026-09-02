// Wintergreen shop / product listing page — Phase 3. Client-side filtering over
// data/products.json; no backend, no pagination yet (catalog is small).

const ENVIRONMENT_LABELS = {
    desert: "Desert",
    harbor: "Harbor & Coastal",
    "medieval-town": "Medieval Town",
    "temples-ruins": "Temples & Ruins",
    dungeons: "Dungeons",
    wilderness: "Wilderness",
};

const TYPE_LABELS = {
    buildings: "Buildings",
    terrain: "Terrain",
    scatter: "Scatter",
    "modular-tiles": "Modular Tiles",
    centerpieces: "Centerpieces",
    "encounter-sets": "Encounter Sets",
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

function matchesPriceBracket(cents, bracket) {
    if (!bracket) return true;
    const dollars = cents / 100;
    if (bracket === "under-25") return dollars < 25;
    if (bracket === "25-50") return dollars >= 25 && dollars <= 50;
    if (bracket === "over-50") return dollars > 50;
    return true;
}

function getCheckedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((el) => el.value);
}

function getCheckedRadio(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || null;
}

function applyFiltersFromQuery(products, designers) {
    const params = new URLSearchParams(window.location.search);
    const setChecked = (name, value) => {
        const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
        if (input) input.checked = true;
    };
    if (params.get("environment")) setChecked("environment", params.get("environment"));
    if (params.get("type")) setChecked("type", params.get("type"));
    if (params.get("scale")) setChecked("scale", params.get("scale"));
    if (params.get("designer")) setChecked("designer", params.get("designer"));
}

function renderDesignerFilters(designers) {
    const container = document.getElementById("designer-filter-options");
    container.innerHTML = designers.map((d) => `
        <label><input type="checkbox" name="designer" value="${d.id}"> ${d.name}</label>
    `).join("");
}

function filterProducts(products) {
    const environments = getCheckedValues("environment");
    const types = getCheckedValues("type");
    const scales = getCheckedValues("scale");
    const designerIds = getCheckedValues("designer");
    const priceBracket = getCheckedRadio("price");

    return products.filter((p) => {
        if (environments.length && !environments.includes(p.environment)) return false;
        if (types.length && !types.includes(p.productType)) return false;
        if (scales.length && !scales.includes(p.scale)) return false;
        if (designerIds.length && !designerIds.includes(p.designerId)) return false;
        if (!matchesPriceBracket(p.priceCents, priceBracket)) return false;
        return true;
    });
}

function renderProducts(products) {
    const grid = document.getElementById("product-grid");
    const empty = document.getElementById("shop-empty");
    const count = document.getElementById("result-count");

    count.textContent = `${products.length} terrain piece${products.length === 1 ? "" : "s"}`;
    empty.hidden = products.length > 0;
    grid.hidden = products.length === 0;

    grid.innerHTML = products.map((p) => `
        <a class="product-card" href="/wintergreen/products/${p.id}/">
            <div class="product-card-media" data-env="${p.environment}" aria-hidden="true"></div>
            <div class="product-card-body">
                <p class="product-card-eyebrow">${ENVIRONMENT_LABELS[p.environment] || p.environment} Terrain</p>
                <h3 class="product-card-name">${p.name}</h3>
                <p class="product-card-price">${formatPrice(p.priceCents)}</p>
                <p class="product-card-meta">${SCALE_LABELS[p.scale] || p.scale}</p>
            </div>
        </a>
    `).join("");
}

function updateHeader() {
    const params = new URLSearchParams(window.location.search);
    const title = document.getElementById("shop-title");
    const description = document.getElementById("shop-description");
    const env = params.get("environment");
    const type = params.get("type");
    const scale = params.get("scale");

    if (env && ENVIRONMENT_LABELS[env]) {
        title.textContent = `Shop ${ENVIRONMENT_LABELS[env]} Terrain`;
        description.textContent = `Browse ${ENVIRONMENT_LABELS[env].toLowerCase()} terrain, ready to print and assemble.`;
    } else if (type && TYPE_LABELS[type]) {
        title.textContent = `Shop ${TYPE_LABELS[type]}`;
        description.textContent = `Browse every ${TYPE_LABELS[type].toLowerCase()} piece in the catalog.`;
    } else if (scale && SCALE_LABELS[scale]) {
        title.textContent = `Shop ${SCALE_LABELS[scale]}`;
        description.textContent = `Browse terrain sized for this scale.`;
    }
}

async function init() {
    const [products, designers] = await Promise.all([
        fetch("../data/products.json", { cache: "no-store" }).then((r) => r.json()),
        fetch("../data/designers.json", { cache: "no-store" }).then((r) => r.json()),
    ]);

    renderDesignerFilters(designers);
    applyFiltersFromQuery(products, designers);
    updateHeader();
    renderProducts(filterProducts(products));

    document.querySelectorAll('.filter-sidebar input').forEach((input) => {
        input.addEventListener("change", () => renderProducts(filterProducts(products)));
    });

    document.getElementById("clear-filters").addEventListener("click", () => {
        document.querySelectorAll('.filter-sidebar input').forEach((input) => { input.checked = false; });
        renderProducts(filterProducts(products));
    });

    const drawerToggle = document.getElementById("filter-drawer-toggle");
    const sidebar = document.getElementById("filter-sidebar");
    drawerToggle.addEventListener("click", () => {
        const open = sidebar.classList.toggle("open");
        drawerToggle.setAttribute("aria-expanded", String(open));
    });
}

document.addEventListener("DOMContentLoaded", init);
