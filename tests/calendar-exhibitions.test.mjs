// Tests for /api/exhibitions in news/_worker.js: UK and Louisville basketball
// exhibitions scraped from the schools' own sites, since ESPN doesn't list them.
// Run: node --test tests/*.test.mjs
//
// fetch is stubbed with small copies of each upstream format (UK's schedule-page
// JSON-LD, Louisville's Sidearm iCal feed, ESPN's team list), so no network.

import test from "node:test";
import assert from "node:assert/strict";

const worker = (await import(new URL("../news/_worker.js", import.meta.url).href)).default;

const ukEvent = (name, startDate) => '<script type="application/ld+json">' + JSON.stringify({
  "@context": "http://schema.org", "@type": "Event", name, startDate,
  image: ["https://ukathletics.com/https://storage.googleapis.com/ukathletics-com/opp.png"],
}) + "</script>";

const UK_MBB = "<html>" +
  ukEvent("vs. Big Blue Madness (EXH)", "2026-10-02T19:00") +
  ukEvent("vs. Texas Tech (EXH)", "2026-10-23T19:00") +
  ukEvent("vs. Georgetown College (EXH)", "2026-10-30") +
  ukEvent("vs. Manhattan ", "2026-11-03T19:00") + "</html>";

const UL_MBB = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "DTSTART:20261021T230000Z",
  "SUMMARY:[W] University of Louisville Men's Basketball at Kansas (EXH)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261029T003000Z",   // 8:30 pm ET the evening before, in UTC
  "SUMMARY:University of Louisville Men's Basketball vs Mercyhurst (EXH) - Fam",
  " ily Night",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261103T020000Z",
  "SUMMARY:University of Louisville Men's Basketball vs Chattanooga",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const espnTeams = (names) => JSON.stringify({ sports: [{ leagues: [{ teams: names.map(([location, id]) => ({
  team: { location, displayName: location + " Team", shortDisplayName: location, abbreviation: "X",
    logos: [{ href: "https://espn/" + id + ".png", rel: ["full", "default"] }] },
})) }] }] });

function stubFetch(byUrl) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const body = Object.entries(byUrl).find(([k]) => String(url).includes(k));
    return body ? new Response(body[1]) : new Response("", { status: 404 });
  };
  return calls;
}

let cachePut = 0;
globalThis.caches = { default: { match: async () => null, put: async () => { cachePut++; } } };

async function exhibitions() {
  const res = await worker.fetch(new Request("https://calendar.jaredluyster.com/api/exhibitions"), {});
  assert.equal(res.status, 200);
  return (await res.json()).games;
}

test("picks out exhibitions from both schools, with ET dates and ESPN logos", async () => {
  stubFetch({
    "ukathletics.com/sports/mbball": UK_MBB,
    "sport_id=5": UL_MBB,
    "mens-college-basketball/teams": espnTeams([["Texas Tech", 2641], ["Kansas", 2305], ["Kansas City", 140], ["Mercyhurst", 2385]]),
  });
  const games = await exhibitions();
  assert.deepEqual(games.map((g) => [g.league, g.date, g.start, g.team, g.home, g.opponent, g.opponentLogo]), [
    ["NCAAM", "2026-10-21", "19:00", "Louisville", false, "Kansas", "https://espn/2305.png"],
    ["NCAAM", "2026-10-23", "19:00", "Kentucky", true, "Texas Tech", "https://espn/2641.png"],
    ["NCAAM", "2026-10-28", "20:30", "Louisville", true, "Mercyhurst", "https://espn/2385.png"],
    // Not a D-I team, so no ESPN logo: falls back to UK's own (de-doubled) URL. No time = TBA.
    ["NCAAM", "2026-10-30", null, "Kentucky", true, "Georgetown College",
      "https://storage.googleapis.com/ukathletics-com/opp.png"],
  ]);
  assert.equal(games[1].teamLogo, "https://a.espncdn.com/i/teamlogos/ncaa/500/96.png");
  assert.equal(games[0].url, "https://gocards.com/sports/mens-basketball/schedule");
});

test("an upstream outage isn't cached for the hour", async () => {
  stubFetch({});
  cachePut = 0;
  assert.deepEqual(await exhibitions(), []);
  assert.equal(cachePut, 0);
});
