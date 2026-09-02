// Wintergreen site shell — mobile menu toggle.

document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.querySelector(".menu-toggle");
    const mobileMenu = document.getElementById("mobile-menu");

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener("click", () => {
            const open = mobileMenu.classList.toggle("open");
            menuToggle.setAttribute("aria-expanded", String(open));
        });
    }
});
