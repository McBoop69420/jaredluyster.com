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
        // priority:"low" (Chromium) keeps these ~9 multi-hundred-KB responses from
        // competing with the page's actually-critical resources on a slow connection —
        // matters regardless of exactly when the fetch fires, unlike the scroll-based
        // deferral below, which a short Upcoming Events list can render moot.
        const res = await fetch(`https://cubecobra.com/cube/api/cubejson/${id}`, { priority: "low" });
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
        // One batched DOM write (a fragment) instead of 9 separate appendChild calls —
        // each of those triggers its own layout pass, adding up to real main-thread
        // blocking time right when this data lands.
        const fragment = document.createDocumentFragment();
        merged.forEach((cube) => fragment.appendChild(renderCubeCard(cube)));
        container.appendChild(fragment);
    } catch (err) {
        if (statusEl) statusEl.textContent = "Couldn't load the cube directory.";
    }
}

// Cubes sits below the fold, but its 9 CubeCobra fetches each return the cube's full
// card list (each response commonly runs into the hundreds of KB) — fetching + parsing
// + rendering all of them immediately on page load, before anyone has scrolled anywhere
// near this section, was tanking initial load performance. Two layers: intersection
// (don't bother at all if no one's scrolled anywhere close — real below-fold pages
// never pay this cost) and requestIdleCallback (a short Upcoming Events list can put
// #cubes close enough to the fold that the observer fires immediately, so this is what
// actually keeps the JSON-parsing/DOM work from competing with critical initial render,
// regardless of timing).
function scheduleRenderCubes() {
    if ("requestIdleCallback" in window) {
        requestIdleCallback(renderCubes, { timeout: 2000 });
    } else {
        renderCubes();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const section = document.getElementById("cubes");
    if (!section) return;
    if (!("IntersectionObserver" in window)) {
        scheduleRenderCubes();
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        scheduleRenderCubes();
    }, { rootMargin: "50px" });
    observer.observe(section);
});
