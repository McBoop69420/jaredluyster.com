// Bluegrass Cube — This Week event engine.
// Computes the current Sun–Sat week's events from data/events.json: recurring rules,
// date-specific overrides (cancel/replace), and one-off specials. Times are US Eastern.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ROTATIONS = [-1.5, 1, -0.75, 1.25, -1];

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

document.addEventListener("DOMContentLoaded", renderThisWeek);
