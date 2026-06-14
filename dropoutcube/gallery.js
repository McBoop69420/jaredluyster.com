// Single-faced:  { src: "images/foo.jpg", caption: "Card Name" }
// Double-faced:  { src: "images/foo.jpg", caption: "Front Name", back: "images/foo_back.jpg", backCaption: "Back Name" }
const IMAGES = [
  { src: "images/Hazy Memory.jpg", caption: "Hazy Memory" },
  { src: "images/No Problem.jpg", caption: "No Problem" },
{ src: "images/Vichicular_Manslaughter_1.png", caption: "Vehicular Manslaughter" },
  { src: "images/Pasta_Noche.png", caption: "Pasta Noche" },
  { src: "images/Bayou_Peanut_Butter_Swamp.png", caption: "Peanut Butter Swamp" },
  { src: "images/Mountport.jpeg", caption: "Mountport" },
  { src: "images/Brooklyn_Supermarket_.png", caption: "Brooklyn Supermarket" },
  {
    src: "images/Beedo_Mee-Maw_1.jpg",
    caption: "Beedo Mee-Maw",
    back: "images/Beedo_Mee-Maw_Knife_Witch.jpg",
    backCaption: "Beedo Mee-Maw — Knife Witch",
  },
];

const gallery = document.getElementById("gallery");
const emptyMsg = document.getElementById("empty");
const countEl = document.getElementById("count");
const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lb-img");
const lbCaption = document.getElementById("lb-caption");
const lbFlip = document.getElementById("lb-flip");

let currentCard = null;
let showingBack = false;

if (IMAGES.length === 0) {
  emptyMsg.hidden = false;
} else {
  countEl.textContent = `${IMAGES.length} card${IMAGES.length !== 1 ? "s" : ""}`;

  IMAGES.forEach((card) => {
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
    gallery.appendChild(fig);
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
