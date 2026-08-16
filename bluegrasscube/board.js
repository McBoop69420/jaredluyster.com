// Bluegrass Cube — index.html rendering. Uses the shared engine in events.js (loaded
// first) to compute what to show, and only handles DOM/fetch/presentation here.
//
// The Announcements engine (renderAnnouncement/renderAnnouncements below) is built but
// currently OFF — Jared felt it didn't make sense yet with only a couple of posts. To
// turn it back on: re-add the #announcements-section markup to index.html (see PLAN.md
// or git history for the Phase 3 commit) and call renderAnnouncements() below.

const ROTATIONS = [-1.5, 1, -0.75, 1.25, -1];

function renderEvent(event, now, index) {
    const card = document.createElement("article");
    card.className = "event-card" + (isPassed(event, now) ? " event-card--passed" : "");
    card.style.setProperty("--tilt", `${ROTATIONS[index % ROTATIONS.length]}deg`);

    const when = document.createElement("p");
    when.className = "event-when";
    when.textContent = `${formatDayDate(event.date)} · ${formatRange(event.start, event.end)}`;

    const what = document.createElement("h3");
    what.className = "event-what";
    what.textContent = event.what;

    const where = document.createElement("p");
    where.className = "event-where";
    if (isRealLocation(event.where)) {
        const whereLink = document.createElement("a");
        whereLink.href = mapsUrl(event.where);
        whereLink.target = "_blank";
        whereLink.rel = "noopener noreferrer";
        whereLink.textContent = event.where;
        where.appendChild(whereLink);
    } else {
        where.textContent = event.where;
    }

    card.append(when, what, where);

    if (event.poster) {
        const img = document.createElement("img");
        img.className = "event-poster";
        img.src = event.poster;
        img.alt = `${event.what} poster`;
        img.loading = "lazy";
        card.appendChild(img);
    }

    return card;
}

function renderAnnouncement(item, now) {
    const tier = recencyTier(item.date, now);
    const seed = `${item.date}::${item.title}`;

    const card = document.createElement("article");
    card.className = "announcement-card" + (tier !== "current" ? ` announcement-card--${tier}` : "");
    if (tier === "current" && item.poster) card.classList.add("announcement-card--featured");
    card.style.setProperty("--tilt", `${seededRotation(seed)}deg`);

    const when = document.createElement("p");
    when.className = "announcement-date";
    when.textContent = formatAnnouncementDate(item.date);

    const titleEl = document.createElement("h3");
    titleEl.className = "announcement-title";
    if (item.link) {
        const a = document.createElement("a");
        a.href = item.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = item.title;
        titleEl.appendChild(a);
    } else {
        titleEl.textContent = item.title;
    }

    card.append(when, titleEl);

    if (item.body) {
        const bodyEl = document.createElement("p");
        bodyEl.className = "announcement-body";
        bodyEl.textContent = item.body;
        card.appendChild(bodyEl);
    }

    if (item.poster) {
        const img = document.createElement("img");
        img.className = "announcement-poster";
        img.src = item.poster;
        img.alt = `${item.title} image`;
        img.loading = "lazy";
        card.appendChild(img);
    }

    return card;
}

function renderEmptyState(container, message) {
    container.innerHTML = "";
    const note = document.createElement("div");
    note.className = "empty-upcoming-note";
    const p = document.createElement("p");
    p.textContent = message;
    note.appendChild(p);
    container.appendChild(note);
}

async function renderUpcomingEvents() {
    const container = document.getElementById("upcoming-events-list");
    if (!container) return;
    try {
        const res = await fetch("data/events.json", { cache: "no-store" });
        if (!res.ok) throw new Error("events.json fetch failed");
        const data = await res.json();
        const now = getEasternNow();
        const events = buildUpcomingEvents(data, now);

        if (events.length === 0) {
            renderEmptyState(container, "Nothing on the board right now.");
            return;
        }
        container.innerHTML = "";
        events.forEach((event, i) => container.appendChild(renderEvent(event, now, i)));
    } catch (err) {
        renderEmptyState(container, "Couldn't load upcoming events.");
    }
}

async function renderAnnouncements() {
    const section = document.getElementById("announcements-section");
    const container = document.getElementById("announcements-grid");
    if (!section || !container) return;
    try {
        const res = await fetch("data/announcements.json", { cache: "no-store" });
        if (!res.ok) throw new Error("announcements.json fetch failed");
        const data = await res.json();
        const now = getEasternNow();
        const items = (data.announcements || [])
            .filter((a) => !a._example)
            .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

        if (items.length === 0) {
            section.style.display = "none";
            return;
        }
        section.style.display = "";
        container.innerHTML = "";
        items.forEach((item) => container.appendChild(renderAnnouncement(item, now)));
    } catch (err) {
        section.style.display = "none";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    renderUpcomingEvents();
    // renderAnnouncements() intentionally not called — see file header comment.
});
