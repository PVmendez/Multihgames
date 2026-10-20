import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { GAME_INFO, type HostMessage, type PublicPlayer, type RoomView } from '../../shared/types';
import { Avatar, ChalkCircle, Connection, Crown, Ledge, QR, Tally, Toast, Underline } from '../components/chalk';
import { joinUrl, useRoom } from '../lib/room';
import { pendingPin } from './Create';
import { ChessHost } from '../games/Chess';
import { RevesHost } from '../games/Reves';
import { PalabraHost } from '../games/Palabra';

// Mapillary pesa ~1 MB: se baja solo cuando se juega GeoGuesser.
const GeoHost = lazy(() => import('../games/Geo').then((m) => ({ default: m.GeoHost })));

export type Send = ReturnType<typeof useRoom>['send'];

export function playerMap(room: RoomView): Record<string, PublicPlayer> {
  return Object.fromEntries(room.players.map((p) => [p.id, p]));
}

export function Host({ code }: { code: string }) {
  const { status, state, send, error } = useRoom(code, 'host');
  const [pin, setPin] = useState('');
  const triedPending = useRef(false);

  useEffect(() => {
    if (status === 'need-pin' && !triedPending.current) {
      triedPending.current = true;
      const p = pendingPin.take(code);
      if (p) send({ t: 'hello-host', pin: p });
    }
  }, [status, code, send]);

  let body;
  if (status === 'need-pin') {
    body = (
      <form
        className="stack fade-in"
        style={{ maxWidth: 420, margin: '12vh auto', padding: 24 }}
        onSubmit={(e) => {
          e.preventDefault();
          send({ t: 'hello-host', pin });
        }}
      >
        <h1 className="display h2">Sala {code}</h1>
        <label htmlFor="pin" className="label">
          PIN del admin
        </label>
        <input id="pin" className="chalk-input" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        <button className="btn yellow" disabled={pin.length < 4}>
          Abrir pantalla
        </button>
      </form>
    );
  } else if (status === 'fatal') {
    body = (
      <div className="stack" style={{ maxWidth: 520, margin: '15vh auto', padding: 24 }}>
        <h1 className="display h2">Esta sala no existe</h1>
        <a href="/crear">Armar un evento nuevo</a>
      </div>
    );
  } else if (!state) {
    body = <div style={{ padding: 40 }} className="display h2">Conectando…</div>;
  } else {
    body = <HostScreen msg={state} send={send} />;
  }

  return (
    <div className="frame">
      <main className="slate">{body}</main>
      <Ledge />
      <Toast message={error} />
      {state && <Connection status={status} />}
    </div>
  );
}

function HostScreen({ msg, send }: { msg: HostMessage; send: Send }) {
  const { room } = msg;
  if (room.phase === 'lobby') return <Lobby room={room} send={send} />;
  if (room.phase === 'results') return <Results room={room} send={send} />;
  if (room.phase === 'final') return <Final room={room} />;

  const game = msg.game as { type: string } | null;
  const players = playerMap(room);
  const info = GAME_INFO[room.games[room.gameIndex].type];
  const props = { game: game as any, room, players, send };
  return (
    <div className="host fade-in" style={{ flexDirection: 'column', gap: 10 }}>
      <div className="row between wrap">
        <div className="row" style={{ gap: 18, alignItems: 'baseline' }}>
          <h1 className="display h2">{info.name}</h1>
          <span className="blue" style={{ fontSize: 20 }}>
            juego {room.gameIndex + 1} de {room.games.length}
          </span>
        </div>
        <div className="row">
          <span className="muted">
            Código <b style={{ color: 'var(--chalk)', letterSpacing: '0.1em' }}>{room.code}</b>
          </span>
          <button
            className="btn small pink"
            onClick={() => {
              if (confirm('¿Terminar el juego y pasar los puntos a la tabla general?')) send({ t: 'room', action: 'end-game' });
            }}
          >
            Terminar juego
          </button>
        </div>
      </div>
      {game?.type === 'chess' && <ChessHost {...props} />}
      {game?.type === 'reves' && <RevesHost {...props} />}
      {game?.type === 'geo' && (
          <Suspense fallback={<div className="display h3">Cargando el mapa…</div>}>
            <GeoHost {...props} />
          </Suspense>
        )}
      {game?.type === 'palabra' && <PalabraHost {...props} />}
    </div>
  );
}

function GamesList({ room }: { room: RoomView }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="display h3 yellow">Hoy se juega:</div>
      {room.games.map((g, i) => {
        const done = !!room.results[i];
        const now = i === room.gameIndex && room.phase !== 'final';
        return (
          <div key={i} className="row" style={{ gap: 14 }}>
            <ChalkCircle size={40}>{i + 1}</ChalkCircle>
            <div className="grow">
              <div className={done ? 'crossed' : ''} style={{ fontSize: 24, lineHeight: 1.1 }}>
                {GAME_INFO[g.type].name}
              </div>
              <div className="muted" style={{ fontSize: 16 }}>
                {GAME_INFO[g.type].mode}
              </div>
            </div>
            {now && (
              <span className="pink" style={{ fontSize: 22, fontWeight: 700, transform: 'rotate(-6deg)' }}>
                ← {room.phase === 'game' ? 'ahora' : 'sigue'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function JoinNote({ code }: { code: string }) {
  return (
    <div className="paper row" style={{ transform: 'rotate(2.5deg)', gap: 14, alignSelf: 'flex-start' }}>
      <QR text={joinUrl(code)} size={110} />
      <div>
        <div style={{ fontSize: 17, lineHeight: 1.1 }}>Sumate desde el celu</div>
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '0.08em', lineHeight: 1.1 }}>{code}</div>
        <div style={{ fontSize: 13 }}>{location.host}</div>
      </div>
    </div>
  );
}

function Lobby({ room, send }: { room: RoomView; send: Send }) {
  const next = room.games[0];
  return (
    <div className="host fade-in">
      <div className="host-side">
        <div>
          <div className="blue" style={{ fontSize: 20 }}>
            {room.name}
          </div>
          <h1 className="display h1">Noche de juegos</h1>
          <Underline width={300} />
        </div>
        <GamesList room={room} />
      </div>
      <div className="host-main">
        <div className="row between wrap" style={{ alignItems: 'flex-start', gap: 24 }}>
          <div>
            <h2 className="display h2">Anotados</h2>
            <span className="muted">
              {room.players.length} de {room.maxPlayers} · tocá un nombre para sacarlo
            </span>
          </div>
          <JoinNote code={room.code} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 18, marginTop: 8 }}>
          {room.players.map((p) => (
            <button
              key={p.id}
              className="stack fade-in"
              style={{ alignItems: 'center', gap: 4, background: 'none', border: 0, color: 'inherit', cursor: 'pointer' }}
              onClick={() => confirm(`¿Sacar a ${p.name} de la sala?`) && send({ t: 'room', action: 'kick', payload: { playerId: p.id } })}
            >
              <Avatar avatar={p.avatar} size={84} offline={!p.connected} />
              <span style={{ fontSize: 24, fontWeight: 700 }}>{p.name}</span>
            </button>
          ))}
          {!room.players.length && <div className="muted big">Esperando que se sume gente…</div>}
        </div>
        <div className="push row">
          <button className="btn yellow" disabled={!room.players.length} onClick={() => send({ t: 'room', action: 'start-game' })}>
            Arrancar: {GAME_INFO[next.type].name}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GeneralTable({ room, highlight }: { room: RoomView; highlight?: boolean }) {
  const rows = [...room.players].sort((a, b) => (room.totals[b.id] ?? 0) - (room.totals[a.id] ?? 0));
  const top = rows.length ? room.totals[rows[0].id] ?? 0 : 0;
  return (
    <div className="stack" style={{ gap: 0 }}>
      {rows.map((p) => {
        const total = room.totals[p.id] ?? 0;
        const lead = highlight !== false && total > 0 && total === top;
        return (
          <div key={p.id} className="score-row">
            <span style={{ position: 'relative', width: 58, height: 58, flex: 'none' }}>
              {lead && (
                <span style={{ position: 'absolute', left: 10, top: -18, transform: 'rotate(-12deg)' }}>
                  <Crown size={38} />
                </span>
              )}
              <Avatar avatar={p.avatar} size={58} offline={!p.connected} />
            </span>
            <span className="name">{p.name}</span>
            <span className="tally">
              <Tally count={total} />
            </span>
            <span className="total" style={{ color: lead ? 'var(--yellow)' : undefined }}>
              {lead ? <ChalkCircle size={60} color="var(--yellow)">{total}</ChalkCircle> : total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Results({ room, send }: { room: RoomView; send: Send }) {
  const lastIndex = room.gameIndex - 1;
  const last = room.results[lastIndex];
  const players = playerMap(room);
  const done = room.gameIndex >= room.games.length;
  return (
    <div className="host fade-in">
      <div className="host-side">
        {last && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="blue" style={{ fontSize: 20 }}>
              Terminó
            </div>
            <h1 className="display h2">{GAME_INFO[last.type].name}</h1>
            {last.ranking.map((r) => (
              <div key={r.playerId} className="row" style={{ fontSize: 22 }}>
                <span style={{ width: 28, fontWeight: 700 }} className={r.place === 1 ? 'yellow' : ''}>
                  {r.place}°
                </span>
                {players[r.playerId] && <Avatar avatar={players[r.playerId].avatar} size={34} />}
                <span className="grow" style={{ fontWeight: 700 }}>
                  {players[r.playerId]?.name ?? '—'}
                </span>
                <span className="muted" style={{ fontSize: 17 }}>
                  {r.label}
                </span>
                <span className="yellow" style={{ width: 44, textAlign: 'right', fontWeight: 700 }}>
                  +{r.points}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="push">
          <GamesList room={room} />
        </div>
      </div>
      <div className="host-main">
        <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
          <h2 className="display h1">La tabla</h2>
          <span className="blue" style={{ fontSize: 20 }}>
            (el que termina arriba, campeón)
          </span>
        </div>
        <GeneralTable room={room} />
        <div className="push row">
          {done ? (
            <button className="btn yellow" onClick={() => send({ t: 'room', action: 'crown' })}>
              Coronar al campeón
            </button>
          ) : (
            <button className="btn yellow" onClick={() => send({ t: 'room', action: 'start-game' })}>
              Siguiente: {GAME_INFO[room.games[room.gameIndex].type].name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Final({ room }: { room: RoomView }) {
  const rows = [...room.players].sort((a, b) => (room.totals[b.id] ?? 0) - (room.totals[a.id] ?? 0));
  const top = rows.length ? room.totals[rows[0].id] ?? 0 : 0;
  const champs = rows.filter((p) => (room.totals[p.id] ?? 0) === top);
  return (
    <div className="host fade-in">
      <div className="host-main" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div className="blue" style={{ fontSize: 24 }}>
          {room.name} · {champs.length > 1 ? 'campeones' : 'campeón de la noche'}
        </div>
        <div className="row" style={{ gap: 40, justifyContent: 'center', flexWrap: 'wrap' }}>
          {champs.map((p) => (
            <div key={p.id} className="stack" style={{ alignItems: 'center', gap: 0 }}>
              <span className="wiggle">
                <Crown size={110} filled />
              </span>
              <Avatar avatar={{ ...p.avatar, expression: 'happy' }} size={220} />
              <div className="display" style={{ fontSize: 'clamp(56px, 8vw, 110px)' }}>
                {p.name}
              </div>
            </div>
          ))}
        </div>
        <div className="display h2 yellow">{top} puntos</div>
      </div>
      <div className="host-side">
        <h2 className="display h3">Tabla final</h2>
        {rows.map((p) => (
          <div key={p.id} className="row" style={{ fontSize: 22 }}>
            <span style={{ width: 28, fontWeight: 700 }}>{rows.filter((x) => (room.totals[x.id] ?? 0) > (room.totals[p.id] ?? 0)).length + 1}°</span>
            <Avatar avatar={p.avatar} size={36} />
            <span className="grow">{p.name}</span>
            <b>{room.totals[p.id] ?? 0}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
