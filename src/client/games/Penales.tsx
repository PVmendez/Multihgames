import { useState } from 'react';
import type { PublicPlayer } from '../../shared/types';
import { Avatar, ChalkCircle, Countdown, Crown } from '../components/chalk';
import { useWhenTimeUp, type HostProps, type PlayProps } from './common';

interface Choice {
  kick: number;
  dive: number;
}
interface Tanda {
  a: Choice;
  b: Choice;
  aGoal: boolean;
  bGoal: boolean;
}
interface MatchView {
  id: string;
  a: string;
  b: string;
  winner: string | null;
  deadline: number;
  tandas: Tanda[];
  ready: { a: boolean; b: boolean };
}
interface Row {
  playerId: string;
  pj: number;
  pg: number;
  pp: number;
  gf: number;
  gc: number;
}
interface HostView {
  type: 'penales';
  phase: 'intro' | 'playing' | 'roundDone' | 'done';
  round: number;
  rounds: number;
  bye: string | null;
  matches: MatchView[];
  table: Row[];
  lateJoiners: string[];
}
interface PlayView {
  type: 'penales';
  phase: HostView['phase'];
  round: number;
  rounds: number;
  inLeague: boolean;
  resting: boolean;
  match: (MatchView & { me: 'a' | 'b'; rival: string; myPending: Choice | null }) | null;
  record: { pj: number; pg: number; pp: number; gf: number; gc: number };
}

const ZONES = ['Izquierda', 'Centro', 'Derecha'];
const ZX = [62, 150, 238];

// ---------- Dibujo del arco en tiza ----------

/** Un remate: dónde fue la pelota y hacia dónde se tiró el arquero. */
export function Shot({ kick, dive, goal, width = 220, label }: { kick: number; dive: number; goal: boolean; width?: number; label?: string }) {
  const bx = ZX[kick];
  const kx = ZX[dive];
  const lean = dive === 0 ? -28 : dive === 2 ? 28 : 0;
  return (
    <svg role="img" aria-label={label ?? `Pateó a la ${ZONES[kick].toLowerCase()}, el arquero se tiró a la ${ZONES[dive].toLowerCase()}: ${goal ? 'gol' : 'atajó'}`} width={width} viewBox="0 0 300 160">
      {/* red */}
      <path d="M30 22 H270 M30 52 H270 M30 82 H270 M30 112 H270 M70 22 V140 M110 22 V140 M150 22 V140 M190 22 V140 M230 22 V140" stroke="#edebe3" strokeWidth="1" opacity="0.18" />
      {/* arco */}
      <path d="M22 146 L22 18 L278 18 L278 146" stroke="#edebe3" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 148 Q150 144 296 149" stroke="#edebe3" strokeWidth="2.5" fill="none" opacity="0.6" />
      {/* arquero */}
      <g transform={`translate(${kx} 92) rotate(${lean})`} stroke="#9fd0e8" strokeWidth="4" fill="none" strokeLinecap="round">
        <circle cx="0" cy="-34" r="10" />
        <path d="M0 -24 L0 14 M0 -14 L-26 -30 M0 -14 L26 -30 M0 14 L-14 46 M0 14 L14 46" />
      </g>
      {/* pelota */}
      <g transform={`translate(${bx} ${goal ? 58 : 66})`}>
        <circle r="13" fill="#f3d36b" />
        <path d="M-6 -5 L0 -9 L6 -5 L4 2 L-4 2 Z" fill="#22302a" />
      </g>
    </svg>
  );
}

function ShotRow({ who, keeper, t, kickerSide, players, width = 180 }: { who: string; keeper: string; t: Tanda; kickerSide: 'a' | 'b'; players: Record<string, PublicPlayer>; width?: number }) {
  const kick = t[kickerSide].kick;
  const dive = t[kickerSide === 'a' ? 'b' : 'a'].dive;
  const goal = kickerSide === 'a' ? t.aGoal : t.bGoal;
  return (
    <div className="stack" style={{ gap: 2, alignItems: 'center' }}>
      <Shot kick={kick} dive={dive} goal={goal} width={width} />
      <span style={{ fontSize: width < 170 ? 15 : 18, textAlign: 'center' }}>
        <b>{players[who]?.name}</b> → <span className={goal ? 'yellow' : 'pink'} style={{ fontWeight: 700 }}>{goal ? '¡GOL!' : `atajó ${players[keeper]?.name}`}</span>
      </span>
    </div>
  );
}

// ---------- Pantalla grande ----------

export function PenalesHost({ game, players, send }: HostProps<HostView>) {
  const g = game;
  const active = g.matches.filter((m) => !m.winner);
  const nextDeadline = active.length ? Math.min(...active.map((m) => m.deadline)) : null;
  useWhenTimeUp(nextDeadline, g.phase === 'playing', () => send({ t: 'game', action: 'timeout' }));

  const table = [...g.table].sort((x, y) => y.pg - x.pg || y.gf - y.gc - (x.gf - x.gc) || y.gf - x.gf);

  return (
    <div className="row" style={{ alignItems: 'stretch', gap: 'clamp(24px, 3vw, 44px)', flex: 1, flexWrap: 'wrap' }}>
      <div className="stack grow" style={{ minWidth: 340 }}>
        {g.phase === 'intro' ? (
          <div className="stack">
            <p className="big" style={{ margin: 0 }}>
              Mini liga <b>todos contra todos</b>. En cada partido los dos patean y atajan a la vez desde el celu: eligen a qué palo patean y hacia dónde se tiran.
            </p>
            <p className="big" style={{ margin: 0 }}>
              Si uno mete y el otro no, <span className="yellow">gana</span>. Si los dos meten o los dos fallan, se patea otra tanda.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {g.rounds} fechas · varios partidos a la vez · si alguien no elige en 20 segundos, patea al azar.
            </p>
            <div className="row">
              <Shot kick={0} dive={2} goal width={260} label="Ejemplo de un gol" />
              <Shot kick={2} dive={2} goal={false} width={260} label="Ejemplo de una atajada" />
            </div>
          </div>
        ) : (
          <>
            <div className="row wrap" style={{ gap: 16, alignItems: 'baseline' }}>
              <h2 className="display h2">
                Fecha {g.round + 1} de {g.rounds}
              </h2>
              {g.bye && <span className="muted big">Descansa: {players[g.bye]?.name}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 18 }}>
              {g.matches.map((m) => {
                const last = m.tandas[m.tandas.length - 1];
                return (
                  <div key={m.id} className="dashed-box stack fade-in" style={{ gap: 10, borderColor: m.winner ? '#f3d36b66' : undefined }}>
                    <div className="row between">
                      {[m.a, m.b].map((pid, i) => (
                        <div key={pid} className="row" style={{ gap: 8, flexDirection: i ? 'row-reverse' : 'row' }}>
                          <span style={{ position: 'relative' }}>
                            {m.winner === pid && (
                              <span style={{ position: 'absolute', left: 10, top: -18 }}>
                                <Crown size={32} />
                              </span>
                            )}
                            {players[pid] && (
                              <Avatar
                                avatar={m.winner ? { ...players[pid].avatar, expression: m.winner === pid ? 'happy' : 'sad' } : players[pid].avatar}
                                size={50}
                                offline={!players[pid].connected}
                              />
                            )}
                          </span>
                          <span style={{ fontSize: 24, fontWeight: 700 }}>{players[pid]?.name}</span>
                        </div>
                      ))}
                    </div>
                    {last && (
                      <div className="row" style={{ justifyContent: 'space-around', flexWrap: 'wrap' }}>
                        <ShotRow who={m.a} keeper={m.b} t={last} kickerSide="a" players={players} />
                        <ShotRow who={m.b} keeper={m.a} t={last} kickerSide="b" players={players} />
                      </div>
                    )}
                    <div className="row between" style={{ fontSize: 19 }}>
                      {m.winner ? (
                        <span className="yellow" style={{ fontWeight: 700 }}>
                          Ganó {players[m.winner]?.name}
                          {m.tandas.length > 1 ? ` en la tanda ${m.tandas.length}` : ''}
                        </span>
                      ) : (
                        <>
                          <span>
                            {last ? `Tanda ${m.tandas.length + 1}` : 'Tanda 1'} <span className="muted">· {players[m.a]?.name} {m.ready.a ? '✓' : '…'} · {players[m.b]?.name} {m.ready.b ? '✓' : '…'}</span>
                          </span>
                          <Countdown deadline={m.deadline} size={46} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="push row">
          {g.phase === 'intro' || g.phase === 'roundDone' ? (
            <button className="btn yellow" onClick={() => send({ t: 'game', action: 'start-round' })}>
              {g.phase === 'intro' ? 'Primera fecha' : 'Siguiente fecha'}
            </button>
          ) : g.phase === 'done' ? (
            <span className="muted big">Terminó la liga: tocá «Terminar juego» para pasar los puntos.</span>
          ) : null}
        </div>
      </div>

      <div className="stack" style={{ width: 'min(100%, 380px)', gap: 4 }}>
        <h2 className="display h3 yellow">Tabla de la liga</h2>
        <div className="row muted" style={{ fontSize: 15, gap: 6 }}>
          <span className="grow">jugador</span>
          <span style={{ width: 34, textAlign: 'center' }}>PJ</span>
          <span style={{ width: 34, textAlign: 'center' }}>G</span>
          <span style={{ width: 34, textAlign: 'center' }}>P</span>
          <span style={{ width: 44, textAlign: 'center' }}>dif</span>
        </div>
        {table.map((r, i) => {
          const p = players[r.playerId];
          return (
            <div key={r.playerId} className="score-row" style={{ minHeight: 50, gap: 6 }}>
              <span style={{ width: 22, fontWeight: 700 }} className={i === 0 && r.pg > 0 ? 'yellow' : ''}>
                {i + 1}
              </span>
              {p && <Avatar avatar={p.avatar} size={34} offline={!p.connected} />}
              <span className="grow" style={{ fontSize: 21, fontWeight: 700 }}>
                {p?.name}
              </span>
              <span style={{ width: 34, textAlign: 'center' }}>{r.pj}</span>
              <span style={{ width: 34, textAlign: 'center', fontWeight: 700 }} className="yellow">
                {r.pg}
              </span>
              <span style={{ width: 34, textAlign: 'center' }}>{r.pp}</span>
              <span style={{ width: 44, textAlign: 'center' }} className="muted">
                {r.gf - r.gc > 0 ? '+' : ''}
                {r.gf - r.gc}
              </span>
            </div>
          );
        })}
        {g.lateJoiners.length > 0 && <span className="muted" style={{ fontSize: 15 }}>Se sumaron tarde y no están en la liga: {g.lateJoiners.map((id) => players[id]?.name).join(', ')}</span>}
      </div>
    </div>
  );
}

// ---------- Celular ----------

function Picker({ title, value, onPick, color, icon }: { title: string; value: number | null; onPick: (z: number) => void; color: string; icon: 'ball' | 'keeper' }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span style={{ fontSize: 21, fontWeight: 700, color }}>{title}</span>
      <div style={{ position: 'relative' }}>
        <svg aria-hidden="true" width="100%" viewBox="0 0 300 120" style={{ display: 'block' }}>
          <path d="M22 116 L22 10 L278 10 L278 116" stroke="#edebe3" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M107 10 V116 M193 10 V116" stroke="#edebe3" strokeWidth="1.5" strokeDasharray="5 6" opacity="0.35" />
        </svg>
        <div style={{ position: 'absolute', left: '7.3%', right: '7.3%', top: '8%', bottom: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {ZONES.map((z, i) => (
            <button
              key={z}
              type="button"
              aria-pressed={value === i}
              aria-label={z}
              onClick={() => onPick(i)}
              style={{ background: value === i ? `${color}22` : 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {value === i &&
                (icon === 'ball' ? (
                  <svg width="44" height="44" viewBox="-15 -15 30 30" aria-hidden="true">
                    <circle r="13" fill="#f3d36b" />
                    <path d="M-6 -5 L0 -9 L6 -5 L4 2 L-4 2 Z" fill="#22302a" />
                  </svg>
                ) : (
                  <svg width="50" height="60" viewBox="-30 -46 60 94" aria-hidden="true" stroke="#9fd0e8" strokeWidth="5" fill="none" strokeLinecap="round">
                    <g transform={`rotate(${i === 0 ? -28 : i === 2 ? 28 : 0})`}>
                      <circle cx="0" cy="-34" r="10" />
                      <path d="M0 -24 L0 14 M0 -14 L-26 -30 M0 -14 L26 -30 M0 14 L-14 46 M0 14 L14 46" />
                    </g>
                  </svg>
                ))}
            </button>
          ))}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-around', fontSize: 15 }} aria-hidden="true">
        {ZONES.map((z, i) => (
          <span key={z} style={{ color: value === i ? color : 'var(--chalk-dim)' }}>
            {z}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PenalesPlay(props: PlayProps<PlayView>) {
  const { game } = props;
  const m = game.match;
  // Reinicia la selección en cada tanda nueva
  return <PenalesTanda key={`${m?.id ?? 'x'}-${m?.tandas.length ?? 0}`} {...props} />;
}

function PenalesTanda({ game, me, players, send }: PlayProps<PlayView>) {
  const g = game;
  const [kick, setKick] = useState<number | null>(null);
  const [dive, setDive] = useState<number | null>(null);
  const rec = g.record;

  if (g.phase === 'intro') {
    return (
      <div className="stack center" style={{ marginTop: 40 }}>
        <h1 className="display h2">Penales</h1>
        <p className="muted">Mini liga todos contra todos. Esperá que el admin arranque la primera fecha.</p>
      </div>
    );
  }
  if (!g.inLeague) {
    return (
      <div className="stack center" style={{ marginTop: 40 }}>
        <h1 className="display h2">Penales</h1>
        <p className="muted">Te sumaste cuando la liga ya estaba armada. ¡Alentá desde la tribuna!</p>
      </div>
    );
  }

  const header = (
    <div className="row between">
      <span className="blue" style={{ fontSize: 20 }}>
        Fecha {g.round + 1} de {g.rounds}
      </span>
      <span className="muted">
        {rec.pg} G · {rec.pp} P
      </span>
    </div>
  );

  if (!g.match) {
    return (
      <div className="stack fade-in">
        {header}
        <div className="stack center" style={{ marginTop: 30 }}>
          <h1 className="display h2">{g.phase === 'done' ? 'Terminó la liga' : g.resting ? 'Esta fecha descansás' : 'Esperando la próxima fecha'}</h1>
          <p className="big">
            Llevás {rec.pg} {rec.pg === 1 ? 'partido ganado' : 'partidos ganados'} de {rec.pj}.
          </p>
        </div>
      </div>
    );
  }

  const m = g.match;
  const rival = players[m.rival];
  const last = m.tandas[m.tandas.length - 1];
  const won = m.winner === me.id;

  return (
    <div className="stack fade-in" style={{ gap: 12 }}>
      {header}
      <div className="row between">
        <div className="row" style={{ gap: 10 }}>
          <span className="display h3">vs</span>
          {rival && <Avatar avatar={rival.avatar} size={52} />}
          <span style={{ fontSize: 26, fontWeight: 700 }}>{rival?.name}</span>
        </div>
        {!m.winner && <Countdown deadline={m.deadline} size={56} />}
      </div>

      {last && (
        <div className="dashed-box stack" style={{ gap: 6, alignItems: 'center' }}>
          <span className="muted">Tanda {m.tandas.length}</span>
          <div className="row" style={{ justifyContent: 'space-around', width: '100%' }}>
            <ShotRow who={me.id} keeper={m.rival} t={last} kickerSide={m.me} players={players} width={140} />
            <ShotRow who={m.rival} keeper={me.id} t={last} kickerSide={m.me === 'a' ? 'b' : 'a'} players={players} width={140} />
          </div>
          {!m.winner && <span className="yellow" style={{ fontSize: 22 }}>{last.aGoal && last.bGoal ? 'Los dos la metieron: ¡otra!' : 'Los dos fallaron: ¡otra!'}</span>}
        </div>
      )}

      {m.winner ? (
        <div className="stack center" style={{ alignItems: 'center', marginTop: 10 }}>
          {won && <Crown size={70} filled />}
          <h1 className={`display h1 ${won ? 'yellow' : 'pink'}`}>{won ? '¡Ganaste!' : 'Perdiste'}</h1>
          <p className="muted">Esperá a que terminen los otros partidos.</p>
        </div>
      ) : m.myPending ? (
        <div className="stack center" style={{ marginTop: 20, alignItems: 'center' }}>
          <ChalkCircle size={70} color="var(--yellow)">
            ✓
          </ChalkCircle>
          <p className="big">Listo. Esperando a {rival?.name}…</p>
        </div>
      ) : (
        <>
          <Picker title="¿A dónde pateás?" value={kick} onPick={setKick} color="#f3d36b" icon="ball" />
          <Picker title="¿Hacia dónde te tirás?" value={dive} onPick={setDive} color="#9fd0e8" icon="keeper" />
          <button className="btn yellow block" disabled={kick === null || dive === null} onClick={() => send({ t: 'game', action: 'choose', payload: { kick, dive } })}>
            ¡Patear!
          </button>
        </>
      )}
    </div>
  );
}
