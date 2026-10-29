import { FAMOUS, type Famous } from '../../shared/data';
import { matchesName } from '../../shared/text';
import { GameError, shuffle, type GameModule } from './types';

// Nombres al revés, por turnos: a cada jugador le toca su propio famoso. La pantalla grande
// lo reproduce al revés y SOLO ese jugador graba y responde desde su celu (hasta 3 intentos).

const TURN_MS = 90_000;
export const MAX_TRIES = 3;
const TRY_POINTS = [5, 3, 2]; // según el intento en que acierta
const SPEED_BONUS: [number, number][] = [[30_000, 2], [60_000, 1]]; // +2 si acierta antes de 30 s, +1 antes de 60 s

interface Turn {
  playerId: string;
  name: string;
  category: string;
  tries: string[]; // intentos (texto)
  correct: boolean;
  points: number;
  ms: number; // cuánto tardó en acertar
}

export interface RevesState {
  turns: Turn[];
  turn: number; // índice del turno actual (-1 = todavía no arrancó)
  phase: 'intro' | 'listen' | 'reveal';
  startedAt: number;
  deadline: number;
  perPlayer: number;
}

function closeTurn(s: RevesState) {
  if (s.phase === 'listen') s.phase = 'reveal';
}

export function currentFamous(s: RevesState): string | null {
  return s.turn >= 0 && s.phase !== 'intro' ? s.turns[s.turn]?.name ?? null : null;
}

function totals(s: RevesState, pid: string) {
  const mine = s.turns.filter((t) => t.playerId === pid);
  return { points: mine.reduce((n, t) => n + t.points, 0), correct: mine.filter((t) => t.correct).length, played: mine.length };
}

export const reves: GameModule<RevesState> = {
  init(ctx) {
    const perPlayer = Math.max(1, ctx.config.rounds);
    const total = perPlayer * ctx.playerIds.length;
    // 1) los que cargó el admin, 2) conocidos (hasta la mitad), 3) famosos al azar.
    const custom: Famous[] = shuffle(ctx.customFamous, ctx.rand).map((name) => ({ name, category: 'Del grupo' as const }));
    const conocidos = shuffle(FAMOUS.filter((f) => f.category === 'Conocidos'), ctx.rand);
    const rest = shuffle(FAMOUS.filter((f) => f.category !== 'Conocidos'), ctx.rand);
    const picked: Famous[] = custom.slice(0, total);
    const maxConocidos = Math.ceil(total / 2);
    for (const f of conocidos) if (picked.length < total && picked.filter((p) => p.category === 'Conocidos').length < maxConocidos) picked.push(f);
    for (const f of [...rest, ...conocidos]) if (picked.length < total && !picked.some((p) => p.name === f.name)) picked.push(f);
    const pool = shuffle(picked, ctx.rand);
    // Rondas: en cada vuelta juega cada jugador una vez (orden mezclado por vuelta).
    const turns: Turn[] = [];
    for (let r = 0; r < perPlayer; r++) {
      for (const pid of shuffle(ctx.playerIds, ctx.rand)) {
        const f = pool[turns.length % pool.length];
        turns.push({ playerId: pid, name: f.name, category: f.category, tries: [], correct: false, points: 0, ms: 0 });
      }
    }
    return { turns, turn: -1, phase: 'intro', startedAt: 0, deadline: 0, perPlayer };
  },

  hostView(s, ctx) {
    const t = s.turns[s.turn];
    const reveal = s.phase === 'reveal';
    return {
      type: 'reves',
      phase: s.phase,
      turn: s.turn,
      turns: s.turns.length,
      deadline: s.deadline,
      player: t?.playerId ?? null,
      nextPlayer: s.turns[s.turn + 1]?.playerId ?? null,
      category: t && s.phase !== 'intro' ? t.category : null,
      tries: t?.tries ?? [],
      maxTries: MAX_TRIES,
      correct: reveal ? !!t?.correct : null,
      gained: reveal ? t?.points ?? 0 : null,
      answer: reveal ? t?.name ?? null : null,
      table: ctx.playerIds.map((pid) => ({ playerId: pid, ...totals(s, pid) }))
    };
  },

  playerView(s, pid) {
    const t = s.turns[s.turn];
    const reveal = s.phase === 'reveal';
    const mine = totals(s, pid);
    return {
      type: 'reves',
      phase: s.phase,
      turn: s.turn,
      turns: s.turns.length,
      deadline: s.deadline,
      myTurn: !!t && t.playerId === pid,
      player: t?.playerId ?? null,
      nextIsMe: s.turns[s.turn + 1]?.playerId === pid,
      category: t && s.phase !== 'intro' ? t.category : null,
      tries: t?.tries ?? [],
      maxTries: MAX_TRIES,
      correct: reveal ? !!t?.correct : null,
      gained: reveal ? t?.points ?? 0 : null,
      answer: reveal ? t?.name ?? null : null,
      myPoints: mine.points,
      myCorrect: mine.correct
    };
  },

  onHost(s, action, _payload, ctx) {
    if (action === 'start-round') {
      if (s.phase === 'listen') throw new GameError('Ya hay un turno en juego');
      if (s.turn + 1 >= s.turns.length) throw new GameError('Ya jugaron todos sus turnos');
      s.turn++;
      // Si el jugador de este turno se fue de la sala, se saltea.
      while (s.turn < s.turns.length && !ctx.playerIds.includes(s.turns[s.turn].playerId)) s.turn++;
      if (s.turn >= s.turns.length) throw new GameError('Ya jugaron todos sus turnos');
      s.phase = 'listen';
      s.startedAt = ctx.now;
      s.deadline = ctx.now + TURN_MS;
    } else if (action === 'reveal') {
      closeTurn(s);
    } else {
      throw new GameError('Acción desconocida');
    }
  },

  onPlayer(s, pid, action, payload, ctx) {
    if (action !== 'guess') throw new GameError('Acción desconocida');
    const t = s.turns[s.turn];
    if (s.phase !== 'listen' || !t) throw new GameError('Ahora no se puede responder');
    if (t.playerId !== pid) throw new GameError('No es tu turno');
    if (t.tries.length >= MAX_TRIES) throw new GameError('Ya usaste tus 3 intentos');
    const text = String(payload?.text ?? '').trim().slice(0, 80);
    if (!text) throw new GameError('Escribí un nombre');
    if (ctx.now > s.deadline + 2000) {
      closeTurn(s);
      throw new GameError('Se terminó el tiempo');
    }
    t.tries.push(text);
    if (matchesName(text, t.name)) {
      t.correct = true;
      t.ms = ctx.now - s.startedAt;
      const bonus = SPEED_BONUS.find(([ms]) => t.ms < ms)?.[1] ?? 0;
      t.points = TRY_POINTS[t.tries.length - 1] + bonus;
      closeTurn(s);
    } else if (t.tries.length >= MAX_TRIES) {
      closeTurn(s);
    }
  },

  ranking(s, ctx) {
    closeTurn(s);
    return ctx.playerIds.map((pid) => {
      const t = totals(s, pid);
      const ms = s.turns.filter((x) => x.playerId === pid && x.correct).reduce((n, x) => n + x.ms, 0);
      return { playerId: pid, key: [t.points, t.correct, -ms], label: `${t.points} pts · ${t.correct}/${t.played} aciertos` };
    });
  }
};
