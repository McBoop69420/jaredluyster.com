// Bluegrass Cube — This Week event engine.
// Computes the current Sun–Sat week's events from data/events.json: recurring rules,
// date-specific overrides (cancel/replace), and one-off specials. Times are US Eastern.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ROTATIONS = [-1.5, 1, -0.75, 1.25, -1];
const DAY_MS = 24 * 60 * 60 * 1000;

// Recency thresholds for the community board (DESIGN.md §14 — recency affects visual
// prominence, not existence). current: <=14 days old, full size/contrast. recent:
// <=60 days, slightly quieter. older than that: old, clearly quieter but still shown.
const RECENCY_CURRENT_DAYS = 14;
const RECENCY_RECENT_DAYS = 60;

function getEasternNow() {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    const hour = get("hour");
    return new Date(get("year"), get("month") - 1, get("day"), hour === 24 ? 0 : hour, get("minute"), get("second"));
}

function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function startOfWeek(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function formatTime(t) {
    const [h, m] = t.split(":").map(Number);
    if (h === 12 && m === 0) return { display: "Noon", period: "PM", special: true };
    if (h === 0 && m === 0) return { display: "Midnight", period: "AM", special: true };
    const period = h >= 12 ? "PM" : "AM";
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return { display: m === 0 ? `${h12}` : `${h12}:${String(m).padStart(2, "0")}`, period, special: false };
}

function formatRange(start, end) {
    const s = formatTime(start);
    const e = formatTime(end);
    if (s.period === e.period || s.special) return `${s.display}–${e.display} ${e.period}`;
    return `${s.display} ${s.period}–${e.display} ${e.period}`;
}

function formatDayDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const weekday = date.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
    const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${weekday} · ${monthDay}`;
}

function isPassed(event, now) {
    if (!event.end) return false;
    const [h, m] = event.end.split(":").map(Number);
    const [y, mo, d] = event.date.split("-").map(Number);
    return new Date(y, mo - 1, d, h, m) < now;
}

function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
}

function seededRotation(seed) {
    const options = [-1.5, -1, -0.5, 0.5, 1, 1.5];
    return options[hashString(seed) % options.length];
}

function daysAgo(dateStr, now) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const itemDate = new Date(y, m - 1, d);
    return Math.floor((now - itemDate) / DAY_MS);
}

function recencyTier(dateStr, now) {
    const age = daysAgo(dateStr, now);
    if (age <= RECENCY_CURRENT_DAYS) return "current";
    if (age <= RECENCY_RECENT_DAYS) return "recent";
    return "old";
}

function formatAnnouncementDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

function buildWeekEvents(data, weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const events = [];

    for (const rule of data.recurring) {
        const weekdayIndex = WEEKDAYS.indexOf(rule.weekday.toLowerCase());
        if (weekdayIndex === -1) continue;
        const instanceDate = new Date(weekStart);
        instanceDate.setDate(instanceDate.getDate() + weekdayIndex);
        const dateKey = toDateKey(instanceDate);

        let instance = {
            date: dateKey, what: rule.what, start: rule.start, end: rule.end,
            where: rule.where, poster: rule.poster,
        };

        const override = data.overrides.find(
            (o) => !o._example && o.date === dateKey && o.recurringId === rule.id
        );
        if (override) {
            if (override.action === "cancel") continue;
            if (override.action === "replace") {
                for (const field of ["what", "start", "end", "where", "poster"]) {
                    if (override[field] !== undefined) instance[field] = override[field];
                }
            }
        }
        events.push(instance);
    }

    for (const special of data.specials) {
        if (special._example) continue;
        const specialDate = new Date(`${special.date}T00:00:00`);
        if (specialDate >= weekStart && specialDate <= weekEnd) {
            events.push({
                date: special.date, what: special.what, start: special.start,
                end: special.end, where: special.where, poster: special.poster,
            });
        }
    }

    events.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.start || "").localeCompare(b.start || "")));
    return events;
}

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
    where.textContent = event.where;

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

function renderEmptyWeek(container, message) {
    container.innerHTML = "";
    const note = document.createElement("div");
    note.className = "empty-week-note";
    const p = document.createElement("p");
    p.textContent = message;
    note.appendChild(p);
    container.appendChild(note);
}

async function renderThisWeek() {
    const container = document.getElementById("this-week-events");
    if (!container) return;
    try {
        const res = await fetch("data/events.json", { cache: "no-store" });
        if (!res.ok) throw new Error("events.json fetch failed");
        const data = await res.json();
        const now = getEasternNow();
        const events = buildWeekEvents(data, startOfWeek(now));

        if (events.length === 0) {
            renderEmptyWeek(container, "Nothing on the board this week.");
            return;
        }
        container.innerHTML = "";
        events.forEach((event, i) => container.appendChild(renderEvent(event, now, i)));
    } catch (err) {
        renderEmptyWeek(container, "Couldn't load this week's events.");
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
    renderThisWeek();
    renderAnnouncements();
});
