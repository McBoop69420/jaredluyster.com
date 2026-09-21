// Tests for calendar/todo-repeat.js (recurrence rules for page-made todos).
// Run: node --test tests/*.test.mjs
//
// TODO_REPEAT_UNDER_TEST=<path> points the suite at another copy of the module (used to
// mutation-test that these assertions really fail when the logic is broken).
// Run it under a couple of timezones too (TZ=Pacific/Auckland, TZ=America/New_York): the
// module does all date math in UTC and must not care.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const R = require(process.env.TODO_REPEAT_UNDER_TEST || "../calendar/todo-repeat.js");

const weekly = (...days) => R.make("weekly", "2026-09-21", days);   // 2026-09-21 is a Monday
const monthly = (day) => ({ freq: "monthly", day });
const yearly = (month, day) => ({ freq: "yearly", month, day });

test("daily: the next day, across month, year, leap day and DST changes", () => {
  const d = { freq: "daily" };
  assert.equal(R.nextAfter(d, "2026-09-20"), "2026-09-21");
  assert.equal(R.nextAfter(d, "2026-09-30"), "2026-10-01");
  assert.equal(R.nextAfter(d, "2026-12-31"), "2027-01-01");
  assert.equal(R.nextAfter(d, "2028-02-28"), "2028-02-29");
  assert.equal(R.nextAfter(d, "2027-02-28"), "2027-03-01");
  assert.equal(R.nextAfter(d, "2026-03-07"), "2026-03-08");   // US spring-forward day
  assert.equal(R.nextAfter(d, "2026-03-08"), "2026-03-09");
  assert.equal(R.nextAfter(d, "2026-10-31"), "2026-11-01");   // US fall-back day
  assert.equal(R.nextAfter(d, "2026-11-01"), "2026-11-02");
});

test("weekly: next chosen weekday, wrapping past the end of the week", () => {
  const monWed = weekly("MO", "WE");
  assert.equal(R.nextAfter(monWed, "2026-09-21"), "2026-09-23");   // Mon -> Wed
  assert.equal(R.nextAfter(monWed, "2026-09-23"), "2026-09-28");   // Wed -> next Mon
  assert.equal(R.nextAfter(monWed, "2026-09-26"), "2026-09-28");   // Sat -> Mon
  assert.equal(R.nextAfter(monWed, "2026-09-27"), "2026-09-28");   // Sun -> Mon
  assert.equal(R.nextAfter(monWed, "2026-09-22"), "2026-09-23");   // Tue -> Wed
});

test("weekly: a single day repeats a full week later, never the same day", () => {
  const mon = weekly("MO");
  assert.equal(R.nextAfter(mon, "2026-09-21"), "2026-09-28");
  assert.equal(R.nextAfter(weekly("SU"), "2026-09-20"), "2026-09-27");   // Sunday is the wrap-around edge
  assert.equal(R.nextAfter(weekly("SA"), "2026-09-26"), "2026-10-03");
});

test("monthly: keeps its day of month, clamping in short months without drifting", () => {
  const m31 = monthly(31);
  assert.equal(R.nextAfter(m31, "2026-01-31"), "2026-02-28");
  assert.equal(R.nextAfter(m31, "2026-02-28"), "2026-03-31");   // did not drift to the 28th
  assert.equal(R.nextAfter(m31, "2026-03-31"), "2026-04-30");
  assert.equal(R.nextAfter(m31, "2026-04-30"), "2026-05-31");
  assert.equal(R.nextAfter(m31, "2028-01-31"), "2028-02-29");   // leap year
  assert.equal(R.nextAfter(monthly(15), "2026-12-20"), "2027-01-15");   // year rollover
  assert.equal(R.nextAfter(monthly(15), "2026-09-10"), "2026-09-15");   // later this month
  assert.equal(R.nextAfter(monthly(15), "2026-09-15"), "2026-10-15");   // strictly after
  assert.equal(R.nextAfter(monthly(29), "2027-01-29"), "2027-02-28");
  assert.equal(R.nextAfter(monthly(29), "2028-01-29"), "2028-02-29");
});

test("yearly: same month and day, Feb 29 falls back to Feb 28 in non-leap years", () => {
  assert.equal(R.nextAfter(yearly(3, 5), "2026-03-04"), "2026-03-05");
  assert.equal(R.nextAfter(yearly(3, 5), "2026-03-05"), "2027-03-05");
  assert.equal(R.nextAfter(yearly(3, 5), "2026-12-31"), "2027-03-05");
  assert.equal(R.nextAfter(yearly(2, 29), "2027-02-28"), "2028-02-29");
  assert.equal(R.nextAfter(yearly(2, 29), "2028-02-29"), "2029-02-28");
  assert.equal(R.nextAfter(yearly(2, 29), "2026-03-01"), "2027-02-28");
});

test("startOn: the first occurrence on or after a date", () => {
  const monWed = weekly("MO", "WE");
  assert.equal(R.startOn(monWed, "2026-09-21"), "2026-09-21");   // already a Monday
  assert.equal(R.startOn(monWed, "2026-09-22"), "2026-09-23");   // Tue -> Wed
  assert.equal(R.startOn({ freq: "daily" }, "2026-09-22"), "2026-09-22");
  assert.equal(R.startOn(monthly(15), "2026-09-15"), "2026-09-15");
  assert.equal(R.startOn(monthly(15), "2026-09-16"), "2026-10-15");
  assert.equal(R.startOn(monthly(31), "2026-02-28"), "2026-02-28");   // clamped day counts as the occurrence
});

// nextAfter and occursOn are written independently (loops vs a direct check), so a
// brute-force scan against occursOn cross-checks nextAfter across many rules and dates.
test("property: nextAfter is exactly the first later day the rule occurs on", () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const rules = [{ freq: "daily" }, weekly("MO"), weekly("MO", "TU", "WE", "TH", "FR"),
    weekly("SU", "SA"), monthly(1), monthly(15), monthly(29), monthly(30), monthly(31),
    yearly(1, 1), yearly(2, 29), yearly(2, 28), yearly(12, 31), yearly(4, 30)];
  for (let i = 0; i < 3000; i++) {
    const rule = rules[rnd(rules.length)];
    const after = R.addDays("2024-01-01", rnd(365 * 8));
    let expected = null;
    for (let k = 1; k <= 800 && !expected; k++) {
      const c = R.addDays(after, k);
      if (R.occursOn(rule, c)) expected = c;
    }
    assert.equal(R.nextAfter(rule, after), expected, `${JSON.stringify(rule)} after ${after}`);
  }
});

test("make: anchors a rule on a date", () => {
  assert.deepEqual(R.make("daily", "2026-09-21"), { freq: "daily" });
  assert.deepEqual(R.make("weekly", "2026-09-21"), { freq: "weekly", days: ["MO"] });   // defaults to the anchor's weekday
  assert.deepEqual(R.make("weekly", "2026-09-21", ["FR", "mo", "FR", "xx"]), { freq: "weekly", days: ["MO", "FR"] });
  assert.deepEqual(R.make("monthly", "2026-01-31"), { freq: "monthly", day: 31 });
  assert.deepEqual(R.make("yearly", "2028-02-29"), { freq: "yearly", month: 2, day: 29 });
  assert.equal(R.make("fortnightly", "2026-09-21"), null);
  assert.equal(R.make("daily", "not-a-date"), null);
});

test("validate: cleans stored rules and rejects unusable ones", () => {
  assert.deepEqual(R.validate({ freq: "weekly", days: ["fr", "MO"] }), { freq: "weekly", days: ["MO", "FR"] });
  assert.deepEqual(R.validate({ freq: "monthly", day: "15" }), { freq: "monthly", day: 15 });
  for (const bad of [null, undefined, "daily", {}, { freq: "weekly" }, { freq: "weekly", days: [] },
    { freq: "weekly", days: ["XX"] }, { freq: "monthly" }, { freq: "monthly", day: 0 },
    { freq: "monthly", day: 32 }, { freq: "monthly", day: 1.5 }, { freq: "yearly", day: 5 },
    { freq: "yearly", month: 13, day: 5 }, { freq: "yearly", month: 3 }, { freq: "hourly" }]) {
    assert.equal(R.validate(bad), null, JSON.stringify(bad));
  }
});

test("nextAfter/startOn refuse bad input instead of throwing or guessing", () => {
  assert.equal(R.nextAfter(null, "2026-09-21"), null);
  assert.equal(R.nextAfter({ freq: "daily" }, "nope"), null);
  assert.equal(R.nextAfter({ freq: "hourly" }, "2026-09-21"), null);
  assert.equal(R.startOn(null, "2026-09-21"), null);
});

test("describe: readable labels", () => {
  assert.equal(R.describe({ freq: "daily" }), "Every day");
  assert.equal(R.describe(weekly("MO", "WE")), "Every Mon, Wed");
  assert.equal(R.describe(weekly("MO")), "Every Mon");
  assert.equal(R.describe(weekly("MO", "TU", "WE", "TH", "FR")), "Every weekday");
  assert.equal(R.describe(weekly("SU", "MO", "TU", "WE", "TH", "FR", "SA")), "Every day");
  assert.equal(R.describe(monthly(1)), "Monthly on the 1st");
  assert.equal(R.describe(monthly(2)), "Monthly on the 2nd");
  assert.equal(R.describe(monthly(3)), "Monthly on the 3rd");
  assert.equal(R.describe(monthly(11)), "Monthly on the 11th");
  assert.equal(R.describe(monthly(12)), "Monthly on the 12th");
  assert.equal(R.describe(monthly(13)), "Monthly on the 13th");
  assert.equal(R.describe(monthly(21)), "Monthly on the 21st");
  assert.equal(R.describe(monthly(22)), "Monthly on the 22nd");
  assert.equal(R.describe(monthly(31)), "Monthly on the 31st");
  assert.equal(R.describe(yearly(3, 5)), "Yearly on Mar 5");
  assert.equal(R.describe(null), "");
});
