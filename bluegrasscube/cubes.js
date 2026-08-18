// Bluegrass Cube — Cubes section of index.html. data/cubes.json is the source of truth
// (id, pinned, nameOverride, thumbnail, strategy) plus cachedName/cachedThumbnail, which
// scripts/refresh-cube-cache.js fills in from CubeCobra's API ahead of time. The page
// itself never calls CubeCobra — it only reads this one local JSON file, so the section
// renders instantly instead of waiting on 9 live multi-hundred-KB API responses. Re-run
// the script and commit whenever a cube's CubeCobra name or cover art changes.
//
// Uses hashString/seededRotation from events.js (loaded first on index.html) rather
// than redefining them here.

function renderCubeCard(cube) {
    const name = cube.nameOverride || cube.cachedName || cube.id;
    const thumbnail = cube.thumbnail || cube.cachedThumbnail;

    const card = document.createElement("a");
    card.className = "cube-card";
    card.href = `https://cubecobra.com/cube/list/${cube.id}`;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.style.setProperty("--tilt", `${seededRotation(cube.id)}deg`);

    if (thumbnail) {
        const img = document.createElement("img");
        img.className = "cube-thumb";
        img.src = thumbnail;
        img.alt = "";
        img.loading = "lazy";
        card.appendChild(img);
    }

    const nameEl = document.createElement("h3");
    nameEl.className = "cube-name";
    nameEl.textContent = name;
    card.appendChild(nameEl);

    if (cube.strategy) {
        const strategyEl = document.createElement("p");
        strategyEl.className = "cube-strategy";
        strategyEl.textContent = cube.strategy;
        card.appendChild(strategyEl);
    }

    const linkEl = document.createElement("span");
    linkEl.className = "cube-link";
    linkEl.textContent = "View on CubeCobra ↗";
    card.appendChild(linkEl);

    return card;
}

async function renderCubes() {
    const container = document.getElementById("cubes-grid");
    const statusEl = document.getElementById("cubes-status");
    if (!container) return;

    try {
        const res = await fetch("data/cubes.json", { cache: "no-store" });
        if (!res.ok) throw new Error("cubes.json fetch failed");
        const data = await res.json();
        const cubes = data.cubes || [];

        const sorted = [...cubes].sort((a, b) => {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            const nameA = (a.nameOverride || a.cachedName || a.id).toLowerCase();
            const nameB = (b.nameOverride || b.cachedName || b.id).toLowerCase();
            return nameA.localeCompare(nameB);
        });

        if (statusEl) statusEl.remove();
        container.innerHTML = "";
        const fragment = document.createDocumentFragment();
        sorted.forEach((cube) => fragment.appendChild(renderCubeCard(cube)));
        container.appendChild(fragment);
    } catch (err) {
        if (statusEl) statusEl.textContent = "Couldn't load the cube directory.";
    }
}

document.addEventListener("DOMContentLoaded", renderCubes);
