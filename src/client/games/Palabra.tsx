import { useState } from 'react';
import { Avatar, Countdown, HoldToReveal } from '../components/chalk';
import { useWhenTimeUp, type HostProps, type PlayProps } from './common';

interface HostView {
  type: 'palabra';
  phase: 'intro' | 'playing' | 'done';
  endsAt: number;
  minutes: number;
  points: Record<string, number>;
  levels: Record<string, 1 | 2 | 3 | null>;
  claims: { id: string; hunter: string; target: string; word: string }[];
  log: { at: number; text: string }[];
}

interface PlayView {
  type: 'palabra';
  phase: 'intro' | 'playing' | 'done';
  endsAt: number;
  myLevel: 1 | 2 | 3 | null;
  myAccused: boolean;
  myPoints: number;
  others: { playerId: string; word: string; level: 1 | 2 | 3 }[];
  pendingTargets: string[];
  log: { at: number; text: string }[];
}

const stars = (n: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(3 - n) : '');

export function PalabraHost({ game, room, players, send }: HostProps<HostView>) {
  const g = game;
  useWhenTimeUp(g.endsAt, g.phase === 'playing', () => send({ t: 'game', action: 'stop' }));
  const rows = [...room.players].sort((a, b) => (g.points[b.id] ?? 0) - (g.points[a.id] ?? 0));

  return (
    <div className="row" style={{ alignItems: 'stretch', gap: 'clamp(24px, 4vw, 56px)', flex: 1, flexWrap: 'wrap' }}>
      <div className="stack grow" style={{ minWidth: 320 }}>
        {g.phase === 'intro' && (
          <div className="stack">
            <p className="big" style={{ margin: 0 }}>
              Cada uno recibe una palabra secreta que <b>no conoce</b>, pero todos los demás sí. Charlen normal: si hacés que otro diga su palabra, apretá «¡La dijo!» en tu celu y el admin lo confirma.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Las palabras valen de ★ a ★★★ según lo difícil que es sacarlas. Una vez por palabra podés arriesgar cuál es la tuya: si acertás sumás, si no, -1. Duración: {g.minutes} minutos.
            </p>
            <button className="btn yellow" style={{ alignSelf: 'flex-start' }} onClick={() => send({ t: 'game', action: 'start' })}>
              Repartir palabras
            </button>
          </div>
        )}

        {g.phase !== 'intro' && (
          <>
            <div className="row" style={{ gap: 20 }}>
              {g.phase === 'playing' ? <Countdown deadline={g.endsAt} size={110} /> : <h2 className="display h1 pink">¡Tiempo!</h2>}
              {g.phase === 'playing' && (
                <button className="btn small" onClick={() => confirm('¿Cortar el juego ahora?') && send({ t: 'game', action: 'stop' })}>
                  Cortar ya
                </button>
              )}
            </div>
            {g.claims.length > 0 && (
              <div className="stack">
                <h2 className="display h3 yellow">Para confirmar</h2>
                {g.claims.map((c) => (
                  <div key={c.id} className="paper row wrap fade-in" style={{ transform: 'rotate(-1deg)', gap: 12 }}>
                    <span className="grow" style={{ fontSize: 21 }}>
                      <b>{players[c.hunter]?.name}</b> dice que <b>{players[c.target]?.name}</b> dijo su palabra:{' '}
                      <HoldToReveal>
                        <b style={{ fontSize: 24 }}>«{c.word}»</b>
                      </HoldToReveal>
                    </span>
                    <button className="btn small paper-btn" onClick={() => send({ t: 'game', action: 'approve', payload: { id: c.id } })}>
                      Sí, la dijo
                    </button>
                    <button className="btn small paper-btn" onClick={() => send({ t: 'game', action: 'reject', payload: { id: c.id } })}>
                      No
                    </button>
                  </div>
                ))}
                <span className="muted" style={{ fontSize: 15 }}>
                  Mantené apretada la palabra para verla sin que la vea el resto.
                </span>
              </div>
            )}
            <div className="stack" style={{ gap: 4 }}>
              <h2 className="display h3">Lo último</h2>
              {g.log.map((l, i) => (
                <div key={l.at + l.text} style={{ fontSize: 20, opacity: 1 - i * 0.08 }}>
                  {l.text}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="stack" style={{ width: 'min(100%, 380px)', gap: 0 }}>
        <h2 className="display h3">Puntos</h2>
        {rows.map((p) => (
          <div key={p.id} className="score-row" style={{ minHeight: 58 }}>
            <Avatar avatar={p.avatar} size={46} offline={!p.connected} />
            <span className="grow" style={{ fontSize: 23, fontWeight: 700 }}>
              {p.name}
              {g.phase === 'playing' && g.levels[p.id] && (
                <span className="muted" style={{ fontSize: 15, fontWeight: 400, marginLeft: 8 }}>
                  {stars(g.levels[p.id])}
                </span>
              )}
            </span>
            <span className="total">{g.points[p.id] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PalabraPlay({ game, players, send }: PlayProps<PlayView>) {
  const g = game;
  const [guess, setGuess] = useState('');

  if (g.phase === 'intro') {
    return (
      <div className="stack center" style={{ marginTop: 40 }}>
        <h1 className="display h2">No digas tu palabra</h1>
        <p className="muted">Todos van a tener una palabra que no conocen. Esperá a que el admin las reparta.</p>
      </div>
    );
  }

  if (g.phase === 'done') {
    return (
      <div className="stack center" style={{ marginTop: 40 }}>
        <h1 className="display h1 pink">¡Tiempo!</h1>
        <p className="big">Hiciste {g.myPoints} puntos.</p>
      </div>
    );
  }

  return (
    <div className="stack fade-in">
      <div className="row between">
        <div>
          <div className="muted">Tu palabra vale</div>
          <div className="yellow" style={{ fontSize: 30 }} aria-label={`${g.myLevel ?? 0} estrellas`}>
            {stars(g.myLevel)}
          </div>
        </div>
        <div className="center">
          <div className="display" style={{ fontSize: 44 }}>
            {g.myPoints}
          </div>
          <div className="muted" style={{ fontSize: 14 }}>
            puntos
          </div>
        </div>
        <Countdown deadline={g.endsAt} size={64} />
      </div>

      <h2 className="display h3">Las palabras de los demás</h2>
      <p className="muted" style={{ margin: 0, fontSize: 16 }}>
        Si alguien dice la suya porque vos lo llevaste, apretá «¡La dijo!».
      </p>
      <div className="stack" style={{ gap: 0 }}>
        {g.others.map((o) => {
          const p = players[o.playerId];
          const pending = g.pendingTargets.includes(o.playerId);
          return (
            <div key={o.playerId} className="score-row" style={{ minHeight: 70, gap: 10 }}>
              {p && <Avatar avatar={p.avatar} size={44} />}
              <div className="grow">
                <div className="muted" style={{ fontSize: 16 }}>
                  {p?.name} · {stars(o.level)}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{o.word}</div>
              </div>
              <button className={`btn small ${pending ? '' : 'yellow'}`} disabled={pending} onClick={() => send({ t: 'game', action: 'claim', payload: { target: o.playerId } })}>
                {pending ? 'Esperando…' : '¡La dijo!'}
              </button>
            </div>
          );
        })}
      </div>

      <form
        className="dashed-box stack"
        style={{ gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!guess.trim()) return;
          if (confirm(`¿Arriesgás «${guess.trim()}»? Si le errás, -1.`)) {
            send({ t: 'game', action: 'accuse', payload: { guess } });
            setGuess('');
          }
        }}
      >
        <label htmlFor="mine" className="pink" style={{ fontSize: 20, fontWeight: 700 }}>
          ¿Te diste cuenta de cuál es la tuya?
        </label>
        {g.myAccused ? (
          <span className="muted">Ya arriesgaste con esta palabra. Cuando te toque una nueva, vas a poder de nuevo.</span>
        ) : (
          <div className="row">
            <input id="mine" className="chalk-input grow" style={{ fontSize: 22 }} value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Mi palabra es…" autoComplete="off" />
            <button className="btn small pink" disabled={!guess.trim()}>
              Arriesgar
            </button>
          </div>
        )}
      </form>

      {g.log.length > 0 && (
        <div className="stack" style={{ gap: 2 }}>
          {g.log.map((l) => (
            <span key={l.at + l.text} className="muted" style={{ fontSize: 16 }}>
              {l.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
