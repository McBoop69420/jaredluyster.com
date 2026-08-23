// Room persistence, split so it can be tested without a Durable Object.
//
// Serialization is pure and lives here; the backend is just an `exec(sql, ...params)`
// returning row objects. The DO passes `ctx.storage.sql.exec`, tests pass node:sqlite.
//
// Immutable data (catalog, the deal) is written once at creation. Only the small mutable
// slice — packs, pools, clock — is rewritten as the draft progresses.

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS card (ref INTEGER PRIMARY KEY, j TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS deal (round INTEGER, seat INTEGER, refs TEXT NOT NULL,
     PRIMARY KEY (round, seat))`,
  `CREATE TABLE IF NOT EXISTS pick_log (seat INTEGER, seq INTEGER, step INTEGER,
     ref INTEGER, at INTEGER, PRIMARY KEY (seat, seq))`,
];

// The parts of a room that change as it is drafted. Small enough (~2 KB at a full table)
// that one JSON blob beats spreading it across rows.
function liveSlice(state) {
  const { draft } = state;

  return {
    phase: state.phase,
    hostSeat: state.hostSeat,
    lastSeenAny: state.lastSeenAny,
    completedAt: state.completedAt ?? null,
    seats: state.seats,
    round: draft.round,
    pickNumber: draft.pickNumber,
    step: draft.step,
    takenThisStep: draft.takenThisStep,
    currentPacks: draft.currentPacks,
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

      state.draft.rounds.forEach((round, roundIndex) => {
        round.forEach((pack, seat) => {
          exec(`INSERT OR REPLACE INTO deal (round, seat, refs) VALUES (?, ?, ?)`,
            roundIndex, seat, JSON.stringify(pack));
        });
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

      const rounds = [];
      for (const row of exec(`SELECT round, seat, refs FROM deal ORDER BY round, seat`)) {
        (rounds[row.round] ||= [])[row.seat] = JSON.parse(row.refs);
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
          rounds,
          seatKinds: live.seatKinds,
          round: live.round,
          pickNumber: live.pickNumber,
          step: live.step,
          takenThisStep: live.takenThisStep,
          currentPacks: live.currentPacks,
          pools: live.pools,
          colorCounts: live.colorCounts,
          finished: live.finished,
        },
      };
    },

    destroy() {
      for (const table of ["kv", "card", "deal", "pick_log"]) {
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
