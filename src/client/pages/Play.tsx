import { lazy, Suspense, useEffect, useState } from 'react';
import { GAME_INFO, type PlayerMessage } from '../../shared/types';
import { Avatar, ChalkCircle, Connection, Crown, Toast } from '../components/chalk';
import { Customizer } from '../components/Customizer';
import { useRoom } from '../lib/room';
import { navigate } from '../main';
import { ChessPlay } from '../games/Chess';
import { RevesPlay } from '../games/Reves';
import { PalabraPlay } from '../games/Palabra';
import { PenalesPlay } from '../games/Penales';
import { playerMap } from './Host';

// Mapillary pesa ~1 MB: se baja solo cuando se juega GeoGuesser.
const GeoPlay = lazy(() => import('../games/Geo').then((m) => ({ default: m.GeoPlay })));

export function Play({ code }: { code: string }) {
  const [exists, setExists] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`/api/rooms/${code}/info`).then((r) => setExists(r.ok)).catch(() => setExists(true));
  }, [code]);

  if (exists === false) {
    return (
      <div className="slate">
        <div className="phone">
          <h1 className="display h2">No hay ninguna sala {code}</h1>
          <p className="muted">Fijate el código en la pantalla grande.</p>
          <button className="btn yellow" onClick={() => navigate('/')}>
            Probar otro código
          </button>
        </div>
      </div>
    );
  }
  if (exists === null) return <div className="slate" />;
  return <Connected code={code} />;
}

function Connected({ code }: { code: string }) {
  const { status, state, send, error } = useRoom(code, 'player');
  const [editing, setEditing] = useState(false);
  const [joining, setJoining] = useState(false);

  let body;
  if (status === 'need-join' && !state) {
    body = (
      <>
        <div className="phone-top">
          <span className="blue">Sala {code}</span>
        </div>
        <h1 className="display h2">Anotate en el pizarrón</h1>
        <Customizer
          submitLabel={joining ? 'Anotando…' : 'Anotarme'}
          busy={joining}
          onSubmit={(name, avatar) => {
            setJoining(true);
            send({ t: 'join', name, avatar });
            window.setTimeout(() => setJoining(false), 3000);
          }}
        />
      </>
    );
  } else if (status === 'fatal') {
    body = (
      <>
        <h1 className="display h2">Quedaste afuera de la sala</h1>
        <button className="btn yellow" onClick={() => location.reload()}>
          Volver a entrar
        </button>
      </>
    );
  } else if (!state) {
    body = <div className="display h3">Conectando…</div>;
  } else if (editing) {
    body = (
      <>
        <div className="phone-top">
          <button className="chip" onClick={() => setEditing(false)}>
            ← volver
          </button>
        </div>
        <Customizer
          initialName={state.me.name}
          initialAvatar={state.me.avatar}
          submitLabel="Guardar"
          onSubmit={(name, avatar) => {
            send({ t: 'profile', name, avatar });
            setEditing(false);
          }}
        />
      </>
    );
  } else {
    body = <PlayerScreen msg={state} send={send} onEdit={() => setEditing(true)} />;
  }

  return (
    <div className="slate">
      <div className="phone">{body}</div>
      <Toast message={error} />
      {state && <Connection status={status} />}
    </div>
  );
}

function Header({ msg, onEdit }: { msg: PlayerMessage; onEdit?: () => void }) {
  const total = msg.room.totals[msg.me.id] ?? 0;
  return (
    <div className="phone-top">
      <button
        className="row"
        onClick={onEdit}
        disabled={!onEdit}
        style={{ background: 'none', border: 0, color: 'inherit', padding: 0, cursor: onEdit ? 'pointer' : 'default', gap: 8 }}
        aria-label={onEdit ? 'Editar personaje' : undefined}
      >
        <Avatar avatar={msg.me.avatar} size={40} />
        <span style={{ fontWeight: 700, fontSize: 20 }}>{msg.me.name}</span>
      </button>
      <span className="muted">
        {total} pts · {msg.room.code}
      </span>
    </div>
  );
}

function PlayerScreen({ msg, send, onEdit }: { msg: PlayerMessage; send: ReturnType<typeof useRoom>['send']; onEdit: () => void }) {
  const { room, me } = msg;

  if (room.phase === 'lobby') {
    return (
      <>
        <Header msg={msg} onEdit={onEdit} />
        <div className="stack fade-in" style={{ alignItems: 'center', textAlign: 'center', marginTop: 20 }}>
          <Avatar avatar={me.avatar} size={170} title={me.name} body />
          <h1 className="display h2">¡Anotado, {me.name}!</h1>
          <p className="muted" style={{ margin: 0 }}>
            Mirá la pantalla grande. Cuando el admin arranque, acá vas a jugar.
          </p>
          <button className="chip" onClick={onEdit}>
            Cambiar mi personaje
          </button>
          {room.admin && (
            <div className="row" style={{ gap: 10, marginTop: 6 }}>
              <Avatar avatar={room.admin.avatar} size={40} />
              <span className="muted">Conduce: Prof. {room.admin.name}</span>
            </div>
          )}
        </div>
        <div className="stack push dashed-box" style={{ gap: 6 }}>
          <span className="yellow" style={{ fontWeight: 700 }}>
            Hoy se juega:
          </span>
          {room.games.map((g, i) => (
            <span key={i}>
              {i + 1}. {GAME_INFO[g.type].name}
            </span>
          ))}
        </div>
      </>
    );
  }

  if (room.phase === 'game') {
    const game = msg.game as { type: string } | null;
    const props = { game: game as any, room, me, players: playerMap(room), send };
    return (
      <>
        <Header msg={msg} />
        {game?.type === 'chess' && <ChessPlay {...props} />}
        {game?.type === 'reves' && <RevesPlay {...props} />}
        {game?.type === 'geo' && (
          <Suspense fallback={<div className="display h3">Cargando el mapa…</div>}>
            <GeoPlay {...props} />
          </Suspense>
        )}
        {game?.type === 'palabra' && <PalabraPlay {...props} />}
        {game?.type === 'penales' && <PenalesPlay {...props} />}
      </>
    );
  }

  const sorted = [...room.players].sort((a, b) => (room.totals[b.id] ?? 0) - (room.totals[a.id] ?? 0));
  const myTotal = room.totals[me.id] ?? 0;
  const myPlace = sorted.filter((p) => (room.totals[p.id] ?? 0) > myTotal).length + 1;

  if (room.phase === 'final') {
    const champ = myPlace === 1;
    return (
      <>
        <Header msg={msg} />
        <div className="stack fade-in" style={{ alignItems: 'center', textAlign: 'center', marginTop: 30 }}>
          {champ && (
            <span className="wiggle">
              <Crown size={90} filled />
            </span>
          )}
          <Avatar avatar={{ ...me.avatar, expression: champ ? 'happy' : me.avatar.expression }} size={180} body />
          <h1 className="display h1">{champ ? '¡Campeón!' : `Saliste ${myPlace}°`}</h1>
          <p className="big" style={{ margin: 0 }}>
            {myTotal} puntos
          </p>
        </div>
      </>
    );
  }

  // results
  const last = room.results[room.gameIndex - 1];
  const mine = last?.ranking.find((r) => r.playerId === me.id);
  return (
    <>
      <Header msg={msg} />
      <div className="stack fade-in" style={{ alignItems: 'center', textAlign: 'center', marginTop: 10 }}>
        {last && <div className="blue">Terminó {GAME_INFO[last.type].name}</div>}
        {mine && (
          <>
            <ChalkCircle size={110} color={mine.place === 1 ? 'var(--yellow)' : 'var(--chalk)'}>
              <span className="display" style={{ fontSize: 50 }}>
                {mine.place}°
              </span>
            </ChalkCircle>
            <div className="big">
              {mine.label} · <span className="yellow">+{mine.points}</span>
            </div>
          </>
        )}
        <div className="dashed-box stack" style={{ width: '100%', textAlign: 'left', gap: 6, marginTop: 10 }}>
          <span className="yellow" style={{ fontWeight: 700 }}>
            Tabla general
          </span>
          {sorted.map((p) => (
            <div key={p.id} className="row" style={{ fontWeight: p.id === me.id ? 700 : 400 }}>
              <span style={{ width: 24 }}>{sorted.filter((x) => (room.totals[x.id] ?? 0) > (room.totals[p.id] ?? 0)).length + 1}.</span>
              <Avatar avatar={p.avatar} size={28} />
              <span className="grow">{p.name}</span>
              <span>{room.totals[p.id] ?? 0}</span>
            </div>
          ))}
        </div>
        <p className="muted">Esperando al admin…</p>
      </div>
    </>
  );
}
