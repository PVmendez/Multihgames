import { useEffect, useRef, useState } from 'react';
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
// ---------- Animación del remate ----------
// Escena en unidades de 400×300: arco al fondo, pateador adelante. Los personajes son
// los avatares de cada jugador (blob o personaje especial con cuerpo entero).

const GOAL_X = [105, 200, 295]; // centro de cada zona del arco
const SHOT_MS = 2600; // lo que dura cada remate en pantalla

type AvatarLike = PublicPlayer['avatar'];

function Ball({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="-15 -15 30 30" style={{ animation: 'pen-ball-spin 0.6s linear 0.7s 1 both' }}>
      <circle r="13" fill="#f4f1e8" stroke="#0e1612" strokeWidth="1.5" />
      <path d="M-5 -4 L0 -8 L5 -4 L3 2 L-3 2 Z" fill="#1e1e1e" />
      <path d="M-11 4 L-6 6 M11 4 L6 6 M0 13 L0 8" stroke="#1e1e1e" strokeWidth="1.6" />
    </svg>
  );
}

export function PenaltyScene({
  kicker,
  keeper,
  kick,
  dive,
  goal,
  width = 360,
  instant,
  keeperName,
  label
}: {
  kicker: AvatarLike;
  keeper: AvatarLike;
  kick: number;
  dive: number;
  goal: boolean;
  width?: number;
  instant?: boolean;
  keeperName?: string;
  label?: string;
}) {
  const s = width / 400;
  const u = (n: number) => n * s;
  const bx = GOAL_X[kick] - 200;
  const by = 92 - 250;
  const reboundX = kick === 1 ? 30 : kick === 0 ? -150 : 150;
  const reboundY = kick === 1 ? 215 - 250 : 175 - 250;
  const dx = GOAL_X[dive] - 200;
  const rot = dive === 0 ? -78 : dive === 2 ? 78 : 0;
  // Tamaños: los personajes especiales son altos (cuerpo entero), los blobs son redondos.
  const keeperSize = keeper.special ? u(115) / 1.8 : u(74);
  const kickerSize = kicker.special ? u(140) / 1.8 : u(86);
  const vars = { '--s': s, '--dx': `${u(dx)}px`, '--rot': `${rot}deg`, '--bx': `${u(bx)}px`, '--by': `${u(by)}px`, '--rx': `${u(reboundX)}px`, '--ry': `${u(reboundY)}px`, '--nx': `${u(kick === 0 ? -5 : kick === 2 ? 5 : 0)}px` } as React.CSSProperties;

  return (
    <div
      className={`pen-scene${instant ? ' pen-instant' : ''}`}
      style={{ width, height: u(300), ...vars }}
      role="img"
      aria-label={label ?? `Pateó a la ${ZONES[kick].toLowerCase()}, el arquero se tiró a la ${ZONES[dive].toLowerCase()}: ${goal ? 'gol' : 'atajó'}`}
    >
      {/* arco y red en tiza */}
      <svg aria-hidden="true" width={width} height={u(300)} viewBox="0 0 400 300" style={{ left: 0, top: 0 }}>
        <g style={goal ? { animation: 'pen-net 0.45s ease-out 1.25s 2' } : undefined}>
          <path d="M60 40 H340 M60 68 H340 M60 96 H340 M60 124 H340 M95 40 V152 M130 40 V152 M165 40 V152 M200 40 V152 M235 40 V152 M270 40 V152 M305 40 V152" stroke="#edebe3" strokeWidth="1" opacity="0.2" />
        </g>
        <path d="M58 154 L58 38 L342 38 L342 154" stroke="#edebe3" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M0 156 Q200 150 400 157" stroke="#edebe3" strokeWidth="2.5" fill="none" opacity="0.55" />
        <path d="M120 156 L80 228 L320 228 L280 156" stroke="#edebe3" strokeWidth="2" fill="none" opacity="0.25" />
        <ellipse cx="200" cy="250" rx="5" ry="2.5" fill="#edebe3" opacity="0.6" />
      </svg>

      {/* arquero: se balancea y después se tira */}
      <div
        className="pen-anchor"
        style={{
          left: u(200) - keeperSize / 2,
          top: u(154) - (keeper.special ? keeperSize * 1.8 : keeperSize),
          animation: `pen-sway 0.7s ease-in-out 0s 1, pen-dive 0.5s cubic-bezier(.2,.8,.3,1) 0.72s 1 forwards`
        }}
      >
        <Avatar avatar={{ ...keeper, expression: goal ? keeper.expression : 'happy' }} size={keeperSize} body />
      </div>

      {/* pelota */}
      <div
        className="pen-ball"
        style={{
          left: u(200) - u(13),
          top: u(250) - u(13),
          zIndex: 3,
          animation: goal ? 'pen-ball-goal 0.55s ease-out 0.7s 1 forwards' : 'pen-ball-save 0.9s ease-out 0.7s 1 forwards'
        }}
      >
        <Ball size={u(26)} />
      </div>

      {/* pateador: carrera y remate */}
      <div
        className="pen-anchor"
        style={{
          left: u(200) - kickerSize / 2,
          top: u(296) - (kicker.special ? kickerSize * 1.8 : kickerSize),
          zIndex: 2,
          animation: 'pen-kicker 1s linear 0s 1 both'
        }}
      >
        <Avatar avatar={kicker} size={kickerSize} body />
      </div>

      {/* resultado */}
      <div className="pen-result" style={{ top: u(58), fontSize: u(goal ? 64 : 46), color: goal ? 'var(--yellow)' : 'var(--pink)', zIndex: 4, animationDelay: '1.3s' }}>
        {goal ? '¡GOOOL!' : keeperName ? `¡Atajó ${keeperName}!` : '¡ATAJÓ!'}
      </div>
    </div>
  );
}

/**
 * Repite la última tanda: primero patea A (ataja B) y después patea B (ataja A).
 * Cada resultado se muestra recién cuando termina su animación, y al final avisa con onDone.
 */
function TandaReplay({ t, a, b, players, width, onDone }: { t: Tanda; a: string; b: string; players: Record<string, PublicPlayer>; width: number; onDone?: () => void }) {
  const [step, setStep] = useState(0); // remate que se está mostrando
  const [shown, setShown] = useState(0); // cuántos resultados ya se ven
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const ids = [
      window.setTimeout(() => setShown(1), 1500),
      window.setTimeout(() => setStep(1), SHOT_MS),
      window.setTimeout(() => {
        setShown(2);
        done.current?.();
      }, SHOT_MS + 1500)
    ];
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, []);
  const pa = players[a];
  const pb = players[b];
  if (!pa || !pb) return null;
  const first = step === 0;
  const kicker = first ? pa : pb;
  const keeper = first ? pb : pa;
  const kick = first ? t.a.kick : t.b.kick;
  const dive = first ? t.b.dive : t.a.dive;
  const goal = first ? t.aGoal : t.bGoal;
  const res = (ok: boolean, visible: boolean) =>
    visible ? <b className={ok ? 'yellow' : 'pink'}>{ok ? 'gol' : 'atajada'}</b> : <b className="muted">…</b>;
  return (
    <div className="stack" style={{ gap: 4, alignItems: 'center' }}>
      <span style={{ fontSize: 17, textAlign: 'center' }}>
        Patea <b>{kicker.name}</b> · ataja <b>{keeper.name}</b>
      </span>
      <PenaltyScene key={step} kicker={kicker.avatar} keeper={keeper.avatar} kick={kick} dive={dive} goal={goal} width={width} keeperName={keeper.name} />
      <div className="row wrap" style={{ gap: 14, fontSize: 16, justifyContent: 'center' }}>
        <span>
          {pa.name}: {res(t.aGoal, shown >= 1)}
        </span>
        <span>
          {pb.name}: {res(t.bGoal, shown >= 2)}
        </span>
      </div>
    </div>
  );
}

/** Devuelve `value`, pero cada cambio llega recién después de `ms`. */
function useDelayed<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(value), ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return shown;
}

/** Demo que se repite en la pantalla de explicación. */
function DemoLoop({ width }: { width: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => x + 1), SHOT_MS + 400);
    return () => window.clearInterval(id);
  }, []);
  const demos = [
    { kick: 0, dive: 2, goal: true },
    { kick: 2, dive: 2, goal: false },
    { kick: 1, dive: 0, goal: true },
    { kick: 0, dive: 0, goal: false }
  ];
  const d = demos[n % demos.length];
  return (
    <PenaltyScene
      key={n}
      kicker={{ seed: 'pateador', hue: 40, expression: 'smug' }}
      keeper={{ seed: 'arquero9', hue: 200, expression: 'surprised' }}
      {...d}
      width={width}
      label="Ejemplo de un penal"
    />
  );
}

// ---------- Pantalla grande ----------

/** Un partido en la pantalla grande. El ganador se revela cuando termina la animación. */
function MatchCard({ m, players }: { m: MatchView; players: Record<string, PublicPlayer> }) {
  const n = m.tandas.length;
  const [seen, setSeen] = useState(0); // tandas cuya animación ya terminó
  const last = m.tandas[n - 1];
  const revealed = seen >= n;
  const winner = revealed ? m.winner : null;
  return (
    <div className="dashed-box stack fade-in" style={{ gap: 10, borderColor: winner ? '#f3d36b66' : undefined }}>
      <div className="row between">
        {[m.a, m.b].map((pid, i) => (
          <div key={pid} className="row" style={{ gap: 8, flexDirection: i ? 'row-reverse' : 'row' }}>
            <span style={{ position: 'relative' }}>
              {winner === pid && (
                <span style={{ position: 'absolute', left: 10, top: -18 }}>
                  <Crown size={32} />
                </span>
              )}
              {players[pid] && (
                <Avatar
                  avatar={winner ? { ...players[pid].avatar, expression: winner === pid ? 'happy' : 'sad' } : players[pid].avatar}
                  size={50}
                  offline={!players[pid].connected}
                />
              )}
            </span>
            <span style={{ fontSize: 24, fontWeight: 700 }}>{players[pid]?.name}</span>
          </div>
        ))}
      </div>
      {last && <TandaReplay key={n} t={last} a={m.a} b={m.b} players={players} width={360} onDone={() => setSeen(n)} />}
      <div className="row between" style={{ fontSize: 19, minHeight: 50 }}>
        {winner ? (
          <span className="yellow" style={{ fontWeight: 700 }}>
            Ganó {players[winner]?.name}
            {n > 1 ? ` en la tanda ${n}` : ''}
          </span>
        ) : m.winner ? (
          <span className="muted">Pateando…</span>
        ) : (
          <>
            <span>
              {revealed && last ? (
                <span className="yellow">{last.aGoal ? 'Los dos la metieron' : 'Los dos fallaron'}: ¡otra tanda! </span>
              ) : null}
              <span className="muted">
                {players[m.a]?.name} {m.ready.a ? '✓' : '…'} · {players[m.b]?.name} {m.ready.b ? '✓' : '…'}
              </span>
            </span>
            <Countdown deadline={m.deadline} size={46} />
          </>
        )}
      </div>
    </div>
  );
}

export function PenalesHost({ game, players, send }: HostProps<HostView>) {
  const g = game;
  const active = g.matches.filter((m) => !m.winner);
  const nextDeadline = active.length ? Math.min(...active.map((m) => m.deadline)) : null;
  useWhenTimeUp(nextDeadline, g.phase === 'playing', () => send({ t: 'game', action: 'timeout' }));

  // La tabla se actualiza cuando terminan las animaciones, para no adelantar resultados.
  const shownTable = useDelayed(g.table, SHOT_MS + 1700);
  const table = [...shownTable].sort((x, y) => y.pg - x.pg || y.gf - y.gc - (x.gf - x.gc) || y.gf - x.gf);

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
            <DemoLoop width={420} />
          </div>
        ) : (
          <>
            <div className="row wrap" style={{ gap: 16, alignItems: 'baseline' }}>
              <h2 className="display h2">
                Fecha {g.round + 1} de {g.rounds}
              </h2>
              {g.bye && <span className="muted big">Descansa: {players[g.bye]?.name}</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 18 }}>
              {g.matches.map((m) => (
                <MatchCard key={m.id} m={m} players={players} />
              ))}
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
  const [replayed, setReplayed] = useState(false); // ya terminó la animación de la última tanda
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
          <TandaReplay t={last} a={m.a} b={m.b} players={players} width={300} onDone={() => setReplayed(true)} />
          {!m.winner && replayed && <span className="yellow" style={{ fontSize: 22 }}>{last.aGoal && last.bGoal ? 'Los dos la metieron: ¡otra!' : 'Los dos fallaron: ¡otra!'}</span>}
        </div>
      )}

      {m.winner && !replayed ? null : m.winner ? (
        <div className="stack center fade-in" style={{ alignItems: 'center', marginTop: 10 }}>
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
