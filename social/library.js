// R2-backed library: talks to functions/social/api/[[path]].ts and renders the grid.

const API_BASE = "/social/api/assets";

function assetUrl(project, filename) {
  return `${API_BASE}/${encodeURIComponent(project)}/${encodeURIComponent(filename)}`;
}

async function fetchLibrary(project) {
  const qs = project && project !== "all" ? `?project=${encodeURIComponent(project)}` : "";
  const res = await fetch(`${API_BASE}${qs}`);
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  const data = await res.json();
  return data.items;
}

async function uploadAsset(project, filename, blob, meta) {
  const params = new URLSearchParams();
  if (meta?.title) params.set("title", meta.title);
  if (meta?.platform) params.set("platform", meta.platform);
  const res = await fetch(`${assetUrl(project, filename)}?${params}`, {
    method: "PUT",
    headers: { "content-type": blob.type || "image/png" },
    body: blob,
  });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json();
}

async function uploadDesign(project, filename, design) {
  const body = JSON.stringify(design);
  const res = await fetch(assetUrl(project, `${filename}.json`), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!res.ok) throw new Error(`design save failed: ${res.status}`);
}

async function fetchDesign(project, filename) {
  const res = await fetch(assetUrl(project, `${filename}.json`));
  if (!res.ok) throw new Error(`design fetch failed: ${res.status}`);
  return res.json();
}

async function deleteLibraryAsset(project, filename) {
  const res = await fetch(assetUrl(project, filename), { method: "DELETE" });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
}

function projectLabel(slug) {
  const known = PROJECTS.find((p) => p.slug === slug);
  return known ? known.label : slug;
}

function renderLibraryGrid(container, items, handlers) {
  container.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "library-empty";
    empty.textContent = "Nothing saved yet — craft something and hit Save to Library.";
    container.appendChild(empty);
    return;
  }

  for (const item of items) {
    const card = document.createElement("div");
    card.className = "asset-card";

    const img = document.createElement("img");
    img.src = assetUrl(item.project, item.filename);
    img.alt = item.title;
    img.loading = "lazy";
    card.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "asset-meta";
    const title = document.createElement("strong");
    title.textContent = item.title;
    meta.appendChild(title);

    const tags = document.createElement("div");
    tags.className = "asset-tags";
    const projectTag = document.createElement("span");
    projectTag.className = "tag";
    projectTag.textContent = projectLabel(item.project);
    tags.appendChild(projectTag);
    if (item.platform) {
      const platformTag = document.createElement("span");
      platformTag.className = "tag tag-muted";
      platformTag.textContent = item.platform;
      tags.appendChild(platformTag);
    }
    meta.appendChild(tags);
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "asset-actions";

    const download = document.createElement("a");
    download.className = "button button-secondary button-sm";
    download.textContent = "Download";
    download.href = assetUrl(item.project, item.filename);
    download.download = item.filename;
    actions.appendChild(download);

    if (item.hasDesign) {
      const edit = document.createElement("button");
      edit.className = "button button-secondary button-sm";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => handlers.onEdit(item));
      actions.appendChild(edit);
    }

    const del = document.createElement("button");
    del.className = "button button-secondary button-sm button-danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => handlers.onDelete(item));
    actions.appendChild(del);

    card.appendChild(actions);
    container.appendChild(card);
  }
}
