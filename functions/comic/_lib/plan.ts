// The comic planner's data: one private document (`plan.json` in the COMIC bucket) holding
// every strip, character and idea, and the public slice derived from it (`published.json`).
//
// Pure functions only — no R2, no Request — so the shape rules and what-goes-public rules
// can be unit-tested directly. This file exports helpers only (no onRequest*), so Pages
// doesn't turn it into a route.

export const STATUSES = ["idea", "script", "pencils", "inks", "posted"] as const;
export type Status = (typeof STATUSES)[number];

// Generous for a hand-drawn strip, but bounded: the whole document is rewritten on every
// save, so an unbounded field would make each autosave slower forever.
const MAX = {
  strips: 2000,
  panels: 24,
  lines: 40,
  cast: 200,
  ideas: 2000,
  id: 40,
  title: 120,
  name: 60,
  role: 120,
  short: 160,
  line: 1000,
  scene: 4000,
  note: 4000,
  bio: 2000,
  about: 4000,
  idea: 2000,
  notes: 20000,
};

export type ImageRef = { id: string; w: number; h: number };
export type Line = { who: string; text: string };
export type Panel = { id: string; scene: string; lines: Line[] };
export type Strip = {
  id: string;
  title: string;
  status: Status;
  date: string; // YYYY-MM-DD the strip goes up; a future date on a posted strip = scheduled
  note: string; // public: the artist's note under the strip
  alt: string; // public: a description for screen readers
  notes: string; // private
  panels: Panel[];
  image: ImageRef | null;
  created: string;
  updated: string;
};
export type Character = {
  id: string;
  name: string;
  role: string;
  bio: string; // public when `public` is on
  notes: string; // private, always
  public: boolean;
  image: ImageRef | null;
};
export type Idea = { id: string; text: string; done: boolean; created: string };
export type Settings = { title: string; tagline: string; about: string };
export type Plan = { version: 1; settings: Settings; strips: Strip[]; cast: Character[]; ideas: Idea[] };

export type PublishedStrip = { id: string; title: string; date: string; note: string; alt: string; image: ImageRef };
export type PublishedCharacter = { id: string; name: string; role: string; bio: string; image: ImageRef | null };
export type Published = { settings: Settings; strips: PublishedStrip[]; cast: PublishedCharacter[] };

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isId(v: unknown): v is string {
  return typeof v === "string" && v.length <= MAX.id && ID_RE.test(v);
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function list<T>(v: unknown, max: number, each: (item: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (out.length >= max) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = each(raw as Record<string, unknown>);
    if (!item) continue;
    // Duplicate ids would make "which one did I just edit" ambiguous; first one wins.
    const id = (item as { id?: unknown }).id;
    if (typeof id === "string") {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(item);
  }
  return out;
}

function date(v: unknown): string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return "";
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : "";
}

function stamp(v: unknown): string {
  if (typeof v !== "string") return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function image(v: unknown): ImageRef | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (!isId(r.id)) return null;
  const w = Number(r.w);
  const h = Number(r.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 || w > 20000 || h > 20000) return null;
  return { id: r.id, w: Math.round(w), h: Math.round(h) };
}

export function emptyPlan(): Plan {
  return { version: 1, settings: { title: "", tagline: "", about: "" }, strips: [], cast: [], ideas: [] };
}

// Coerces anything the planner sends into a well-formed Plan: unknown keys are dropped,
// strings are clipped, bad ids/dates/images are discarded. Returns null only when the input
// isn't an object at all, so a client bug can't save `null` over the whole plan.
export function normalizePlan(input: unknown): Plan | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const p = input as Record<string, unknown>;
  const s = (p.settings && typeof p.settings === "object" ? p.settings : {}) as Record<string, unknown>;

  return {
    version: 1,
    settings: { title: str(s.title, MAX.title), tagline: str(s.tagline, MAX.short), about: str(s.about, MAX.about) },
    strips: list(p.strips, MAX.strips, (r) => {
      if (!isId(r.id)) return null;
      return {
        id: r.id,
        title: str(r.title, MAX.title),
        status: (STATUSES as readonly string[]).includes(r.status as string) ? (r.status as Status) : "idea",
        date: date(r.date),
        note: str(r.note, MAX.note),
        alt: str(r.alt, MAX.note),
        notes: str(r.notes, MAX.notes),
        panels: list(r.panels, MAX.panels, (pr) =>
          isId(pr.id)
            ? {
                id: pr.id,
                scene: str(pr.scene, MAX.scene),
                lines: list(pr.lines, MAX.lines, (lr) => ({ who: str(lr.who, MAX.name), text: str(lr.text, MAX.line) })),
              }
            : null,
        ),
        image: image(r.image),
        created: stamp(r.created),
        updated: stamp(r.updated),
      };
    }),
    cast: list(p.cast, MAX.cast, (r) =>
      isId(r.id)
        ? {
            id: r.id,
            name: str(r.name, MAX.name),
            role: str(r.role, MAX.role),
            bio: str(r.bio, MAX.bio),
            notes: str(r.notes, MAX.notes),
            public: r.public === true,
            image: image(r.image),
          }
        : null,
    ),
    ideas: list(p.ideas, MAX.ideas, (r) =>
      isId(r.id) ? { id: r.id, text: str(r.text, MAX.idea), done: r.done === true, created: stamp(r.created) } : null,
    ),
  };
}

// The public slice. Only posted strips that have art and a date go out, and only the fields
// meant for readers: private notes, panel scripts and unposted work never leave plan.json.
export function derivePublished(plan: Plan): Published {
  const strips = plan.strips
    .filter((s) => s.status === "posted" && s.image && s.date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created) || a.id.localeCompare(b.id))
    .map((s) => ({ id: s.id, title: s.title, date: s.date, note: s.note, alt: s.alt, image: s.image as ImageRef }));
  const cast = plan.cast
    .filter((c) => c.public && c.name.trim())
    .map((c) => ({ id: c.id, name: c.name, role: c.role, bio: c.bio, image: c.image }));
  return { settings: { ...plan.settings }, strips, cast };
}

// What a reader can see today: scheduled strips (dated after `today`) stay hidden until
// their day. Numbers are assigned here, after that filter, so #12 never skips ahead of a
// strip that isn't up yet.
export function visible(published: Published, today: string) {
  const strips = published.strips.filter((s) => s.date <= today).map((s, i) => ({ n: i + 1, ...s }));
  return { settings: published.settings, strips, cast: published.cast };
}

// Every image id a logged-out reader may fetch today. Anything else in the bucket —
// pencils, unposted scans, scheduled strips — stays private.
export function publicImageIds(published: Published, today: string): Set<string> {
  const ids = new Set<string>();
  for (const s of visible(published, today).strips) ids.add(s.image.id);
  for (const c of published.cast) if (c.image) ids.add(c.image.id);
  return ids;
}

// The strip's "today" is Kentucky's, not UTC's, so a strip dated tomorrow doesn't go up at
// 8pm the night before.
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
