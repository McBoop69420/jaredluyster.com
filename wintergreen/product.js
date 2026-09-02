// Wintergreen product detail page — Phase 4. One template (products/index.html) shared by
// every product; the id comes from the URL, not a build step. See functions/_middleware.ts
// for the rewrite that routes /wintergreen/products/<id>/ here.

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

const GALLERY_SHOTS = [
    "Product Shot",
    "In the Environment",
    "Scale Reference",
    "Alternate Angle",
    "Detail Shot",
];

const PX_PER_INCH = 20;
const STANDARD_MINIATURE_HEIGHT_IN = 1.25;

function formatPrice(cents) {
    return `$${(cents / 100).toFixed(2)}`;
}

function getProductIdFromPath() {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const idx = segments.indexOf("products");
    if (idx !== -1 && segments[idx + 1]) return segments[idx + 1];
    return segments[segments.length - 1] || null;
}

function renderGallery(product) {
    const stage = document.getElementById("gallery-stage");
    const thumbs = document.getElementById("gallery-thumbs");

    const setActive = (index) => {
        stage.dataset.env = product.environment;
        stage.querySelector(".gallery-stage-label").textContent = GALLERY_SHOTS[index];
        [...thumbs.children].forEach((el, i) => el.classList.toggle("active", i === index));
    };

    thumbs.innerHTML = GALLERY_SHOTS.map((shot, i) => `
        <button type="button" class="gallery-thumb" data-env="${product.environment}" data-index="${i}" aria-label="${shot}"></button>
    `).join("");

    thumbs.querySelectorAll(".gallery-thumb").forEach((btn) => {
        btn.addEventListener("click", () => setActive(Number(btn.dataset.index)));
    });

    setActive(0);
}

function renderScaleBlock(product) {
    const block = document.getElementById("scale-block");
    const productPx = Math.max(24, Math.round(product.dimensions.heightIn * PX_PER_INCH));
    const miniPx = Math.max(14, Math.round(STANDARD_MINIATURE_HEIGHT_IN * PX_PER_INCH));

    block.innerHTML = `
        <div class="scale-bar">
            <div class="scale-bar-visual product" style="height:${productPx}px"></div>
            <p class="scale-bar-label">${product.name}<br>${product.dimensions.heightIn}"</p>
        </div>
        <div class="scale-bar">
            <div class="scale-bar-visual miniature" style="height:${miniPx}px">
                <svg width="14" height="${miniPx}" viewBox="0 0 16 32" fill="currentColor" aria-hidden="true">
                    <circle cx="8" cy="5" r="4"/>
                    <path d="M2 30 L2 16 Q2 11 8 11 Q14 11 14 16 L14 30 Z"/>
                </svg>
            </div>
            <p class="scale-bar-label">Standard Miniature<br>${STANDARD_MINIATURE_HEIGHT_IN}"</p>
        </div>
    `;
}

function renderAccordions(product, designer) {
    document.getElementById("acc-description").textContent = product.description;

    document.getElementById("acc-dimensions").innerHTML = `
        <div class="dimension-row"><span>Width</span><span>${product.dimensions.widthIn}"</span></div>
        <div class="dimension-row"><span>Depth</span><span>${product.dimensions.depthIn}"</span></div>
        <div class="dimension-row"><span>Height</span><span>${product.dimensions.heightIn}"</span></div>
    `;

    document.getElementById("acc-designer").innerHTML = designer ? `
        <p>Designed by <strong>${designer.name}</strong>. ${designer.tagline}</p>
        <p class="designed-by-note">Designed by ${designer.name} &middot; professionally printed and sold by Wintergreen.</p>
        <a class="btn btn-secondary" href="/wintergreen/designers/${designer.id}/">See more from ${designer.name}</a>
    ` : "<p>Designer information unavailable.</p>";

    document.getElementById("acc-print").innerHTML = `
        <p>Printed in ${product.printMaterial}. Cleaned, cured, and inspected before it ships.</p>
    `;

    document.getElementById("acc-shipping").innerHTML = `
        <p>Wintergreen is an online-only store — every order ships to your door, printed and ready to assemble. Typical turnaround is 3&ndash;5 business days before shipment.</p>
    `;
}

function renderAddToCart() {
    const button = document.getElementById("add-to-cart");
    const confirmation = document.getElementById("add-to-cart-confirmation");
    const cartCount = document.querySelector(".cart-count");

    button.addEventListener("click", () => {
        if (cartCount) cartCount.textContent = String(Number(cartCount.textContent || "0") + 1);
        confirmation.hidden = false;
        confirmation.textContent = "Added to cart.";
        window.clearTimeout(renderAddToCart._t);
        renderAddToCart._t = window.setTimeout(() => { confirmation.hidden = true; }, 2500);
    });
}

async function init() {
    const id = getProductIdFromPath();
    const [products, designers] = await Promise.all([
        fetch("/data/products.json", { cache: "no-store" }).then((r) => r.json()),
        fetch("/data/designers.json", { cache: "no-store" }).then((r) => r.json()),
    ]);

    const product = products.find((p) => p.id === id);
    if (!product) {
        document.getElementById("product-not-found").hidden = false;
        document.getElementById("product-content").hidden = true;
        return;
    }
    const designer = designers.find((d) => d.id === product.designerId) || null;

    document.title = `${product.name} — Wintergreen`;
    document.getElementById("product-eyebrow").textContent = `${ENVIRONMENT_LABELS[product.environment] || product.environment} Terrain`;
    document.getElementById("product-name").textContent = product.name;
    document.getElementById("product-price").textContent = formatPrice(product.priceCents);
    document.getElementById("product-description-short").textContent = product.description;
    document.getElementById("product-dimensions-line").textContent =
        `${product.dimensions.widthIn}"W × ${product.dimensions.depthIn}"D × ${product.dimensions.heightIn}"H`;
    document.getElementById("product-scale-meta").textContent = SCALE_LABELS[product.scale] || product.scale;

    renderGallery(product);
    renderScaleBlock(product);
    renderAccordions(product, designer);
    renderAddToCart();
}

document.addEventListener("DOMContentLoaded", init);
