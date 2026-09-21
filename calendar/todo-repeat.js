/* Recurrence rules for page-made todos. Kept free of the DOM so
 * tests/todo-repeat.test.mjs can run it in Node. Dates are "YYYY-MM-DD" strings and
 * all arithmetic is done in UTC, so the machine's timezone or a DST change can never
 * shift a day.
 *
 * A rule is { freq: "daily" | "weekly" | "monthly" | "yearly",
 *             days:  ["MO", ...]   weekly: which weekdays
 *             day:   1..31         monthly/yearly: day of month to keep (clamped in
 *                                  short months, but never drifts: 31st -> Feb 28 -> Mar 31)
 *             month: 1..12 }       yearly
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TodoRepeat = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const DAY_MS = 86400000;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isDate(s) { return typeof s === "string" && DATE_RE.test(s); }
  function parts(s) { return s.split("-").map(Number); }
  function toMs(s) { const p = parts(s); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function fromMs(ms) {
    const d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  function addDays(s, n) { return fromMs(toMs(s) + n * DAY_MS); }
  function dowOf(s) { return new Date(toMs(s)).getUTCDay(); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }   // m is 1-12
  function clampedDate(y, m, d) { return y + "-" + pad(m) + "-" + pad(Math.min(d, daysInMonth(y, m))); }

  function normDays(days) {
    const want = new Set((Array.isArray(days) ? days : []).map(d => String(d).toUpperCase()));
    return DOW.filter(d => want.has(d));
  }

  // Builds a rule anchored on a date: monthly keeps that date's day of month, yearly its
  // month and day, and weekly with no days chosen falls back to that date's weekday.
  function make(freq, anchor, days) {
    if (!isDate(anchor)) return null;
    const p = parts(anchor);
    if (freq === "daily") return { freq: "daily" };
    if (freq === "weekly") {
      const set = normDays(days);
      return { freq: "weekly", days: set.length ? set : [DOW[dowOf(anchor)]] };
    }
    if (freq === "monthly") return { freq: "monthly", day: p[2] };
    if (freq === "yearly") return { freq: "yearly", month: p[1], day: p[2] };
    return null;
  }

  // Cleans a rule read back from storage; null if it isn't usable.
  function validate(rule) {
    if (!rule || typeof rule !== "object") return null;
    if (rule.freq === "daily") return { freq: "daily" };
    if (rule.freq === "weekly") {
      const set = normDays(rule.days);
      return set.length ? { freq: "weekly", days: set } : null;
    }
    const day = Number(rule.day);
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    if (rule.freq === "monthly") return { freq: "monthly", day: day };
    if (rule.freq === "yearly") {
      const month = Number(rule.month);
      if (!Number.isInteger(month) || month < 1 || month > 12) return null;
      return { freq: "yearly", month: month, day: day };
    }
    return null;
  }

  function occursOn(rule, s) {
    const p = parts(s);
    switch (rule.freq) {
      case "daily": return true;
      case "weekly": return rule.days.includes(DOW[dowOf(s)]);
      case "monthly": return p[2] === Math.min(rule.day, daysInMonth(p[0], p[1]));
      case "yearly": return p[1] === rule.month && p[2] === Math.min(rule.day, daysInMonth(p[0], p[1]));
      default: return false;
    }
  }

  // First occurrence strictly after `after`; null for an unusable rule.
  function nextAfter(rule, after) {
    if (!rule || !isDate(after)) return null;
    const p = parts(after);
    switch (rule.freq) {
      case "daily":
        return addDays(after, 1);
      case "weekly":
        for (let i = 1; i <= 7; i++) {
          const c = addDays(after, i);
          if (occursOn(rule, c)) return c;
        }
        return null;
      case "monthly": {
        let y = p[0], m = p[1];
        for (let k = 0; k < 3; k++) {
          const c = clampedDate(y, m, rule.day);
          if (c > after) return c;
          m++; if (m > 12) { m = 1; y++; }
        }
        return null;
      }
      case "yearly":
        for (let y = p[0]; y <= p[0] + 1; y++) {   // clamped (Feb 29 -> Feb 28), so every year has one
          const c = clampedDate(y, rule.month, rule.day);
          if (c > after) return c;
        }
        return null;
      default:
        return null;
    }
  }

  // First occurrence on or after `s`.
  function startOn(rule, s) {
    if (!rule || !isDate(s)) return null;
    return occursOn(rule, s) ? s : nextAfter(rule, s);
  }

  function ordinal(n) {
    const v = n % 100;
    if (v >= 11 && v <= 13) return n + "th";
    return n + (["th", "st", "nd", "rd"][n % 10] || "th");
  }

  function describe(rule) {
    if (!rule) return "";
    switch (rule.freq) {
      case "daily": return "Every day";
      case "weekly": {
        if (rule.days.length === 7) return "Every day";
        if (rule.days.join() === "MO,TU,WE,TH,FR") return "Every weekday";
        return "Every " + rule.days.map(d => DOW_SHORT[DOW.indexOf(d)]).join(", ");
      }
      case "monthly": return "Monthly on the " + ordinal(rule.day);
      case "yearly": return "Yearly on " + MON_SHORT[rule.month - 1] + " " + rule.day;
      default: return "";
    }
  }

  return { DOW, make, validate, occursOn, nextAfter, startOn, describe, addDays, isDate };
});
