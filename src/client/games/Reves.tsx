import { useEffect, useRef, useState } from 'react';
import { Avatar, ChalkCircle, Countdown } from '../components/chalk';
import { audioContext, decode, peaks, play, reversed, startRecording, type Recording } from '../lib/audio';
import { hostSession } from '../lib/room';
import { RoundLabel, useWhenTimeUp, type HostProps, type PlayProps } from './common';

interface HostView {
  type: 'reves';
  phase: 'intro' | 'listen' | 'reveal';
  turn: number;
  turns: number;
  deadline: number;
  player: string | null; // a quién le toca
  nextPlayer: string | null;
  category: string | null;
  tries: string[];
  maxTries: number;
  correct: boolean | null;
  gained: number | null;
  answer: string | null;
  table: { playerId: string; points: number; correct: number; played: number }[];
}

interface PlayView {
  type: 'reves';
  phase: 'intro' | 'listen' | 'reveal';
  turn: number;
  turns: number;
  deadline: number;
  myTurn: boolean;
  player: string | null;
  nextIsMe: boolean;
  category: string | null;
  tries: string[];
  maxTries: number;
  correct: boolean | null;
  gained: number | null;
  answer: string | null;
  myPoints: number;
  myCorrect: number;
}

function Wave({ data, color = 'var(--chalk)' }: { data: number[] | null; color?: string }) {
  const bars = data ?? Array.from({ length: 40 }, () => 0.06);
  return (
    <svg role="img" aria-label="Onda del audio" width="100%" height="80" viewBox="0 0 400 80" preserveAspectRatio="none">
      {bars.map((v, i) => {
        const x = 5 + i * (390 / bars.length);
        const h = Math.max(2, v * 34);
        return <line key={i} x1={x} x2={x} y1={40 - h} y2={40 + h} stroke={color} strokeWidth="4" strokeLinecap="round" />;
      })}
    </svg>
  );
}

export function RevesHost({ game, room, players, send }: HostProps<HostView>) {
  const g = game;
  const [clip, setClip] = useState<AudioBuffer | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  useWhenTimeUp(g.deadline, g.phase === 'listen', () => send({ t: 'game', action: 'reveal' }));

  // Cada famoso nuevo: bajar la voz, darla vuelta y reproducirla.
  useEffect(() => {
    if (g.phase !== 'listen') return;
    let cancelled = false;
    setClip(null);
    setLoadErr(null);
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${room.code}/tts`, { headers: { 'x-admin-token': hostSession.get(room.code) ?? '' } });
        if (!res.ok) throw new Error(await res.text());
        const buf = await decode(await res.arrayBuffer());
        if (cancelled) return;
        setClip(buf);
        stopRef.current();
        setPlaying(true);
        stopRef.current = play(reversed(buf), () => setPlaying(false));
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error && e.message ? e.message : 'No se pudo generar la voz');
      }
    })();
    return () => {
      cancelled = true;
      stopRef.current();
    };
  }, [g.phase, g.turn, room.code]);

  const playClip = (backwards: boolean) => {
    if (!clip) return;
    stopRef.current();
    setPlaying(true);
    stopRef.current = play(backwards ? reversed(clip) : clip, () => setPlaying(false));
  };

  const last = g.turn + 1 >= g.turns;
  const who = g.player ? players[g.player] : null;
  const next = g.nextPlayer ? players[g.nextPlayer] : null;
  const table = [...g.table].sort((a, b) => b.points - a.points);
  return (
    <div className="row" style={{ alignItems: 'stretch', gap: 'clamp(24px, 4vw, 56px)', flex: 1, flexWrap: 'wrap' }}>
      <div className="stack grow" style={{ minWidth: 300 }}>
        <RoundLabel round={g.turn} rounds={g.turns} noun="turno" />
        {g.phase === 'intro' && (
          <div className="stack">
            <p className="big" style={{ margin: 0 }}>
              Por turnos: a cada uno le toca <b>su propio famoso</b>. Suena su nombre <b>al revés</b>, el jugador lo imita y se graba con el celu, y el celu lo da vuelta: si lo imitó bien, va a escuchar el nombre al derecho.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Solo responde al que le toca, con 3 intentos. Al primero suma 5, al segundo 3 y al tercero 2, y si acierta rápido gana +2 o +1. ¡Los demás no soplen!
            </p>
          </div>
        )}
        {g.phase !== 'intro' && who && (
          <div className="row" style={{ gap: 18, alignItems: 'flex-end' }}>
            <Avatar avatar={g.phase === 'reveal' ? { ...who.avatar, expression: g.correct ? 'happy' : 'sad' } : who.avatar} size={90} body />
            <div>
              <div className="muted big">Le toca a</div>
              <div className="display" style={{ fontSize: 'clamp(44px, 6vw, 72px)' }}>
                {who.name}
              </div>
            </div>
          </div>
        )}
        {g.phase === 'listen' && (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <h2 className="display" style={{ fontSize: 'clamp(54px, 8vw, 100px)' }}>
              ¿Quién es?
            </h2>
            {g.category && (
              <div className="paper" style={{ transform: 'rotate(-2deg)', padding: '8px 18px', fontSize: 26 }}>
                Pista: <b>{g.category}</b>
              </div>
            )}
            {loadErr ? (
              <p className="pink big">{loadErr}</p>
            ) : (
              <button className="btn yellow" disabled={!clip || playing} onClick={() => playClip(true)}>
                {!clip ? 'Preparando la voz…' : playing ? 'Sonando…' : 'Escuchar de nuevo'}
              </button>
            )}
            <div className="row" style={{ gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              {Array.from({ length: g.maxTries }, (_, i) => (
                <span key={i} className={g.tries[i] ? 'pink crossed' : 'muted'} style={{ fontSize: 24, opacity: 1 }}>
                  {g.tries[i] ? `«${g.tries[i]}»` : `intento ${i + 1}`}
                </span>
              ))}
            </div>
            <Countdown deadline={g.deadline} size={80} />
          </div>
        )}
        {g.phase === 'reveal' && (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div className={`big ${g.correct ? 'yellow' : 'pink'}`}>{g.correct ? `¡Lo sacó! +${g.gained}` : 'No lo sacó. Era…'}</div>
            <h2 className="display yellow" style={{ fontSize: 'clamp(54px, 8vw, 110px)' }}>
              {g.answer}
            </h2>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <button className="btn small" disabled={!clip} onClick={() => playClip(false)}>
                Escuchar al derecho
              </button>
              <button className="btn small" disabled={!clip} onClick={() => playClip(true)}>
                Al revés otra vez
              </button>
            </div>
          </div>
        )}
        <div className="push row">
          {g.phase === 'listen' ? (
            <button className="btn small" onClick={() => send({ t: 'game', action: 'reveal' })}>
              Revelar ya
            </button>
          ) : !last ? (
            <button
              className="btn yellow"
              onClick={() => {
                audioContext(); // habilita el audio con este toque
                send({ t: 'game', action: 'start-round' });
              }}
            >
              {g.turn < 0 ? `Arranca ${next?.name ?? ''}` : `Turno de ${next?.name ?? 'el siguiente'}`}
            </button>
          ) : (
            <span className="muted">Era el último turno: terminá el juego para pasar los puntos.</span>
          )}
        </div>
      </div>

      <div className="stack" style={{ width: 'min(100%, 360px)', gap: 4 }}>
        <h2 className="display h3">Puntos</h2>
        {table.map((r) => {
          const p = players[r.playerId];
          if (!p) return null;
          return (
            <div key={r.playerId} className="score-row" style={{ minHeight: 56 }}>
              <Avatar avatar={p.avatar} size={44} offline={!p.connected} />
              <span className="grow" style={{ fontSize: 22, fontWeight: 700 }}>
                {p.name}
                <div className="muted" style={{ fontSize: 16, fontWeight: 400 }}>
                  {r.correct}/{r.played} aciertos
                </div>
              </span>
              <span className="total" style={{ color: r.playerId === g.player && g.phase === 'listen' ? 'var(--yellow)' : undefined }}>
                {r.points}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RevesPlay({ game, players, send }: PlayProps<PlayView>) {
  const g = game;
  return <RevesRound key={`${g.turn}`} g={g} send={send} players={players} />;
}

function RevesRound({ g, send, players }: { g: PlayView; send: PlayProps<PlayView>['send']; players: PlayProps<PlayView>['players'] }) {
  const [rec, setRec] = useState<Recording | null>(null);
  const [clip, setClip] = useState<AudioBuffer | null>(null);
  const [wave, setWave] = useState<number[] | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const recRef = useRef<Recording | null>(null);
  recRef.current = rec;

  // Al cambiar de famoso o salir: cortar audio y micrófono.
  useEffect(
    () => () => {
      stopRef.current();
      recRef.current?.cancel();
    },
    []
  );

  if (g.phase === 'intro') {
    return (
      <div className="stack center" style={{ marginTop: 40 }}>
        <h1 className="display h2">Nombres al revés</h1>
        <p className="muted">Se juega por turnos: cuando te toque, acá vas a grabarte y responder.</p>
      </div>
    );
  }

  const who = g.player ? players[g.player] : null;

  if (g.phase === 'reveal') {
    return (
      <div className="stack center fade-in" style={{ marginTop: 20 }}>
        <div className="muted">{g.myTurn ? 'Tu famoso era…' : `El de ${who?.name ?? ''} era…`}</div>
        <h1 className="display h1 yellow">{g.answer}</h1>
        {g.myTurn && <p className="big">{g.correct ? <span className="yellow">¡Lo sacaste! +{g.gained}</span> : <span className="pink">Esta vez no</span>}</p>}
        {g.nextIsMe && <p className="big yellow">¡Ahora te toca a vos!</p>}
        <p className="muted">
          Llevás {g.myPoints} puntos ({g.myCorrect} aciertos).
        </p>
      </div>
    );
  }

  if (!g.myTurn) {
    return (
      <div className="stack center fade-in" style={{ marginTop: 30, alignItems: 'center' }}>
        <div className="muted big">Le toca a</div>
        {who && <Avatar avatar={who.avatar} size={110} body />}
        <h1 className="display h2">{who?.name}</h1>
        {g.category && <span className="yellow">Pista: {g.category}</span>}
        <p className="big">Escuchá la tele… ¡y no soples!</p>
        {g.tries.length > 0 && (
          <div className="stack" style={{ gap: 2 }}>
            {g.tries.map((t, i) => (
              <span key={i} className="pink crossed">
                «{t}»
              </span>
            ))}
          </div>
        )}
        {g.nextIsMe && <p className="yellow big">Después te toca a vos</p>}
        <Countdown deadline={g.deadline} size={58} />
      </div>
    );
  }

  const toggleRec = async () => {
    setErr(null);
    if (rec) {
      try {
        const buf = await rec.stop();
        setRec(null);
        setClip(buf);
        const rev = reversed(buf);
        setWave(peaks(rev));
        stopRef.current();
        stopRef.current = play(rev);
      } catch (e) {
        setRec(null);
        setErr(e instanceof Error && e.message === 'Grabación muy corta' ? 'Muy cortito: mantené grabando un poco más' : 'No se pudo procesar la grabación, probá de nuevo');
      }
    } else {
      try {
        stopRef.current();
        setRec(await startRecording());
      } catch {
        setErr('Necesito permiso para usar el micrófono');
      }
    }
  };

  const left = g.maxTries - g.tries.length;
  const sent = left <= 0;
  return (
    <div className="stack fade-in">
      <div className="row between">
        <div>
          <span className="yellow" style={{ fontSize: 20, fontWeight: 700 }}>
            ¡Te toca!
          </span>
          <h1 className="display h2">¿Quién es?</h1>
          {g.category && (
            <span className="yellow" style={{ fontSize: 18 }}>
              Pista: {g.category}
            </span>
          )}
        </div>
        <Countdown deadline={g.deadline} size={58} />
      </div>

      <ol className="stack" style={{ margin: 0, paddingLeft: 22, gap: 4, fontSize: 20 }}>
        <li className={clip ? 'crossed' : ''}>Escuchá la pantalla grande</li>
        <li className={clip ? 'crossed' : ''}>Imitalo y grabate</li>
        <li className={clip ? 'yellow' : 'muted'}>Escuchá tu grabación al revés</li>
      </ol>

      <div className="dashed-box stack" style={{ alignItems: 'center' }}>
        <Wave data={wave} color={rec ? 'var(--pink)' : 'var(--chalk)'} />
        <div className="row" style={{ gap: 18 }}>
          <button
            onClick={toggleRec}
            disabled={sent}
            aria-label={rec ? 'Parar la grabación' : 'Grabar'}
            style={{ width: 88, height: 88, borderRadius: '50%', border: `4px solid ${rec ? 'var(--pink)' : 'var(--chalk)'}`, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {rec ? (
              <span style={{ width: 28, height: 28, background: 'var(--pink)', borderRadius: 4 }} />
            ) : (
              <span style={{ width: 34, height: 34, background: 'var(--pink)', borderRadius: '50%' }} />
            )}
          </button>
          <button
            onClick={() => {
              if (!clip) return;
              stopRef.current();
              stopRef.current = play(reversed(clip));
            }}
            disabled={!clip || !!rec}
            aria-label="Escuchar al revés"
            style={{ width: 88, height: 88, borderRadius: '50%', border: '4px solid var(--yellow)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: clip ? 1 : 0.4 }}
          >
            <svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40">
              <path d="M30 6 L10 20 L30 34 Z" stroke="var(--yellow)" strokeWidth="3.5" fill="none" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <span className="muted">{rec ? 'Grabando… tocá para parar' : clip ? 'Podés escucharlo o grabar de nuevo' : 'Tocá el botón rojo para grabar'}</span>
        {clip && !rec && (
          <button
            type="button"
            className="chip"
            onClick={() => {
              stopRef.current();
              stopRef.current = play(clip);
            }}
          >
            Escuchar mi grabación al derecho
          </button>
        )}
        {err && <span className="pink">{err}</span>}
        <span className="muted" style={{ fontSize: 14, textAlign: 'center' }}>
          ¿No se escucha? Subí el volumen del celu.
        </span>
      </div>

      {g.tries.length > 0 && (
        <div className="row wrap" style={{ gap: 10 }}>
          {g.tries.map((t, i) => (
            <span key={i} className="pink crossed">
              «{t}»
            </span>
          ))}
          <span className="muted">no era</span>
        </div>
      )}
      {sent ? (
        <div className="center big pink">Sin intentos. Esperá a que se revele.</div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) {
              send({ t: 'game', action: 'guess', payload: { text } });
              setText('');
            }
          }}
        >
          <label htmlFor="resp" className="pink" style={{ fontSize: 20, fontWeight: 700 }}>
            Tu respuesta <span className="muted" style={{ fontWeight: 400 }}>· {left} {left === 1 ? 'intento' : 'intentos'}</span>
          </label>
          <input id="resp" className="chalk-input" value={text} maxLength={60} autoComplete="off" onChange={(e) => setText(e.target.value)} placeholder="Nombre del famoso" />
          <button className="btn yellow" disabled={!text.trim()}>
            Adivinar
          </button>
        </form>
      )}
    </div>
  );
}
