// Bluegrass Cube — shared event engine (no DOM). Pure data functions for resolving
// recurring rules + date overrides + specials into concrete event instances, plus small
// date/time formatting helpers. Loaded by both board.js (index.html) and calendar.js
// (calendar.html) so both pages compute the schedule identically from the same data.

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
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

function formatAnnouncementDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
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

function applyOverrideFields(instance, override) {
    for (const field of ["what", "start", "end", "where", "poster"]) {
        if (override[field] !== undefined) instance[field] = override[field];
    }
}

// Generates every recurring-rule instance whose date falls within [rangeStart, rangeEnd]
// (inclusive, both Date objects at local midnight), with same-date overrides applied.
// Cancelled instances are included with cancelled:true rather than dropped, so callers
// that want to show "cancelled" (e.g. the calendar) can, and callers that want to hide
// it (e.g. Upcoming Events) can filter it out themselves.
function resolveRecurringInRange(data, rangeStart, rangeEnd) {
    const events = [];
    for (const rule of data.recurring) {
        const weekdayIndex = WEEKDAYS.indexOf(rule.weekday.toLowerCase());
        if (weekdayIndex === -1) continue;
        const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
        d.setDate(d.getDate() + ((weekdayIndex - d.getDay() + 7) % 7));
        while (d <= rangeEnd) {
            const dateKey = toDateKey(d);
            const instance = {
                date: dateKey, what: rule.what, start: rule.start, end: rule.end,
                where: rule.where, poster: rule.poster, recurringId: rule.id, cancelled: false,
            };
            const override = data.overrides.find(
                (o) => !o._example && o.date === dateKey && o.recurringId === rule.id
            );
            if (override) {
                if (override.action === "cancel") instance.cancelled = true;
                else if (override.action === "replace") applyOverrideFields(instance, override);
            }
            events.push(instance);
            d.setDate(d.getDate() + 7);
        }
    }
    return events;
}

// Generates every non-example special whose date falls within [rangeStart, rangeEnd].
function resolveSpecialsInRange(data, rangeStart, rangeEnd) {
    const startKey = toDateKey(rangeStart);
    const endKey = toDateKey(rangeEnd);
    const events = [];
    for (const special of data.specials) {
        if (special._example) continue;
        if (special.date >= startKey && special.date <= endKey) {
            events.push({
                date: special.date, what: special.what, start: special.start,
                end: special.end, where: special.where, poster: special.poster, cancelled: false,
            });
        }
    }
    return events;
}

function sortEvents(events) {
    return events.slice().sort(
        (a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.start || "").localeCompare(b.start || ""))
    );
}

// Near-term list for the board's "Upcoming Events": this week's recurring instances,
// any future "replace" override surfaced early (not just the week it lands in), and
// all upcoming specials regardless of how far out. Cancelled instances are omitted.
function buildUpcomingEvents(data, now) {
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndKey = toDateKey(weekEnd);
    const todayKey = toDateKey(now);

    const events = resolveRecurringInRange(data, weekStart, weekEnd).filter((e) => !e.cancelled);

    for (const override of data.overrides) {
        if (override._example || override.action !== "replace") continue;
        if (override.date <= weekEndKey) continue; // already covered above, or in the past
        const rule = data.recurring.find((r) => r.id === override.recurringId);
        if (!rule) continue;
        const instance = {
            date: override.date, what: rule.what, start: rule.start, end: rule.end,
            where: rule.where, poster: rule.poster,
        };
        applyOverrideFields(instance, override);
        events.push(instance);
    }

    for (const special of data.specials) {
        if (special._example || special.date < todayKey) continue;
        events.push({
            date: special.date, what: special.what, start: special.start,
            end: special.end, where: special.where, poster: special.poster,
        });
    }

    return sortEvents(events);
}
