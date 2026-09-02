// Wintergreen cart state — Phase 7. Client-side only (localStorage), no real backend.
// Namespaced on window.WintergreenCart so this can load alongside every page's own script
// (product.js, location.js, etc.) without top-level const/let name collisions.

(function () {
    const STORAGE_KEY = "wintergreen-cart";

    function readCart() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function writeCart(items) {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (e) {
            // Storage unavailable (private browsing, quota) — cart just won't persist.
        }
        updateBadge();
    }

    function add(productId, quantity) {
        const qty = quantity || 1;
        const items = readCart();
        const existing = items.find((i) => i.productId === productId);
        if (existing) {
            existing.quantity += qty;
        } else {
            items.push({ productId, quantity: qty });
        }
        writeCart(items);
    }

    function setQuantity(productId, quantity) {
        let items = readCart();
        if (quantity <= 0) {
            items = items.filter((i) => i.productId !== productId);
        } else {
            const existing = items.find((i) => i.productId === productId);
            if (existing) existing.quantity = quantity;
        }
        writeCart(items);
    }

    function remove(productId) {
        writeCart(readCart().filter((i) => i.productId !== productId));
    }

    function getItems() {
        return readCart();
    }

    function getItemCount() {
        return readCart().reduce((sum, i) => sum + i.quantity, 0);
    }

    function updateBadge() {
        const badge = document.querySelector(".cart-count");
        if (badge) badge.textContent = String(getItemCount());
    }

    window.WintergreenCart = { add, setQuantity, remove, getItems, getItemCount, updateBadge };

    document.addEventListener("DOMContentLoaded", updateBadge);
})();
