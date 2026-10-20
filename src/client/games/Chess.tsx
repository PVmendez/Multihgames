import { useState } from 'react';
import { targets, PIECE_NAMES, type Piece } from '../../shared/chess';
import { Avatar, Countdown } from '../components/chalk';
import { RoundLabel, useWhenTimeUp, type HostProps, type PlayProps } from './common';

interface HostView {
  type: 'chess';
  phase: 'intro' | 'playing' | 'reveal';
  round: number;
  rounds: number;
  deadline: number;
  goal: string | null;
  start: string | null;
  par: number | null;
  progress: { playerId: string; moves: number; solved: boolean; ms: number | null; totalSolved: number; totalMoves: number }[];
}

interface PlayView {
  type: 'chess';
  phase: 'intro' | 'playing' | 'reveal';
  round: number;
  rounds: number;
  deadline: number;
  goal: string | null;
  start: string | null;
  board: string | null;
  moves: number;
  solved: boolean;
  par: number | null;
}

const GLYPH: Record<Piece, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
const glyph = (c: string) => (c === '.' ? '' : `${GLYPH[c as Piece]}︎`);

function Board({
  board,
  mini,
  selected,
  hints = [],
  onCell,
  label
}: {
  board: string;
  mini?: boolean;
  selected?: number | null;
  hints?: number[];
  onCell?: (i: number) => void;
  label: string;
}) {
  return (
    <div className={`board3${mini ? ' mini' : ''}`} role="grid" aria-label={label}>
      {board.split('').map((c, i) => {
        const cls = ['cell', (Math.floor(i / 3) + (i % 3)) % 2 ? 'dark' : '', selected === i ? 'selected' : '', hints.includes(i) ? 'target' : ''].join(' ');
        const name = c === '.' ? 'vacía' : PIECE_NAMES[c as Piece];
        return onCell ? (
          <button key={i} className={cls} onClick={() => onCell(i)} aria-label={`Casilla ${i + 1}: ${name}`}>
            {glyph(c)}
          </button>
        ) : (
          <div key={i} className={cls} role="gridcell" aria-label={`Casilla ${i + 1}: ${name}`}>
            {glyph(c)}
          </div>
        );
      })}
    </div>
  );
}

export function ChessHost({ game, players, send }: HostProps<HostView>) {
  const g = game;
  useWhenTimeUp(g.deadline, g.phase === 'playing', () => send({ t: 'game', action: 'end-round' }));
  const last = g.round + 1 >= g.rounds;

  const rows = [...g.progress].sort((a, b) =>
    g.phase === 'reveal' ? Number(b.solved) - Number(a.solved) || a.moves - b.moves || (a.ms ?? 0) - (b.ms ?? 0) : 0
  );

  return (
    <div className="row" style={{ alignItems: 'stretch', gap: 'clamp(24px, 4vw, 56px)', flex: 1, flexWrap: 'wrap' }}>
      <div className="stack" style={{ width: 'min(100%, 380px)' }}>
        <RoundLabel round={g.round} rounds={g.rounds} noun="reto" />
        {g.phase === 'intro' ? (
          <div className="stack">
            <p className="big" style={{ margin: 0 }}>
              Todos parten del mismo tablero. Cada uno, en su celu y sin que nadie lo vea, tiene que dejar las piezas como en la tarjeta.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Se mueven como en ajedrez, sin comer. Gana el que lo logra en menos movimientos; si empatan, el más rápido.
            </p>
          </div>
        ) : (
          g.goal && (
            <div className="paper" style={{ transform: 'rotate(-2deg)', background: '#2b3a33', color: 'var(--chalk)' }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>Así tienen que quedar:</div>
              <Board board={g.goal} mini label="Posición objetivo" />
            </div>
          )
        )}
        {g.phase === 'reveal' && g.par !== null && (
          <div className="big yellow">Mínimo posible: {g.par} movimientos</div>
        )}
        <div className="push row wrap">
          {g.phase === 'playing' && <Countdown deadline={g.deadline} size={72} />}
          {g.phase === 'playing' ? (
            <button className="btn small" onClick={() => send({ t: 'game', action: 'end-round' })}>
              Cortar el reto
            </button>
          ) : !last ? (
            <button className="btn yellow" onClick={() => send({ t: 'game', action: 'start-round' })}>
              {g.round < 0 ? 'Sacar el primer reto' : 'Siguiente reto'}
            </button>
          ) : (
            <span className="muted">Era el último reto: terminá el juego para pasar los puntos.</span>
          )}
        </div>
      </div>

      <div className="stack grow" style={{ gap: 4 }}>
        <h2 className="display h3">{g.phase === 'reveal' ? 'Cómo les fue' : g.phase === 'playing' ? 'Progreso' : 'Jugadores'}</h2>
        {rows.map((p) => {
          const pl = players[p.playerId];
          if (!pl) return null;
          return (
            <div key={p.playerId} className="score-row" style={{ minHeight: 60 }}>
              <Avatar avatar={p.solved ? { ...pl.avatar, expression: 'happy' } : pl.avatar} size={48} offline={!pl.connected} />
              <span className="name">{pl.name}</span>
              <span className="grow" style={{ fontSize: 24 }}>
                {g.phase === 'intro' ? (
                  <span className="muted">{p.totalSolved ? `${p.totalSolved} resueltos · ${p.totalMoves} mov.` : ''}</span>
                ) : p.solved ? (
                  <span className="yellow">
                    resuelto en {p.moves}
                    {p.ms !== null && <span className="muted"> · {Math.round(p.ms / 1000)} s</span>}
                  </span>
                ) : (
                  <span>{g.phase === 'reveal' ? `no llegó (${p.moves} mov.)` : `va ${p.moves} mov.`}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChessPlay({ game, send }: PlayProps<PlayView>) {
  const g = game;
  const [sel, setSel] = useState<number | null>(null);

  if (g.phase === 'intro' || !g.board || !g.goal) {
    return (
      <div className="stack center" style={{ marginTop: 40 }}>
        <h1 className="display h2">Ajedrez 9 casillas</h1>
        <p className="muted">Esperá que el admin saque el reto. Nadie más va a ver tu tablero.</p>
      </div>
    );
  }

  const hints = sel !== null && !g.solved && g.phase === 'playing' ? targets(g.board, sel) : [];
  const onCell = (i: number) => {
    if (g.solved || g.phase !== 'playing') return;
    if (sel !== null && hints.includes(i)) {
      send({ t: 'game', action: 'move', payload: { from: sel, to: i } });
      setSel(null);
    } else if (g.board![i] !== '.') {
      setSel(sel === i ? null : i);
    } else {
      setSel(null);
    }
  };

  return (
    <div className="stack fade-in">
      <div className="row between">
        <RoundLabel round={g.round} rounds={g.rounds} noun="Reto" />
        {g.phase === 'playing' && !g.solved && <Countdown deadline={g.deadline} size={56} />}
      </div>

      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div className="paper" style={{ width: 130, flex: 'none', padding: 8, background: '#2b3a33', color: 'var(--chalk)', transform: 'rotate(-2deg)' }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>Objetivo</div>
          <Board board={g.goal} mini label="Posición objetivo" />
        </div>
        <div className="stack grow" style={{ gap: 2 }}>
          <span className="muted">movimientos</span>
          <span className="display" style={{ fontSize: 56 }}>
            {g.moves}
          </span>
          {g.par !== null && <span className="yellow">mínimo: {g.par}</span>}
        </div>
      </div>

      <Board board={g.board} selected={sel} hints={hints} onCell={onCell} label="Tu tablero" />

      {g.solved ? (
        <div className="center stack" style={{ gap: 4 }}>
          <div className="display h2 yellow">¡Resuelto en {g.moves}!</div>
          {g.par !== null && <div className="muted">{g.moves === g.par ? 'Perfecto, imposible hacerlo mejor.' : `Se podía en ${g.par}.`}</div>}
        </div>
      ) : g.phase === 'reveal' ? (
        <div className="center pink big">Se terminó el tiempo</div>
      ) : (
        <div className="row between">
          <span className="muted">Tocá una pieza y después dónde va.</span>
          <button className="chip" onClick={() => send({ t: 'game', action: 'reset' })}>
            Volver al inicio
          </button>
        </div>
      )}
    </div>
  );
}
