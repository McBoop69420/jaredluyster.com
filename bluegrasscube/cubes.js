// Bluegrass Cube — Cubes section of index.html. data/cubes.json is the source of truth
// (id, pinned, nameOverride, thumbnail, strategy); CubeCobra's API is used only to fill
// in a display name and cover-art thumbnail when the local data doesn't already have
// them. Every card's link is built from the local id alone, so the directory always
// renders with working links even if CubeCobra is unreachable.
//
// Uses hashString/seededRotation from events.js (loaded first on index.html) rather
// than redefining them here.

async function fetchCubeInfo(id) {
    try {
        const res = await fetch(`https://cubecobra.com/cube/api/cubejson/${id}`);
        if (!res.ok) throw new Error(`CubeCobra returned ${res.status}`);
        const data = await res.json();
        return {
            name: data.name || null,
            thumbnail: (data.image && data.image.uri) || null,
        };
    } catch (err) {
        return { name: null, thumbnail: null };
    }
}

function renderCubeCard(cube) {
    const name = cube.nameOverride || cube.apiName || cube.id;
    const thumbnail = cube.thumbnail || cube.apiThumbnail;

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

        const apiResults = await Promise.all(cubes.map((cube) => fetchCubeInfo(cube.id)));
        const merged = cubes.map((cube, i) => ({
            ...cube,
            apiName: apiResults[i].name,
            apiThumbnail: apiResults[i].thumbnail,
        }));

        merged.sort((a, b) => {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
            const nameA = (a.nameOverride || a.apiName || a.id).toLowerCase();
            const nameB = (b.nameOverride || b.apiName || b.id).toLowerCase();
            return nameA.localeCompare(nameB);
        });

        if (statusEl) statusEl.remove();
        container.innerHTML = "";
        merged.forEach((cube) => container.appendChild(renderCubeCard(cube)));
    } catch (err) {
        if (statusEl) statusEl.textContent = "Couldn't load the cube directory.";
    }
}

document.addEventListener("DOMContentLoaded", renderCubes);
