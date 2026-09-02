// Wintergreen site shell — mobile menu + Shop dropdown toggles. Phase 1, no page logic yet.

document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.querySelector(".menu-toggle");
    const mobileMenu = document.getElementById("mobile-menu");

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener("click", () => {
            const open = mobileMenu.classList.toggle("open");
            menuToggle.setAttribute("aria-expanded", String(open));
        });
    }

    document.querySelectorAll(".nav-item.has-dropdown").forEach((item) => {
        const trigger = item.querySelector(".nav-link");
        if (!trigger) return;
        trigger.addEventListener("click", () => {
            const open = item.classList.toggle("open");
            trigger.setAttribute("aria-expanded", String(open));
            document.querySelectorAll(".nav-item.has-dropdown").forEach((other) => {
                if (other !== item) {
                    other.classList.remove("open");
                    other.querySelector(".nav-link")?.setAttribute("aria-expanded", "false");
                }
            });
        });
    });

    document.addEventListener("click", (event) => {
        document.querySelectorAll(".nav-item.has-dropdown.open").forEach((item) => {
            if (!item.contains(event.target)) {
                item.classList.remove("open");
                item.querySelector(".nav-link")?.setAttribute("aria-expanded", "false");
            }
        });
    });
});
