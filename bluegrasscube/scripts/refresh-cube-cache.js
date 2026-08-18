// Refreshes the cachedName/cachedThumbnail/cachedAt fields in ../data/cubes.json from the
// CubeCobra API. Run manually whenever a cube's CubeCobra name or cover art changes and you
// want the site to pick it up — the site itself never calls CubeCobra, it only reads the
// cached fields this script writes. Commit the resulting data/cubes.json.
//
// Usage: node scripts/refresh-cube-cache.js

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "cubes.json");

async function fetchCubeInfo(id) {
    const res = await fetch(`https://cubecobra.com/cube/api/cubejson/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
        name: (data.name && data.name.trim()) || null,
        thumbnail: (data.image && data.image.uri) || null,
    };
}

async function main() {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const json = JSON.parse(raw);
    const now = new Date().toISOString();

    for (const cube of json.cubes) {
        process.stdout.write(`${cube.id} ... `);
        try {
            const { name, thumbnail } = await fetchCubeInfo(cube.id);
            cube.cachedName = name;
            cube.cachedThumbnail = thumbnail;
            cube.cachedAt = now;
            console.log(`ok (${name || "no name"})`);
        } catch (err) {
            console.log(`FAILED (${err.message}) — leaving previous cached values`);
        }
    }

    fs.writeFileSync(DATA_PATH, JSON.stringify(json, null, 2) + "\n");
    console.log(`\nWrote ${DATA_PATH}`);
}

main();
