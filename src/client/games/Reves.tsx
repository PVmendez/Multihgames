import { useEffect, useRef, useState } from 'react';
import { Avatar, ChalkCircle, Countdown } from '../components/chalk';
import { audioContext, decode, peaks, play, reversed, startRecording, type Recording } from '../lib/audio';
import { hostSession } from '../lib/room';
import { RoundLabel, useWhenTimeUp, type HostProps, type PlayProps } from './common';

interface HostView {
  type: 'reves';
  phase: 'intro' | 'listen' | 'reveal';
  round: number;
  rounds: number;
  deadline: number;
  answer: string | null;
  answered: string[];
  guesses: { playerId: string; text: string | null; correct: boolean; points: number }[];
  points: Record<string, number>;
}

interface PlayView {
  type: 'reves';
  phase: 'intro' | 'listen' | 'reveal';
  round: number;
  rounds: number;
  deadline: number;
  myGuess: string | null;
  correct: boolean | null;
  gained: number | null;
  answer: string | null;
  myPoints: number;
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
  }, [g.phase, g.round, room.code]);

  const playClip = (backwards: boolean) => {
    if (!clip) return;
    stopRef.current();
    setPlaying(true);
    stopRef.current = play(backwards ? reversed(clip) : clip, () => setPlaying(false));
  };

  const last = g.round + 1 >= g.rounds;
  return (
    <div className="row" style={{ alignItems: 'stretch', gap: 'clamp(24px, 4vw, 56px)', flex: 1, flexWrap: 'wrap' }}>
      <div className="stack grow" style={{ minWidth: 300 }}>
        <RoundLabel round={g.round} rounds={g.rounds} noun="famoso" />
        {g.phase === 'intro' && (
          <div className="stack">
            <p className="big" style={{ margin: 0 }}>
              Va a sonar el nombre de un famoso <b>al revés</b>. Cada uno lo imita y se graba con el celu; el celu lo da vuelta y, si lo imitaste bien, vas a escuchar el nombre al derecho.
            </p>
            <p className="muted" style={{ margin: 0 }}>Acertar suma 5 puntos, y los tres más rápidos se llevan +3, +2 y +1.</p>
          </div>
        )}
        {g.phase === 'listen' && (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <h2 className="display" style={{ fontSize: 'clamp(60px, 9vw, 120px)' }}>
              ¿Quién es?
            </h2>
            {loadErr ? (
              <p className="pink big">{loadErr}</p>
            ) : (
              <button className="btn yellow" disabled={!clip || playing} onClick={() => playClip(true)}>
                {!clip ? 'Preparando la voz…' : playing ? 'Sonando…' : 'Escuchar de nuevo'}
              </button>
            )}
            <Countdown deadline={g.deadline} size={90} />
          </div>
        )}
        {g.phase === 'reveal' && (
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div className="muted big">Era…</div>
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
              {g.round < 0 ? 'Primer famoso' : 'Siguiente famoso'}
            </button>
          ) : (
            <span className="muted">Era el último: terminá el juego para pasar los puntos.</span>
          )}
        </div>
      </div>

      <div className="stack" style={{ width: 'min(100%, 380px)', gap: 4 }}>
        <h2 className="display h3">{g.phase === 'reveal' ? 'Respuestas' : 'Respondieron'}</h2>
        {room.players.map((p) => {
          const gs = g.guesses.find((x) => x.playerId === p.id);
          const done = g.answered.includes(p.id);
          return (
            <div key={p.id} className="score-row" style={{ minHeight: 56 }}>
              <Avatar avatar={gs?.correct ? { ...p.avatar, expression: 'love' } : p.avatar} size={44} offline={!p.connected} />
              <span className="grow" style={{ fontSize: 22, fontWeight: 700 }}>
                {players[p.id]?.name}
                {g.phase === 'reveal' && (
                  <div className={gs?.correct ? 'yellow' : 'muted'} style={{ fontSize: 18, fontWeight: 400 }}>
                    {gs?.text ?? '(no respondió)'}
                  </div>
                )}
              </span>
              {g.phase === 'reveal' ? (
                <span className={gs?.correct ? 'yellow' : 'muted'} style={{ fontSize: 24, fontWeight: 700 }}>
                  {gs?.correct ? `+${gs.points}` : '0'}
                </span>
              ) : (
                g.phase === 'listen' && (done ? <ChalkCircle size={34} color="var(--yellow)">✓</ChalkCircle> : <span className="muted">…</span>)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RevesPlay({ game, send }: PlayProps<PlayView>) {
  const g = game;
  return <RevesRound key={`${g.round}`} g={g} send={send} />;
}

function RevesRound({ g, send }: { g: PlayView; send: PlayProps<PlayView>['send'] }) {
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
        <p className="muted">Prestá atención a la pantalla grande. Acá vas a grabarte.</p>
      </div>
    );
  }

  if (g.phase === 'reveal') {
    return (
      <div className="stack center fade-in" style={{ marginTop: 20 }}>
        <div className="muted">Era…</div>
        <h1 className="display h1 yellow">{g.answer}</h1>
        {g.myGuess ? (
          <p className="big">
            Pusiste «{g.myGuess}»: {g.correct ? <span className="yellow">¡bien! +{g.gained}</span> : <span className="pink">no era</span>}
          </p>
        ) : (
          <p className="big pink">No respondiste</p>
        )}
        <p className="muted">Llevás {g.myPoints} puntos en este juego.</p>
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

  const sent = !!g.myGuess;
  return (
    <div className="stack fade-in">
      <div className="row between">
        <div>
          <RoundLabel round={g.round} rounds={g.rounds} noun="Famoso" />
          <h1 className="display h2">¿Quién es?</h1>
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

      {sent ? (
        <div className="center big">
          Mandaste «{g.myGuess}». <span className="muted">Esperá a que se revele.</span>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send({ t: 'game', action: 'guess', payload: { text } });
          }}
        >
          <label htmlFor="resp" className="pink" style={{ fontSize: 20, fontWeight: 700 }}>
            Tu respuesta
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
