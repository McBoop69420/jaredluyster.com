// DOM rendering for packs, pools and results. Takes resolved card objects, so it works
// the same for a local draft and for a pack handed down by the server.

import { COLOR_ORDER, groupKey } from "./draft.js";

const GROUP_ORDER = [...COLOR_ORDER, "M", "C", "L"];
const GROUP_LABELS = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  M: "Multicolor",
  C: "Colorless",
  L: "Land",
};

export function plural(count, noun) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function costLabel(card) {
  if (card.isLand && card.colors.length === 0) {
    return "Land";
  }
  return `${card.cmc} · ${card.colors.length ? card.colors.join("") : "C"}`;
}

// `onPick` receives the array position, never the card id: an undersized cube can deal
// the same card twice into one pack, so position is the only unambiguous handle.
export function renderCardGrid(container, template, cards, onPick) {
  container.textContent = "";

  cards.forEach((card, index) => {
    const tile = template.content.cloneNode(true);
    const button = tile.querySelector(".card-button");
    const image = tile.querySelector("img");

    image.src = card.image;
    image.alt = card.name;
    tile.querySelector(".card-name").textContent = card.name;
    tile.querySelector(".card-cost").textContent = costLabel(card);

    if (onPick) {
      button.title = `Pick ${card.name}`;
      button.addEventListener("click", () => onPick(index));
    } else {
      button.disabled = true;
    }

    container.append(tile);
  });
}

export function renderPool(listElement, countElement, cards) {
  if (countElement) {
    countElement.textContent = plural(cards.length, "card");
  }

  listElement.textContent = "";

  for (const [group, groupCards] of groupPool(cards)) {
    const section = document.createElement("section");
    section.className = "pool-group";

    const heading = document.createElement("h3");
    heading.textContent = `${GROUP_LABELS[group]} (${groupCards.length})`;
    section.append(heading);

    const list = document.createElement("ul");
    for (const card of groupCards) {
      const item = document.createElement("li");
      item.textContent = card.name;
      item.title = `${card.name} — ${costLabel(card)}`;
      list.append(item);
    }

    section.append(list);
    listElement.append(section);
  }
}

function groupPool(cards) {
  const groups = new Map();

  for (const card of cards) {
    const key = groupKey(card);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(card);
  }

  for (const groupCards of groups.values()) {
    groupCards.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
  }

  return [...groups].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
}

export function sortForResults(cards) {
  return cards
    .slice()
    .sort(
      (a, b) =>
        GROUP_ORDER.indexOf(groupKey(a)) - GROUP_ORDER.indexOf(groupKey(b)) ||
        a.cmc - b.cmc ||
        a.name.localeCompare(b.name)
    );
}

export function decklistText(cards) {
  const counts = new Map();

  for (const card of cards) {
    counts.set(card.name, (counts.get(card.name) || 0) + 1);
  }

  return [...counts].map(([name, count]) => `${count} ${name}`).join("\n");
}
