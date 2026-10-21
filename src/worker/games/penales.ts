import { GameError, shuffle, type GameCtx, type GameModule } from './types';

// Penales: mini liga todos contra todos. En cada partido los dos jugadores, a la vez,
// eligen a qué palo patean y hacia dónde se tiran (izquierda, centro, derecha).
// Si uno mete y el otro no, gana. Si los dos meten o los dos fallan, se patea otra tanda.

const TANDA_MS = 20_000;
export const ZONES = ['izquierda', 'centro', 'derecha'] as const;

interface Choice {
  kick: number;
  dive: number;
}

interface Tanda {
  a: Choice;
  b: Choice;
  aGoal: boolean; // el remate de A contra el arquero B
  bGoal: boolean;
}

export interface Match {
  id: string;
  a: string;
  b: string;
  tandas: Tanda[];
  pending: { a?: Choice; b?: Choice };
  deadline: number;
  winner: string | null;
}

export interface PenalesState {
  phase: 'intro' | 'playing' | 'roundDone' | 'done';
  rounds: { a: string; b: string }[][];
  byes: (string | null)[];
  round: number;
  matches: Match[];
  history: Match[];
  league: string[];
}

/** Fixture todos contra todos (método del círculo). `vueltas` = 1 o 2. */
export function fixture(ids: string[], vueltas = 1): { rounds: { a: string; b: string }[][]; byes: (string | null)[] } {
  const list: (string | null)[] = [...ids];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds: { a: string; b: string }[][] = [];
  const byes: (string | null)[] = [];
  let arr = [...list];
  for (let r = 0; r < n - 1; r++) {
    const pairs: { a: string; b: string }[] = [];
    let bye: string | null = null;
    for (let i = 0; i < n / 2; i++) {
      const x = arr[i];
      const y = arr[n - 1 - i];
      if (x === null) bye = y;
      else if (y === null) bye = x;
      else pairs.push(r % 2 ? { a: y, b: x } : { a: x, b: y });
    }
    rounds.push(pairs);
    byes.push(bye);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  if (vueltas > 1) {
    const back = rounds.map((r) => r.map(({ a, b }) => ({ a: b, b: a })));
    return { rounds: [...rounds, ...back], byes: [...byes, ...byes] };
  }
  return { rounds, byes };
}

function resolve(m: Match, ctx: GameCtx, force = false) {
  if (m.winner) return;
  if (!force && (!m.pending.a || !m.pending.b)) return;
  const pick = (): Choice => ({ kick: Math.floor(ctx.rand() * 3), dive: Math.floor(ctx.rand() * 3) });
  const a = m.pending.a ?? pick();
  const b = m.pending.b ?? pick();
  const t: Tanda = { a, b, aGoal: a.kick !== b.dive, bGoal: b.kick !== a.dive };
  m.tandas.push(t);
  m.pending = {};
  if (t.aGoal !== t.bGoal) m.winner = t.aGoal ? m.a : m.b;
  else m.deadline = ctx.now + TANDA_MS;
}

function record(s: PenalesState, pid: string) {
  let pj = 0, pg = 0, gf = 0, gc = 0;
  for (const m of [...s.history, ...s.matches]) {
    if (!m.winner || (m.a !== pid && m.b !== pid)) continue;
    pj++;
    if (m.winner === pid) pg++;
    for (const t of m.tandas) {
      const mine = m.a === pid ? t.aGoal : t.bGoal;
      const theirs = m.a === pid ? t.bGoal : t.aGoal;
      gf += mine ? 1 : 0;
      gc += theirs ? 1 : 0;
    }
  }
  return { pj, pg, pp: pj - pg, gf, gc };
}

function checkRound(s: PenalesState) {
  if (s.phase === 'playing' && s.matches.every((m) => m.winner)) {
    s.phase = s.round + 1 >= s.rounds.length ? 'done' : 'roundDone';
  }
}

function publicMatch(m: Match) {
  return {
    id: m.id,
    a: m.a,
    b: m.b,
    winner: m.winner,
    deadline: m.winner ? 0 : m.deadline,
    tandas: m.tandas,
    ready: { a: !!m.pending.a, b: !!m.pending.b }
  };
}

export const penales: GameModule<PenalesState> = {
  init(ctx) {
    const league = shuffle(ctx.playerIds, ctx.rand);
    const { rounds, byes } = fixture(league, ctx.config.rounds >= 2 ? 2 : 1);
    return { phase: 'intro', rounds, byes, round: -1, matches: [], history: [], league };
  },

  hostView(s, ctx) {
    return {
      type: 'penales',
      phase: s.phase,
      round: s.round,
      rounds: s.rounds.length,
      bye: s.round >= 0 ? s.byes[s.round] : null,
      matches: s.matches.map(publicMatch),
      table: s.league.map((pid) => ({ playerId: pid, ...record(s, pid) })),
      lateJoiners: ctx.playerIds.filter((id) => !s.league.includes(id))
    };
  },

  playerView(s, pid) {
    const m = s.matches.find((x) => x.a === pid || x.b === pid) ?? null;
    const side = m ? (m.a === pid ? 'a' : 'b') : null;
    return {
      type: 'penales',
      phase: s.phase,
      round: s.round,
      rounds: s.rounds.length,
      inLeague: s.league.includes(pid),
      resting: s.round >= 0 && s.byes[s.round] === pid,
      match: m
        ? {
            ...publicMatch(m),
            me: side,
            rival: side === 'a' ? m.b : m.a,
            myPending: m.pending[side!] ?? null
          }
        : null,
      record: record(s, pid)
    };
  },

  onHost(s, action, _payload, ctx) {
    if (action === 'start-round') {
      if (s.phase === 'playing') throw new GameError('Todavía hay partidos en juego');
      if (s.round + 1 >= s.rounds.length) throw new GameError('Ya se jugaron todas las fechas');
      s.history.push(...s.matches);
      s.round++;
      s.matches = s.rounds[s.round].map((p, i) => ({
        id: `r${s.round}m${i}`,
        a: p.a,
        b: p.b,
        tandas: [],
        pending: {},
        deadline: ctx.now + TANDA_MS,
        winner: null
      }));
      s.phase = 'playing';
      checkRound(s);
    } else if (action === 'timeout') {
      // Se acabó el tiempo de una tanda: el que no eligió patea y se tira al azar.
      for (const m of s.matches) if (!m.winner && ctx.now >= m.deadline - 500) resolve(m, ctx, true);
      checkRound(s);
    } else {
      throw new GameError('Acción desconocida');
    }
  },

  onPlayer(s, pid, action, payload, ctx) {
    if (action !== 'choose') throw new GameError('Acción desconocida');
    if (s.phase !== 'playing') throw new GameError('Ahora no hay partidos en juego');
    const m = s.matches.find((x) => x.a === pid || x.b === pid);
    if (!m) throw new GameError('Esta fecha no jugás');
    if (m.winner) throw new GameError('Tu partido ya terminó');
    const kick = Number(payload?.kick);
    const dive = Number(payload?.dive);
    if (![0, 1, 2].includes(kick) || ![0, 1, 2].includes(dive)) throw new GameError('Elegí a dónde patear y a dónde tirarte');
    const side = m.a === pid ? 'a' : 'b';
    if (m.pending[side]) throw new GameError('Ya elegiste, esperá a tu rival');
    m.pending[side] = { kick, dive };
    resolve(m, ctx);
    checkRound(s);
  },

  ranking(s) {
    s.history.push(...s.matches);
    s.matches = [];
    s.phase = 'done';
    return s.league.map((pid) => {
      const r = record(s, pid);
      return { playerId: pid, key: [r.pg, r.gf - r.gc, r.gf], label: `${r.pg} G · ${r.pp} P` };
    });
  }
};
