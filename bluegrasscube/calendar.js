// Bluegrass Cube — calendar.html rendering. Uses the shared engine in events.js (loaded
// first) so the calendar can never disagree with Upcoming Events about what's on a given
// date — same recurring/override/special resolution, just grouped by day instead of
// filtered to a near-term list.

let viewYear;
let viewMonth; // 0-indexed

function monthLabel(year, month) {
    return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function monthGridRange(year, month) {
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(lastOfMonth);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
    return { gridStart, gridEnd };
}

function formatCompactTime(t) {
    const f = formatTime(t);
    if (f.special) return f.display;
    return `${f.display}${f.period[0].toLowerCase()}`;
}

async function renderCalendar() {
    const grid = document.getElementById("calendar-grid");
    const titleEl = document.getElementById("calendar-title");
    if (!grid || !titleEl) return;

    titleEl.textContent = monthLabel(viewYear, viewMonth);
    grid.innerHTML = "";

    try {
        const res = await fetch("data/events.json", { cache: "no-store" });
        if (!res.ok) throw new Error("events.json fetch failed");
        const data = await res.json();
        const now = getEasternNow();
        const todayKey = toDateKey(now);

        const { gridStart, gridEnd } = monthGridRange(viewYear, viewMonth);
        const events = sortEvents([
            ...resolveRecurringInRange(data, gridStart, gridEnd),
            ...resolveSpecialsInRange(data, gridStart, gridEnd),
        ]);

        const byDate = new Map();
        for (const event of events) {
            if (!byDate.has(event.date)) byDate.set(event.date, []);
            byDate.get(event.date).push(event);
        }

        for (const label of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
            const headEl = document.createElement("div");
            headEl.className = "calendar-weekday";
            headEl.textContent = label;
            grid.appendChild(headEl);
        }

        const d = new Date(gridStart);
        while (d <= gridEnd) {
            const dateKey = toDateKey(d);
            const cellClasses = ["calendar-day"];
            if (d.getMonth() !== viewMonth) cellClasses.push("calendar-day--outside");
            if (dateKey < todayKey) cellClasses.push("calendar-day--past");
            if (dateKey === todayKey) cellClasses.push("calendar-day--today");

            const cell = document.createElement("div");
            cell.className = cellClasses.join(" ");

            const num = document.createElement("span");
            num.className = "calendar-day-num";
            num.textContent = String(d.getDate());
            cell.appendChild(num);

            for (const event of byDate.get(dateKey) || []) {
                const evEl = document.createElement("p");
                evEl.className = "calendar-event" + (event.cancelled ? " calendar-event--cancelled" : "");
                const timeEl = document.createElement("span");
                timeEl.className = "calendar-event-time";
                timeEl.textContent = formatCompactTime(event.start);
                evEl.append(timeEl, document.createTextNode(` ${event.what}`));
                cell.appendChild(evEl);
            }

            grid.appendChild(cell);
            d.setDate(d.getDate() + 1);
        }
    } catch (err) {
        grid.innerHTML = "";
        const msg = document.createElement("p");
        msg.className = "calendar-error";
        msg.textContent = "Couldn't load the calendar.";
        grid.appendChild(msg);
    }
}

function changeMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) {
        viewMonth = 11;
        viewYear -= 1;
    } else if (viewMonth > 11) {
        viewMonth = 0;
        viewYear += 1;
    }
    renderCalendar();
}

document.addEventListener("DOMContentLoaded", () => {
    const now = getEasternNow();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();

    document.getElementById("calendar-prev").addEventListener("click", () => changeMonth(-1));
    document.getElementById("calendar-next").addEventListener("click", () => changeMonth(1));

    renderCalendar();
});
