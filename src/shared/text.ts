// Utilidades de texto y de puntaje compartidas.

/** Minúsculas, sin tildes ni signos, espacios simples. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[n];
}

const close = (a: string, b: string) => levenshtein(a, b) <= Math.max(1, Math.floor(b.length * 0.2));

/**
 * ¿La respuesta corresponde al famoso? Acepta el nombre completo o el apellido
 * (o el nombre artístico de una palabra), con errores de tipeo chicos.
 */
export function matchesName(guess: string, answer: string): boolean {
  const g = normalize(guess);
  const a = normalize(answer);
  if (!g) return false;
  if (close(g, a)) return true;
  const parts = a.split(' ').filter((p) => p.length > 2);
  const last = parts[parts.length - 1];
  if (last && close(g, last)) return true;
  // Nombres largos: alcanza con dos partes del nombre bien puestas ("Gustavo Cerati" → "gustavo cerati", "Juan Martín del Potro" → "martin potro")
  const gp = g.split(' ').filter((x) => x.length > 2);
  const hits = gp.filter((x) => parts.some((p) => close(x, p))).length;
  return parts.length > 1 && hits >= Math.min(2, parts.length) && hits === gp.length;
}

/** Distancia en km entre dos puntos (haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Puntos de GeoGuesser por ronda: 1000 pegando justo, ~430 a 1 km, ~190 a 2 km. */
export function geoPoints(km: number): number {
  return Math.round(1000 * Math.exp(-km / 1.2));
}

/**
 * Convierte un orden con empates en puestos (1, 2, 2, 4…) y puntos de la tabla general.
 * `keys` es comparable: mayor = mejor, se compara elemento por elemento.
 */
export function placeRanking<T extends { key: number[] }>(items: T[], scale: number[]): (T & { place: number; points: number })[] {
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (b[i] ?? 0) - (a[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };
  const sorted = [...items].sort((a, b) => cmp(a.key, b.key));
  let place = 0;
  return sorted.map((it, i) => {
    if (i === 0 || cmp(sorted[i - 1].key, it.key) !== 0) place = i + 1;
    return { ...it, place, points: scale[place - 1] ?? 0 };
  });
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;
}
