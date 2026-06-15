// Colors: "W" "U" "B" "R" "G" "Gold" "Land"
// Single-faced:  { src: "images/foo.jpg", caption: "Card Name", color: "W" }
// Double-faced:  { src: "images/foo.jpg", caption: "Front", back: "images/foo_back.jpg", backCaption: "Back", color: "U" }
const IMAGES = [
  { src: "images/Hazy Memory.jpg", caption: "Hazy Memory", color: "U" },
  { src: "images/No Problem.jpg", caption: "No Problem", color: "Gold" },
  { src: "images/Vichicular_Manslaughter_1.png", caption: "Vehicular Manslaughter", color: "B" },
  { src: "images/Pasta_Noche.png", caption: "Pasta Noche", color: "W" },
  { src: "images/Bayou_Peanut_Butter_Swamp.png", caption: "Peanut Butter Swamp", color: "Land" },
  { src: "images/Mountport.jpeg", caption: "Mountport", color: "Land" },
  { src: "images/Brooklyn_Supermarket_.png", caption: "Brooklyn Supermarket", color: "Gold" },
  {
    src: "images/Beedo_Mee-Maw_1.jpg",
    caption: "Beedo Mee-Maw",
    back: "images/Beedo_Mee-Maw_Knife_Witch.jpg",
    backCaption: "Beedo Mee-Maw — Knife Witch",
    color: "R",
  },
];

const COLOR_ORDER = ["W", "U", "B", "R", "G"];
const COLOR_LABELS = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green", Gold: "Multicolor", Land: "Land" };

const gallery   = document.getElementById("gallery");
const emptyMsg  = document.getElementById("empty");
const countEl   = document.getElementById("count");
const lightbox  = document.getElementById("lightbox");
const lbImg     = document.getElementById("lb-img");
const lbCaption = document.getElementById("lb-caption");
const lbFlip    = document.getElementById("lb-flip");

let currentCard = null;
let showingBack = false;

function makeTile(card) {
  const fig = document.createElement("figure");
  fig.className = "tile";
  if (card.back) fig.classList.add("dfc");
  const img = document.createElement("img");
  img.src = card.src;
  img.alt = card.caption;
  img.loading = "lazy";
  const cap = document.createElement("figcaption");
  cap.textContent = card.caption;
  fig.append(img, cap);
  fig.addEventListener("click", () => openLightbox(card));
  return fig;
}

if (IMAGES.length === 0) {
  emptyMsg.hidden = false;
} else {
  countEl.textContent = `${IMAGES.length} card${IMAGES.length !== 1 ? "s" : ""}`;

  // Group cards by color
  const groups = {};
  [...COLOR_ORDER, "Gold", "Land"].forEach(c => (groups[c] = []));
  IMAGES.forEach(card => {
    const key = COLOR_ORDER.includes(card.color) ? card.color
              : card.color === "Land" ? "Land"
              : "Gold";
    groups[key].push(card);
  });

  // ── WUBRG 5-column section ──
  const colSection = document.createElement("div");
  colSection.className = "wubrg-columns";

  COLOR_ORDER.forEach(color => {
    const col = document.createElement("div");
    col.className = "color-col";
    col.dataset.color = color;

    const hdr = document.createElement("div");
    hdr.className = "color-header";
    hdr.textContent = COLOR_LABELS[color];
    col.appendChild(hdr);

    groups[color].forEach(card => col.appendChild(makeTile(card)));
    colSection.appendChild(col);
  });
  gallery.appendChild(colSection);

  // ── Gold and Land row sections ──
  ["Gold", "Land"].forEach(key => {
    if (groups[key].length === 0) return;
    const section = document.createElement("div");
    section.className = "color-section";
    section.dataset.color = key;

    const hdr = document.createElement("div");
    hdr.className = "section-header";
    hdr.textContent = COLOR_LABELS[key];
    section.appendChild(hdr);

    const row = document.createElement("div");
    row.className = "section-row";
    groups[key].forEach(card => row.appendChild(makeTile(card)));
    section.appendChild(row);

    gallery.appendChild(section);
  });
}

function openLightbox(card) {
  currentCard = card;
  showingBack = false;
  lbImg.src = card.src;
  lbCaption.textContent = card.caption;
  lbFlip.hidden = !card.back;
  lbFlip.textContent = "⟳ Flip";
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
}

function flip() {
  if (!currentCard?.back) return;
  showingBack = !showingBack;
  lbImg.src = showingBack ? currentCard.back : currentCard.src;
  lbCaption.textContent = showingBack ? currentCard.backCaption : currentCard.caption;
  lbFlip.textContent = showingBack ? "⟳ Flip Back" : "⟳ Flip";
}

function closeLightbox() {
  lightbox.hidden = true;
  lbImg.src = "";
  currentCard = null;
  document.body.style.overflow = "";
}

document.getElementById("lb-close").addEventListener("click", closeLightbox);
lbFlip.addEventListener("click", flip);
lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
  if (e.key === "f" || e.key === "F") flip();
});
