import { makeChallenge, move, type Challenge } from '../../shared/chess';
import { GameError, type GameModule } from './types';

const ROUND_MS = 180_000;

interface PlayerBoard {
  board: string;
  moves: number;
  solvedAt: number | null;
}

interface RoundRecord {
  challenge: Challenge;
  results: Record<string, { moves: number; solved: boolean; ms: number }>;
}

export interface ChessState {
  rounds: number;
  round: number; // índice de la ronda actual (-1 = todavía no arrancó)
  phase: 'intro' | 'playing' | 'reveal';
  challenge: Challenge | null;
  startedAt: number;
  deadline: number;
  boards: Record<string, PlayerBoard>;
  history: RoundRecord[];
}

function closeRound(s: ChessState) {
  if (s.phase !== 'playing' || !s.challenge) return;
  const results: RoundRecord['results'] = {};
  for (const [pid, b] of Object.entries(s.boards)) {
    results[pid] = { moves: b.moves, solved: b.solvedAt !== null, ms: b.solvedAt ? b.solvedAt - s.startedAt : 0 };
  }
  s.history.push({ challenge: s.challenge, results });
  s.phase = 'reveal';
}

function totals(s: ChessState, pid: string) {
  let solved = 0;
  let moves = 0;
  let ms = 0;
  for (const h of s.history) {
    const r = h.results[pid];
    if (r?.solved) {
      solved++;
      moves += r.moves;
      ms += r.ms;
    }
  }
  return { solved, moves, ms };
}

export const chess: GameModule<ChessState> = {
  init: (ctx) => ({
    rounds: ctx.config.rounds,
    round: -1,
    phase: 'intro',
    challenge: null,
    startedAt: 0,
    deadline: 0,
    boards: {},
    history: []
  }),

  hostView(s, ctx) {
    return {
      type: 'chess',
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      deadline: s.deadline,
      // El objetivo se puede mostrar en la pantalla grande: es igual para todos.
      goal: s.challenge?.goal ?? null,
      start: s.challenge?.start ?? null,
      par: s.phase === 'reveal' ? s.challenge?.par ?? null : null,
      // Nunca el tablero de cada jugador: solo su progreso.
      progress: ctx.playerIds.map((pid) => {
        const b = s.boards[pid];
        const t = totals(s, pid);
        return {
          playerId: pid,
          moves: b?.moves ?? 0,
          solved: !!b?.solvedAt,
          ms: b?.solvedAt ? b.solvedAt - s.startedAt : null,
          totalSolved: t.solved,
          totalMoves: t.moves
        };
      })
    };
  },

  playerView(s, pid) {
    const b = s.boards[pid];
    return {
      type: 'chess',
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      deadline: s.deadline,
      goal: s.challenge?.goal ?? null,
      start: s.challenge?.start ?? null,
      board: b?.board ?? null,
      moves: b?.moves ?? 0,
      solved: !!b?.solvedAt,
      par: b?.solvedAt || s.phase === 'reveal' ? s.challenge?.par ?? null : null
    };
  },

  onHost(s, action, _payload, ctx) {
    if (action === 'start-round') {
      if (s.phase === 'playing') throw new GameError('Ya hay un reto en juego');
      if (s.round + 1 >= s.rounds) throw new GameError('Ya se jugaron todos los retos');
      s.round++;
      s.challenge = makeChallenge(4, 7, ctx.rand);
      s.phase = 'playing';
      s.startedAt = ctx.now;
      s.deadline = ctx.now + ROUND_MS;
      s.boards = {};
      for (const pid of ctx.playerIds) s.boards[pid] = { board: s.challenge.start, moves: 0, solvedAt: null };
    } else if (action === 'end-round') {
      closeRound(s);
    } else {
      throw new GameError('Acción desconocida');
    }
  },

  onPlayer(s, pid, action, payload, ctx) {
    if (s.phase !== 'playing' || !s.challenge) throw new GameError('No hay un reto en juego');
    if (ctx.now > s.deadline + 2000) {
      closeRound(s);
      throw new GameError('Se terminó el tiempo');
    }
    const b = (s.boards[pid] ??= { board: s.challenge.start, moves: 0, solvedAt: null });
    if (b.solvedAt) throw new GameError('Ya lo resolviste');
    if (action === 'move') {
      const next = move(b.board, Number(payload?.from), Number(payload?.to));
      if (!next) throw new GameError('Movimiento inválido');
      b.board = next;
      b.moves++;
      if (next === s.challenge.goal) b.solvedAt = ctx.now;
    } else if (action === 'reset') {
      // Vuelve al tablero inicial; los movimientos hechos siguen contando.
      b.board = s.challenge.start;
    } else {
      throw new GameError('Acción desconocida');
    }
    const everyone = ctx.playerIds.every((id) => s.boards[id]?.solvedAt);
    if (everyone) closeRound(s);
  },

  onPlayerJoined(s, pid) {
    if (s.phase === 'playing' && s.challenge && !s.boards[pid]) {
      s.boards[pid] = { board: s.challenge.start, moves: 0, solvedAt: null };
    }
  },

  ranking(s, ctx) {
    closeRound(s);
    return ctx.playerIds.map((pid) => {
      const t = totals(s, pid);
      return {
        playerId: pid,
        key: [t.solved, -t.moves, -t.ms],
        label: `${t.solved}/${s.history.length || s.rounds} · ${t.moves} mov.`
      };
    });
  }
};
