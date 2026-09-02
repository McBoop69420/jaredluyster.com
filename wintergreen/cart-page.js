// Wintergreen cart page — Phase 7. Renders window.WintergreenCart's state (localStorage,
// no backend). Checkout is intentionally a dead end — see DESIGN.md §20's 2026-09-02 note.

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

async function render() {
    const products = await fetch("../data/products.json", { cache: "no-store" }).then((r) => r.json());
    const items = window.WintergreenCart.getItems();

    const lineItems = document.getElementById("cart-line-items");
    const empty = document.getElementById("cart-empty");
    const layout = document.getElementById("cart-layout");
    const subtotalEl = document.getElementById("cart-subtotal");

    if (items.length === 0) {
        layout.hidden = true;
        empty.hidden = false;
        return;
    }
    layout.hidden = false;
    empty.hidden = true;

    let subtotalCents = 0;

    lineItems.innerHTML = items.map(({ productId, quantity }) => {
        const product = products.find((p) => p.id === productId);
        if (!product) return "";
        subtotalCents += product.priceCents * quantity;
        return `
            <div class="cart-item" data-product-id="${product.id}">
                <div class="cart-item-media" data-env="${product.environment}" aria-hidden="true"></div>
                <div class="cart-item-info">
                    <a class="cart-item-name" href="/wintergreen/products/${product.id}/">${product.name}</a>
                    <p class="cart-item-variant">${ENVIRONMENT_LABELS[product.environment] || product.environment} &middot; ${SCALE_LABELS[product.scale] || product.scale}</p>
                </div>
                <div class="cart-item-qty">
                    <button type="button" class="qty-btn" data-action="decrement" aria-label="Decrease quantity">&minus;</button>
                    <span class="qty-value">${quantity}</span>
                    <button type="button" class="qty-btn" data-action="increment" aria-label="Increase quantity">+</button>
                </div>
                <p class="cart-item-price">${formatPrice(product.priceCents * quantity)}</p>
                <button type="button" class="cart-item-remove" aria-label="Remove ${product.name}">&times;</button>
            </div>
        `;
    }).join("");

    subtotalEl.textContent = formatPrice(subtotalCents);

    lineItems.querySelectorAll(".cart-item").forEach((row) => {
        const productId = row.dataset.productId;
        const current = items.find((i) => i.productId === productId).quantity;

        row.querySelector('[data-action="increment"]').addEventListener("click", () => {
            window.WintergreenCart.setQuantity(productId, current + 1);
            render();
        });
        row.querySelector('[data-action="decrement"]').addEventListener("click", () => {
            window.WintergreenCart.setQuantity(productId, current - 1);
            render();
        });
        row.querySelector(".cart-item-remove").addEventListener("click", () => {
            window.WintergreenCart.remove(productId);
            render();
        });
    });
}

function wireCheckout() {
    const button = document.getElementById("checkout-btn");
    const note = document.getElementById("checkout-note");
    button.addEventListener("click", () => {
        note.hidden = false;
        button.disabled = true;
        button.textContent = "Checkout Coming Soon";
    });
}

document.addEventListener("DOMContentLoaded", () => {
    render();
    wireCheckout();
});
