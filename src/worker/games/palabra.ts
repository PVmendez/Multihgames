import { WORDS } from '../../shared/data';
import { levenshtein, normalize } from '../../shared/text';
import { GameError, type GameCtx, type GameModule } from './types';

type Level = 1 | 2 | 3;

interface Assignment {
  word: string;
  level: Level;
  accused: boolean; // ya usó su intento de adivinar esta palabra
}

interface Claim {
  id: string;
  hunter: string;
  target: string;
  word: string;
  at: number;
}

export interface PalabraState {
  minutes: number;
  phase: 'intro' | 'playing' | 'done';
  endsAt: number;
  assign: Record<string, Assignment>;
  points: Record<string, number>;
  claims: Claim[];
  log: { at: number; text: string }[];
  used: string[];
  seq: number;
}

function pickWord(s: PalabraState, ctx: GameCtx): Assignment {
  const r = ctx.rand();
  const level: Level = r < 0.4 ? 1 : r < 0.75 ? 2 : 3;
  const current = new Set(Object.values(s.assign).map((a) => a.word));
  const pool = [...WORDS[level], ...(level === 2 ? ctx.customWords : [])].filter((w) => !s.used.includes(w) && !current.has(w));
  const fallback = [...WORDS[1], ...WORDS[2], ...WORDS[3], ...ctx.customWords].filter((w) => !current.has(w));
  const list = pool.length ? pool : fallback;
  const word = list[Math.floor(ctx.rand() * list.length)];
  s.used.push(word);
  const lvl = (([1, 2, 3] as Level[]).find((l) => WORDS[l].includes(word)) ?? 2) as Level;
  return { word, level: lvl, accused: false };
}

function log(s: PalabraState, ctx: GameCtx, text: string) {
  s.log.unshift({ at: ctx.now, text });
  s.log = s.log.slice(0, 12);
}

const add = (s: PalabraState, pid: string, n: number) => (s.points[pid] = (s.points[pid] ?? 0) + n);

function checkTime(s: PalabraState, ctx: GameCtx) {
  if (s.phase === 'playing' && ctx.now > s.endsAt + 2000) s.phase = 'done';
}

export const palabra: GameModule<PalabraState> = {
  init: (ctx) => ({
    minutes: ctx.config.rounds,
    phase: 'intro',
    endsAt: 0,
    assign: {},
    points: {},
    claims: [],
    log: [],
    used: [],
    seq: 0
  }),

  hostView(s, ctx) {
    return {
      type: 'palabra',
      phase: s.phase,
      endsAt: s.endsAt,
      minutes: s.minutes,
      points: s.points,
      levels: Object.fromEntries(ctx.playerIds.map((pid) => [pid, s.assign[pid]?.level ?? null])),
      // El admin confirma: la palabra viaja a la pantalla grande pero se muestra tapada.
      claims: s.claims.map((c) => ({ id: c.id, hunter: c.hunter, target: c.target, word: c.word })),
      log: s.log
    };
  },

  playerView(s, pid, ctx) {
    const mine = s.assign[pid];
    return {
      type: 'palabra',
      phase: s.phase,
      endsAt: s.endsAt,
      myLevel: mine?.level ?? null,
      myAccused: mine?.accused ?? false,
      myPoints: s.points[pid] ?? 0,
      // Las palabras de todos menos la mía.
      others: ctx.playerIds
        .filter((id) => id !== pid && s.assign[id])
        .map((id) => ({ playerId: id, word: s.assign[id].word, level: s.assign[id].level })),
      pendingTargets: s.claims.filter((c) => c.hunter === pid).map((c) => c.target),
      log: s.log.slice(0, 5)
    };
  },

  onHost(s, action, payload, ctx) {
    checkTime(s, ctx);
    if (action === 'start') {
      if (s.phase !== 'intro') throw new GameError('El juego ya arrancó');
      for (const pid of ctx.playerIds) s.assign[pid] = pickWord(s, ctx);
      s.phase = 'playing';
      s.endsAt = ctx.now + s.minutes * 60_000;
      log(s, ctx, '¡Arrancó! Cada uno tiene su palabra.');
    } else if (action === 'approve' || action === 'reject') {
      const i = s.claims.findIndex((c) => c.id === payload?.id);
      if (i < 0) throw new GameError('Ese reclamo ya no existe');
      const [c] = s.claims.splice(i, 1);
      const current = s.assign[c.target];
      if (action === 'approve') {
        if (!current || current.word !== c.word) return; // ya le cambió la palabra
        add(s, c.hunter, current.level);
        log(s, ctx, `${ctx.names[c.hunter]} hizo que ${ctx.names[c.target]} dijera «${c.word}» (+${current.level})`);
        s.assign[c.target] = pickWord(s, ctx);
        s.claims = s.claims.filter((x) => x.target !== c.target);
      } else {
        log(s, ctx, `Reclamo de ${ctx.names[c.hunter]} rechazado`);
      }
    } else if (action === 'stop') {
      s.phase = 'done';
    } else {
      throw new GameError('Acción desconocida');
    }
  },

  onPlayer(s, pid, action, payload, ctx) {
    checkTime(s, ctx);
    if (s.phase !== 'playing') throw new GameError('El juego no está en curso');
    if (action === 'claim') {
      const target = String(payload?.target ?? '');
      if (target === pid || !s.assign[target]) throw new GameError('Jugador inválido');
      if (s.claims.some((c) => c.hunter === pid && c.target === target)) throw new GameError('Ya lo reclamaste, esperá al admin');
      s.claims.push({ id: `c${++s.seq}`, hunter: pid, target, word: s.assign[target].word, at: ctx.now });
    } else if (action === 'accuse') {
      const mine = s.assign[pid];
      if (!mine) throw new GameError('Todavía no tenés palabra');
      if (mine.accused) throw new GameError('Ya usaste tu intento con esta palabra');
      const g = normalize(String(payload?.guess ?? ''));
      const w = normalize(mine.word);
      if (!g) throw new GameError('Escribí una palabra');
      if (g === w || (w.length > 4 && levenshtein(g, w) <= 1)) {
        add(s, pid, mine.level);
        log(s, ctx, `${ctx.names[pid]} adivinó que su palabra era «${mine.word}» (+${mine.level})`);
        s.assign[pid] = pickWord(s, ctx);
        s.claims = s.claims.filter((c) => c.target !== pid);
      } else {
        add(s, pid, -1);
        mine.accused = true;
        log(s, ctx, `${ctx.names[pid]} arriesgó su palabra y le erró (-1)`);
      }
    } else {
      throw new GameError('Acción desconocida');
    }
  },

  onPlayerJoined(s, pid, ctx) {
    if (s.phase === 'playing' && !s.assign[pid]) s.assign[pid] = pickWord(s, ctx);
  },

  ranking(s, ctx) {
    s.phase = 'done';
    return ctx.playerIds.map((pid) => ({ playerId: pid, key: [s.points[pid] ?? 0], label: `${s.points[pid] ?? 0} pts` }));
  }
};
