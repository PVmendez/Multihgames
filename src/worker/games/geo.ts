import { PLACES, type Place } from '../../shared/data';
import { distanceKm, formatKm, geoPoints } from '../../shared/text';
import { GameError, shuffle, type Env, type GameModule } from './types';

const ROUND_MS = 120_000;

interface FoundPlace {
  name: string;
  lat: number; // ubicación real de la imagen de Mapillary
  lng: number;
  imageId: string;
}

interface Guess {
  lat: number;
  lng: number;
  km: number;
  points: number;
}

export interface GeoState {
  rounds: number;
  round: number;
  phase: 'intro' | 'guess' | 'reveal';
  order: number[]; // índices de PLACES mezclados
  cursor: number; // próximo lugar a probar
  place: FoundPlace | null;
  deadline: number;
  guesses: Record<string, Guess>;
  totals: Record<string, number>;
}

interface MapillaryImage {
  id: string;
  is_pano?: boolean;
  geometry?: { coordinates: [number, number] };
  computed_geometry?: { coordinates: [number, number] };
}

/** Busca la imagen de Mapillary más cercana al lugar (prefiere 360°). */
export async function findImage(token: string, place: Place, fetcher: typeof fetch = fetch): Promise<FoundPlace | null> {
  for (const d of [0.0015, 0.004]) {
    const bbox = [place.lng - d, place.lat - d, place.lng + d, place.lat + d].map((n) => n.toFixed(6)).join(',');
    const url = `https://graph.mapillary.com/images?fields=id,is_pano,geometry,computed_geometry&limit=200&bbox=${bbox}`;
    const res = await fetcher(url, { headers: { Authorization: `OAuth ${token}` } });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new GameError('El token de Mapillary no es válido');
      continue;
    }
    const data = (await res.json()) as { data?: MapillaryImage[] };
    const imgs = (data.data ?? [])
      .map((im) => {
        const c = (im.computed_geometry ?? im.geometry)?.coordinates;
        return c ? { id: im.id, pano: !!im.is_pano, lng: c[0], lat: c[1] } : null;
      })
      .filter((x): x is { id: string; pano: boolean; lng: number; lat: number } => !!x);
    if (!imgs.length) continue;
    const scored = imgs
      .map((im) => ({ ...im, km: distanceKm(place.lat, place.lng, im.lat, im.lng) }))
      // Una 360° a menos de 150 m le gana a una foto plana más cerca.
      .sort((a, b) => a.km - (a.pano ? 0.15 : 0) - (b.km - (b.pano ? 0.15 : 0)));
    const best = scored[0];
    return { name: place.name, lat: best.lat, lng: best.lng, imageId: best.id };
  }
  return null;
}

function closeRound(s: GeoState) {
  if (s.phase !== 'guess') return;
  for (const [pid, g] of Object.entries(s.guesses)) s.totals[pid] = (s.totals[pid] ?? 0) + g.points;
  s.phase = 'reveal';
}

async function pickPlace(s: GeoState, env: Env): Promise<FoundPlace> {
  const token = env.MAPILLARY_TOKEN;
  if (!token) throw new GameError('Falta configurar MAPILLARY_TOKEN en Cloudflare');
  for (let tries = 0; tries < 6 && s.cursor < s.order.length; tries++) {
    const place = PLACES[s.order[s.cursor++]];
    const found = await findImage(token, place);
    if (found) return found;
  }
  throw new GameError('No encontré imágenes de Mapillary para los próximos lugares');
}

export const geo: GameModule<GeoState> = {
  init: (ctx) => ({
    rounds: ctx.config.rounds,
    round: -1,
    phase: 'intro',
    order: shuffle(PLACES.map((_, i) => i), ctx.rand),
    cursor: 0,
    place: null,
    deadline: 0,
    guesses: {},
    totals: {}
  }),

  hostView(s, ctx) {
    const reveal = s.phase === 'reveal';
    return {
      type: 'geo',
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      deadline: s.deadline,
      imageId: s.place?.imageId ?? null,
      token: ctx.env.MAPILLARY_TOKEN ?? '',
      place: reveal && s.place ? { name: s.place.name, lat: s.place.lat, lng: s.place.lng } : null,
      answered: ctx.playerIds.filter((pid) => s.guesses[pid]),
      guesses: reveal
        ? ctx.playerIds
            .filter((pid) => s.guesses[pid])
            .map((pid) => ({ playerId: pid, ...s.guesses[pid], kmLabel: formatKm(s.guesses[pid].km) }))
        : [],
      totals: s.totals
    };
  },

  playerView(s, pid, ctx) {
    const g = s.guesses[pid];
    const reveal = s.phase === 'reveal';
    return {
      type: 'geo',
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      deadline: s.deadline,
      imageId: s.phase === 'guess' ? s.place?.imageId ?? null : null,
      token: ctx.env.MAPILLARY_TOKEN ?? '',
      myGuess: g ? { lat: g.lat, lng: g.lng } : null,
      result: reveal && g ? { km: g.km, kmLabel: formatKm(g.km), points: g.points } : null,
      place: reveal && s.place ? { name: s.place.name, lat: s.place.lat, lng: s.place.lng } : null,
      myTotal: s.totals[pid] ?? 0
    };
  },

  async onHost(s, action, _payload, ctx) {
    if (action === 'start-round' || action === 'other-place') {
      if (action === 'start-round') {
        if (s.phase === 'guess') throw new GameError('Ya hay un lugar en juego');
        if (s.round + 1 >= s.rounds) throw new GameError('Ya se jugaron todos los lugares');
      } else if (s.phase !== 'guess' || Object.keys(s.guesses).length) {
        throw new GameError('Solo se puede cambiar el lugar antes de que alguien marque');
      }
      const place = await pickPlace(s, ctx.env);
      if (action === 'start-round') s.round++;
      s.place = place;
      s.phase = 'guess';
      s.guesses = {};
      s.deadline = Date.now() + ROUND_MS;
    } else if (action === 'reveal') {
      closeRound(s);
    } else {
      throw new GameError('Acción desconocida');
    }
  },

  onPlayer(s, pid, action, payload, ctx) {
    if (action !== 'guess') throw new GameError('Acción desconocida');
    if (s.phase !== 'guess' || !s.place) throw new GameError('Ahora no se puede marcar');
    if (s.guesses[pid]) throw new GameError('Ya clavaste tu imán');
    const lat = Number(payload?.lat);
    const lng = Number(payload?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new GameError('Ubicación inválida');
    const km = distanceKm(lat, lng, s.place.lat, s.place.lng);
    const late = ctx.now > s.deadline + 2000;
    s.guesses[pid] = { lat, lng, km, points: late ? 0 : geoPoints(km) };
    if (ctx.playerIds.every((id) => s.guesses[id])) closeRound(s);
  },

  ranking(s, ctx) {
    closeRound(s);
    return ctx.playerIds.map((pid) => ({
      playerId: pid,
      key: [s.totals[pid] ?? 0],
      label: `${(s.totals[pid] ?? 0).toLocaleString('es-UY')} pts`
    }));
  }
};
