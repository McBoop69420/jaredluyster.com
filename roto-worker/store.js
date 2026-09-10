// Room persistence, split so it can be tested without a Durable Object.
//
// Serialization is pure and lives here; the backend is just an `exec(sql, ...params)`
// returning row objects. The DO passes `ctx.storage.sql.exec`, tests pass node:sqlite.
//
// The catalog is immutable and written once at creation. Everything else — the shared
// pool, pools, clock — is small enough (~2 KB at a full table) to live in one mutable
// JSON blob, rewritten as the draft progresses.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS card (ref INTEGER PRIMARY KEY, j TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pick_log (seat INTEGER, seq INTEGER, step INTEGER,
     ref INTEGER, at INTEGER, PRIMARY KEY (seat, seq))`,
];

// The parts of a room that change as it is drafted.
function liveSlice(state) {
  const { draft } = state;

  return {
    phase: state.phase,
    hostSeat: state.hostSeat,
    lastSeenAny: state.lastSeenAny,
    completedAt: state.completedAt ?? null,
    seats: state.seats,
    pool: draft.pool,
    round: draft.round,
    currentSeat: draft.currentSeat,
    takenThisStep: draft.takenThisStep,
    step: draft.step,
    pools: draft.pools,
    colorCounts: draft.colorCounts,
    seatKinds: draft.seatKinds,
    finished: draft.finished,
  };
}

export function makeStore(exec) {
  const get = (key) => {
    const rows = exec(`SELECT v FROM kv WHERE k = ?`, key);
    return rows.length ? JSON.parse(rows[0].v) : null;
  };

  const put = (key, value) => {
    exec(`INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
      key, JSON.stringify(value));
  };

  return {
    init() {
      for (const statement of SCHEMA) {
        exec(statement);
      }
    },

    exists() {
      return exec(`SELECT k FROM kv WHERE k = 'meta'`).length > 0;
    },

    // Written once. The catalog goes one row per card so a large cube never approaches
    // a single-value size limit.
    writeCreation(state) {
      put("meta", {
        code: state.code,
        protocol: state.protocol,
        config: state.config,
        createdAt: state.createdAt,
        hostName: state.hostName,
      });

      state.draft.catalog.forEach((card, ref) => {
        exec(`INSERT OR REPLACE INTO card (ref, j) VALUES (?, ?)`, ref, JSON.stringify(card));
      });

      put("live", liveSlice(state));
    },

    writeLive(state) {
      put("live", liveSlice(state));
    },

    appendPick(entry) {
      exec(
        `INSERT OR REPLACE INTO pick_log (seat, seq, step, ref, at) VALUES (?, ?, ?, ?, ?)`,
        entry.seat, entry.seq, entry.step, entry.ref, entry.at
      );
    },

    load() {
      const meta = get("meta");
      const live = get("live");
      if (!meta || !live) {
        return null;
      }

      const catalog = [];
      for (const row of exec(`SELECT ref, j FROM card ORDER BY ref`)) {
        catalog[row.ref] = JSON.parse(row.j);
      }

      const pickLog = exec(
        `SELECT seat, seq, step, ref, at FROM pick_log ORDER BY seat, seq`
      );

      return {
        code: meta.code,
        protocol: meta.protocol,
        config: meta.config,
        createdAt: meta.createdAt,
        hostName: meta.hostName,
        phase: live.phase,
        hostSeat: live.hostSeat,
        lastSeenAny: live.lastSeenAny,
        completedAt: live.completedAt ?? null,
        seats: live.seats,
        pickLog,
        draft: {
          config: meta.config,
          catalog,
          seatKinds: live.seatKinds,
          pool: live.pool,
          round: live.round,
          currentSeat: live.currentSeat,
          takenThisStep: live.takenThisStep,
          step: live.step,
          pools: live.pools,
          colorCounts: live.colorCounts,
          finished: live.finished,
        },
      };
    },

    destroy() {
      for (const table of ["kv", "card", "pick_log"]) {
        exec(`DELETE FROM ${table}`);
      }
    },
  };
}

// Backend over a node:sqlite DatabaseSync, used by the tests to exercise the real DDL
// and the real query strings without deploying anything.
export function nodeSqliteExec(db) {
  return (sql, ...params) => {
    const statement = db.prepare(sql);
    if (/^\s*select/i.test(sql)) {
      return statement.all(...params);
    }
    statement.run(...params);
    return [];
  };
}
