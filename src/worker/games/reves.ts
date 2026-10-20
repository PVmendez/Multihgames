import { FAMOUS } from '../../shared/data';
import { matchesName } from '../../shared/text';
import { GameError, shuffle, type GameModule } from './types';

const ROUND_MS = 90_000;
const BASE = 5;
const SPEED_BONUS = [3, 2, 1];

interface Guess {
  text: string;
  at: number;
  correct: boolean;
  points: number;
}

export interface RevesState {
  names: string[];
  rounds: number;
  round: number;
  phase: 'intro' | 'listen' | 'reveal';
  startedAt: number;
  deadline: number;
  guesses: Record<string, Guess>;
  points: Record<string, number>;
  correct: Record<string, number>;
}

function closeRound(s: RevesState) {
  if (s.phase !== 'listen') return;
  const right = Object.entries(s.guesses)
    .filter(([, g]) => g.correct)
    .sort((a, b) => a[1].at - b[1].at);
  right.forEach(([pid, g], i) => {
    g.points = BASE + (SPEED_BONUS[i] ?? 0);
    s.points[pid] = (s.points[pid] ?? 0) + g.points;
    s.correct[pid] = (s.correct[pid] ?? 0) + 1;
  });
  s.phase = 'reveal';
}

export function currentFamous(s: RevesState): string | null {
  return s.round >= 0 && s.phase !== 'intro' ? s.names[s.round] ?? null : null;
}

export const reves: GameModule<RevesState> = {
  init(ctx) {
    const pool = [...new Set([...ctx.customFamous, ...shuffle(FAMOUS, ctx.rand)])];
    // Los propios del admin van primero (mezclados entre sí), después los del banco.
    const custom = shuffle(ctx.customFamous, ctx.rand);
    const names = [...custom, ...pool.filter((n) => !custom.includes(n))].slice(0, ctx.config.rounds);
    return {
      names: shuffle(names, ctx.rand),
      rounds: names.length,
      round: -1,
      phase: 'intro',
      startedAt: 0,
      deadline: 0,
      guesses: {},
      points: {},
      correct: {}
    };
  },

  hostView(s, ctx) {
    const reveal = s.phase === 'reveal';
    return {
      type: 'reves',
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      deadline: s.deadline,
      answer: reveal ? s.names[s.round] : null,
      answered: ctx.playerIds.filter((pid) => s.guesses[pid]),
      guesses: reveal
        ? ctx.playerIds.map((pid) => ({ playerId: pid, text: s.guesses[pid]?.text ?? null, correct: !!s.guesses[pid]?.correct, points: s.guesses[pid]?.points ?? 0 }))
        : [],
      points: s.points
    };
  },

  playerView(s, pid) {
    const g = s.guesses[pid];
    const reveal = s.phase === 'reveal';
    return {
      type: 'reves',
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      deadline: s.deadline,
      myGuess: g?.text ?? null,
      correct: reveal ? !!g?.correct : null,
      gained: reveal ? g?.points ?? 0 : null,
      answer: reveal ? s.names[s.round] : null,
      myPoints: s.points[pid] ?? 0
    };
  },

  onHost(s, action, _payload, ctx) {
    if (action === 'start-round') {
      if (s.phase === 'listen') throw new GameError('Ya hay un famoso en juego');
      if (s.round + 1 >= s.rounds) throw new GameError('Ya se jugaron todos los famosos');
      s.round++;
      s.phase = 'listen';
      s.guesses = {};
      s.startedAt = ctx.now;
      s.deadline = ctx.now + ROUND_MS;
    } else if (action === 'reveal') {
      closeRound(s);
    } else {
      throw new GameError('Acción desconocida');
    }
  },

  onPlayer(s, pid, action, payload, ctx) {
    if (action !== 'guess') throw new GameError('Acción desconocida');
    if (s.phase !== 'listen') throw new GameError('Ahora no se puede responder');
    if (s.guesses[pid]) throw new GameError('Ya respondiste este famoso');
    const text = String(payload?.text ?? '').trim().slice(0, 80);
    if (!text) throw new GameError('Escribí un nombre');
    const late = ctx.now > s.deadline + 2000;
    s.guesses[pid] = { text, at: ctx.now, correct: !late && matchesName(text, s.names[s.round]), points: 0 };
    if (ctx.playerIds.every((id) => s.guesses[id])) closeRound(s);
  },

  ranking(s, ctx) {
    closeRound(s);
    return ctx.playerIds.map((pid) => ({
      playerId: pid,
      key: [s.points[pid] ?? 0],
      label: `${s.points[pid] ?? 0} pts · ${s.correct[pid] ?? 0} aciertos`
    }));
  }
};
