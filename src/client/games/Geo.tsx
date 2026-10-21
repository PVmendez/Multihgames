import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Viewer } from 'mapillary-js';
import 'mapillary-js/dist/mapillary.css';
import { MVD_BOUNDS } from '../../shared/data';
import { formatKm } from '../../shared/text';
import type { Avatar as AvatarT } from '../../shared/types';
import { Avatar, avatarHtml, ChalkCircle, Countdown } from '../components/chalk';
import { RoundLabel, useWhenTimeUp, type HostProps, type PlayProps } from './common';

interface HostView {
  type: 'geo';
  phase: 'intro' | 'guess' | 'reveal';
  round: number;
  rounds: number;
  deadline: number;
  imageId: string | null;
  token: string;
  place: { name: string; lat: number; lng: number } | null;
  answered: string[];
  guesses: { playerId: string; lat: number; lng: number; km: number; points: number; kmLabel: string }[];
  totals: Record<string, number>;
}

interface PlayView {
  type: 'geo';
  phase: 'intro' | 'guess' | 'reveal';
  round: number;
  rounds: number;
  deadline: number;
  imageId: string | null;
  token: string;
  myGuess: { lat: number; lng: number } | null;
  result: { km: number; kmLabel: string; points: number } | null;
  place: { name: string; lat: number; lng: number } | null;
  myTotal: number;
}

// ---------- Vista 360° de Mapillary ----------

function StreetView({ token, imageId, height }: { token: string; imageId: string; height: number | string }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref.current || !token) return;
    try {
      viewer.current = new Viewer({
        accessToken: token,
        container: ref.current,
        imageId,
        component: { cover: false, bearing: false, zoom: true, sequence: false }
      });
    } catch {
      setFailed(true);
    }
    return () => {
      viewer.current?.remove();
      viewer.current = null;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    viewer.current?.moveTo(imageId).catch(() => setFailed(true));
  }, [imageId]);

  if (!token) return <div className="mly center" style={{ height, padding: 20, color: '#1e1e1e' }}>Falta el token de Mapillary</div>;
  return (
    <div className="mly" style={{ height }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      {failed && (
        <div className="center" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#1e1e1e' }}>
          No se pudo cargar la imagen
        </div>
      )}
    </div>
  );
}

// ---------- Mapa en "tiza" ----------

function avatarIcon(avatar: AvatarT, size = 44) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;filter:drop-shadow(0 3px 0 #0e1612)">${avatarHtml(avatar)}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

const crossIcon = L.divIcon({
  className: '',
  html: `<svg width="40" height="40" viewBox="0 0 40 40"><path d="M6 6 L34 34 M34 6 L6 34" stroke="#f29ba8" stroke-width="7" stroke-linecap="round"/></svg>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20]
});

function useChalkMap(ref: React.RefObject<HTMLDivElement | null>) {
  const [map, setMap] = useState<L.Map | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const m = L.map(ref.current, {
      maxBounds: L.latLngBounds(MVD_BOUNDS).pad(0.2),
      minZoom: 11,
      zoomControl: true,
      attributionControl: true
    }).fitBounds(MVD_BOUNDS);
    m.getContainer().classList.add('map-chalk');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(m);
    setMap(m);
    return () => {
      m.remove();
      setMap(null);
    };
  }, [ref]);
  return map;
}

// ---------- Host ----------

export function GeoHost({ game, room, players, send }: HostProps<HostView>) {
  const g = game;
  useWhenTimeUp(g.deadline, g.phase === 'guess', () => send({ t: 'game', action: 'reveal' }));
  const last = g.round + 1 >= g.rounds;
  const ranked = [...g.guesses].sort((a, b) => a.km - b.km);

  return (
    <div className="row" style={{ alignItems: 'stretch', gap: 'clamp(24px, 3vw, 40px)', flex: 1, flexWrap: 'wrap' }}>
      <div className="stack grow" style={{ minWidth: 320 }}>
        <div className="row between">
          <RoundLabel round={g.round} rounds={g.rounds} noun="lugar" />
          {g.phase === 'guess' && <Countdown deadline={g.deadline} size={64} />}
        </div>
        {g.phase === 'intro' && (
          <div className="stack">
            <p className="big" style={{ margin: 0 }}>
              Todos van a ver el mismo lugar de Montevideo en su celu. Pueden mirar alrededor y caminar un poco. Después clavan su imán en el mapa.
            </p>
            <p className="muted" style={{ margin: 0 }}>Pegarle justo da 1.000 puntos; a 1 km, unos 430.</p>
          </div>
        )}
        {g.phase === 'guess' && g.imageId && <StreetView token={g.token} imageId={g.imageId} height="min(62vh, 620px)" />}
        {g.phase === 'reveal' && g.place && <RevealMap game={g} players={players} />}
        <div className="push row wrap">
          {g.phase === 'guess' ? (
            <>
              <button className="btn small" onClick={() => send({ t: 'game', action: 'reveal' })}>
                Revelar ya
              </button>
              {!g.answered.length && (
                <button className="btn small" onClick={() => send({ t: 'game', action: 'other-place' })}>
                  Otro lugar
                </button>
              )}
            </>
          ) : !last ? (
            <button className="btn yellow" onClick={() => send({ t: 'game', action: 'start-round' })}>
              {g.round < 0 ? 'Primer lugar' : 'Siguiente lugar'}
            </button>
          ) : (
            <span className="muted">Era el último lugar: terminá el juego para pasar los puntos.</span>
          )}
        </div>
      </div>

      <div className="stack" style={{ width: 'min(100%, 340px)', gap: 6 }}>
        {g.phase === 'reveal' && g.place && (
          <div className="paper" style={{ transform: 'rotate(-2deg)', marginBottom: 10 }}>
            <div style={{ fontSize: 26, fontWeight: 700, textAlign: 'center' }}>Era: {g.place.name}</div>
          </div>
        )}
        <h2 className="display h3 yellow">{g.phase === 'reveal' ? 'Quién pegó más cerca' : 'Ya marcaron'}</h2>
        {g.phase === 'reveal'
          ? ranked.map((r) => {
              const p = players[r.playerId];
              return (
                <div key={r.playerId} className="row" style={{ fontSize: 22 }}>
                  {p && <Avatar avatar={p.avatar} size={34} />}
                  <span className="grow" style={{ fontWeight: 700 }}>
                    {p?.name}
                  </span>
                  <span className="muted" style={{ fontSize: 18 }}>
                    {r.kmLabel}
                  </span>
                  <span className="yellow" style={{ width: 64, textAlign: 'right', fontWeight: 700 }}>
                    +{r.points}
                  </span>
                </div>
              );
            })
          : room.players.map((p) => (
              <div key={p.id} className="row" style={{ fontSize: 22 }}>
                <Avatar avatar={p.avatar} size={34} offline={!p.connected} />
                <span className="grow">{p.name}</span>
                {g.answered.includes(p.id) ? <ChalkCircle size={30} color="var(--yellow)">✓</ChalkCircle> : <span className="muted">…</span>}
              </div>
            ))}
        <div className="dashed-box stack" style={{ gap: 4, marginTop: 12 }}>
          <span className="muted">Acumulado</span>
          {[...room.players]
            .sort((a, b) => (g.totals[b.id] ?? 0) - (g.totals[a.id] ?? 0))
            .map((p) => (
              <div key={p.id} className="row between">
                <span>{p.name}</span>
                <b>{(g.totals[p.id] ?? 0).toLocaleString('es-UY')}</b>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function RevealMap({ game, players }: { game: HostView; players: HostProps<HostView>['players'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useChalkMap(ref);
  useEffect(() => {
    if (!map || !game.place) return;
    const layer = L.layerGroup().addTo(map);
    const target = L.latLng(game.place.lat, game.place.lng);
    const pts: L.LatLng[] = [target];
    for (const gs of game.guesses) {
      const p = players[gs.playerId];
      const ll = L.latLng(gs.lat, gs.lng);
      pts.push(ll);
      L.polyline([ll, target], { color: '#f3d36b', weight: 3, dashArray: '6 8' }).addTo(layer);
      if (p) {
        L.marker(ll, { icon: avatarIcon(p.avatar) })
          .bindTooltip(`${p.name} · ${gs.kmLabel}`, { permanent: true, direction: 'right', offset: [18, 0], className: '' })
          .addTo(layer);
      }
    }
    L.marker(target, { icon: crossIcon, zIndexOffset: 1000 }).addTo(layer);
    map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 15 });
    return () => {
      layer.remove();
    };
  }, [map, game.place, game.guesses, players]);
  return <div ref={ref} style={{ height: 'min(62vh, 620px)', borderRadius: 10, border: '2px dashed var(--chalk-faint)' }} />;
}

// ---------- Celular ----------

export function GeoPlay({ game, me, send }: PlayProps<PlayView>) {
  const g = game;
  const mapRef = useRef<HTMLDivElement>(null);
  const map = useChalkMap(mapRef);
  const marker = useRef<L.Marker | null>(null);
  const [pick, setPick] = useState<L.LatLng | null>(null);
  const [showMap, setShowMap] = useState(false);

  // Reiniciar al cambiar de lugar
  useEffect(() => {
    setPick(null);
    setShowMap(false);
    marker.current?.remove();
    marker.current = null;
  }, [g.round, g.imageId]);

  const visible = g.phase !== 'intro' && (showMap || !!g.myGuess || g.phase === 'reveal');
  useEffect(() => {
    if (!map || !visible) return;
    const t = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(t);
  }, [map, visible, g.phase]);

  useEffect(() => {
    if (!map) return;
    const onClick = (e: L.LeafletMouseEvent) => {
      if (g.myGuess || g.phase !== 'guess') return;
      setPick(e.latlng);
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, g.myGuess, g.phase]);

  useEffect(() => {
    if (!map) return;
    const ll = g.myGuess ? L.latLng(g.myGuess.lat, g.myGuess.lng) : pick;
    if (!ll) return;
    if (!marker.current) marker.current = L.marker(ll, { icon: avatarIcon(me.avatar, 46) }).addTo(map);
    else marker.current.setLatLng(ll);
  }, [map, pick, g.myGuess, me.avatar]);

  // En la revelación, mostrar el lugar real con una cruz.
  useEffect(() => {
    if (!map || g.phase !== 'reveal' || !g.place) return;
    const target = L.latLng(g.place.lat, g.place.lng);
    const layer = L.layerGroup().addTo(map);
    L.marker(target, { icon: crossIcon }).addTo(layer);
    const pts = [target];
    if (g.myGuess) {
      const mine = L.latLng(g.myGuess.lat, g.myGuess.lng);
      pts.push(mine);
      L.polyline([mine, target], { color: '#f3d36b', weight: 3, dashArray: '6 8' }).addTo(layer);
    }
    const t = window.setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 15 });
    }, 80);
    return () => {
      window.clearTimeout(t);
      layer.remove();
    };
  }, [map, g.phase, g.place, g.myGuess]);

  const mapVisible = g.phase !== 'intro' && (showMap || !!g.myGuess || g.phase === 'reveal');
  return (
    <div className="stack fade-in" style={{ gap: 12 }}>
      {g.phase === 'intro' && (
        <div className="stack center" style={{ marginTop: 40 }}>
          <h1 className="display h2">GeoGuesser Montevideo</h1>
          <p className="muted">Esperá el primer lugar.</p>
        </div>
      )}
      <div className="row between" style={{ display: g.phase === 'intro' ? 'none' : 'flex' }}>
        <div>
          <RoundLabel round={g.round} rounds={g.rounds} noun="Lugar" />
          <h1 className="display h2">{g.phase === 'reveal' ? (g.place ? `Era: ${g.place.name}` : 'Se terminó') : '¿Dónde es esto?'}</h1>
        </div>
        {g.phase === 'guess' && <Countdown deadline={g.deadline} size={58} />}
      </div>

      {g.phase === 'guess' && g.imageId && !g.myGuess && (
        <div style={{ display: showMap ? 'none' : 'block' }}>
          <StreetView token={g.token} imageId={g.imageId} height="52dvh" />
          <span className="muted" style={{ fontSize: 15 }}>
            Arrastrá para mirar alrededor
          </span>
        </div>
      )}

      <div ref={mapRef} style={{ height: mapVisible ? (g.phase === 'reveal' ? '44dvh' : '52dvh') : 0, borderRadius: 10, overflow: 'hidden', border: mapVisible ? '2px dashed var(--chalk-faint)' : 0 }} />

      {g.phase === 'guess' && !g.myGuess && (
        <div className="row">
          <button className="btn small" onClick={() => setShowMap((v) => !v)}>
            {showMap ? 'Ver el lugar' : 'Ir al mapa'}
          </button>
          <button className="btn yellow grow" disabled={!pick} onClick={() => pick && send({ t: 'game', action: 'guess', payload: { lat: pick.lat, lng: pick.lng } })}>
            {pick ? 'Clavar acá' : showMap ? 'Tocá el mapa' : 'Clavar acá'}
          </button>
        </div>
      )}
      {g.phase === 'guess' && g.myGuess && <div className="center big">Imán clavado. Esperá a que se revele.</div>}
      {g.phase === 'reveal' && (
        <div className="center big">
          {g.result ? (
            <>
              Quedaste a <b>{formatKm(g.result.km)}</b> · <span className="yellow">+{g.result.points}</span>
            </>
          ) : (
            <span className="pink">No llegaste a marcar</span>
          )}
          <div className="muted" style={{ fontSize: 17 }}>
            Llevás {g.myTotal.toLocaleString('es-UY')} puntos
          </div>
        </div>
      )}
    </div>
  );
}
