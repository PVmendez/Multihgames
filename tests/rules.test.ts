import { describe, expect, it } from 'vitest';
import { bfs, makeChallenge, minMoves, move, targets } from '../src/shared/chess';
import { geoPoints, matchesName, placeRanking } from '../src/shared/text';
import { chess } from '../src/worker/games/chess';
import { reves } from '../src/worker/games/reves';
import { palabra } from '../src/worker/games/palabra';
import type { GameCtx } from '../src/worker/games/types';

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function ctx(over: Partial<GameCtx> = {}): GameCtx {
  return {
    playerIds: ['a', 'b', 'c'],
    names: { a: 'Ana', b: 'Beto', c: 'Caro' },
    now: 1_000_000,
    env: {} as any,
    rand: seeded(7),
    config: { type: 'chess', rounds: 2 },
    customWords: [],
    customFamous: [],
    ...over
  };
}

describe('ajedrez 3x3', () => {
  it('mueve como en ajedrez sin comer', () => {
    //  K . .
    //  . . .
    //  . . R
    const b = 'K.......R';
    expect(targets(b, 0).sort()).toEqual([1, 3, 4]);
    // la torre se desliza hasta el borde y no salta piezas
    expect(targets(b, 8).sort()).toEqual([2, 5, 6, 7]);
    // el caballo desde la esquina
    expect(targets('N........', 0).sort()).toEqual([5, 7]);
    // el caballo en el centro no tiene saltos
    expect(targets('....N....', 4)).toEqual([]);
    // el alfil no pasa por encima
    expect(targets('B...K....', 0)).toEqual([]);
    expect(move('K........', 0, 8)).toBeNull();
  });

  it('calcula el mínimo con BFS y los retos caen en el rango pedido', () => {
    expect(minMoves('K........', '.K.......')).toBe(1);
    expect(minMoves('K........', '........K')).toBe(2);
    const rand = seeded(3);
    for (let i = 0; i < 20; i++) {
      const c = makeChallenge(4, 7, rand);
      expect(c.par).toBeGreaterThanOrEqual(4);
      expect(c.par).toBeLessThanOrEqual(7);
      expect(bfs(c.start).get(c.goal)).toBe(c.par);
    }
  });

  it('juego: cada uno resuelve en su tablero y se ordena por menos movimientos', () => {
    const c = ctx();
    const s = chess.init(c);
    chess.onHost(s, 'start-round', null, c);
    // el host nunca ve los tableros
    expect(JSON.stringify(chess.hostView(s, c))).not.toContain('"board"');
    const ch = s.challenge!;
    // "a" juega el camino óptimo
    const path = shortestPath(ch.start, ch.goal);
    for (const [from, to] of path) chess.onPlayer(s, 'a', 'move', { from, to }, c);
    expect(s.boards.a.solvedAt).not.toBeNull();
    expect(s.boards.a.moves).toBe(ch.par);
    chess.onHost(s, 'end-round', null, c);
    const r = placeRanking(chess.ranking(s, c), [10, 8, 6]);
    expect(r[0].playerId).toBe('a');
    expect(r[0].points).toBe(10);
    // b y c empatan sin resolver: comparten puesto y puntos
    expect(r[1].place).toBe(2);
    expect(r[2].place).toBe(2);
    expect(r[2].points).toBe(8);
  });
});

function shortestPath(start: string, goal: string): [number, number][] {
  const prev = new Map<string, [string, number, number] | null>([[start, null]]);
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const b = q[i];
    if (b === goal) break;
    for (let f = 0; f < 9; f++) {
      if (b[f] === '.') continue;
      for (const t of targets(b, f)) {
        const n = move(b, f, t)!;
        if (!prev.has(n)) {
          prev.set(n, [b, f, t]);
          q.push(n);
        }
      }
    }
  }
  const out: [number, number][] = [];
  for (let cur = goal; prev.get(cur); cur = prev.get(cur)![0]) out.unshift([prev.get(cur)![1], prev.get(cur)![2]]);
  return out;
}

describe('nombres al revés', () => {
  it('acepta apellido, tildes y errores chicos', () => {
    expect(matchesName('luis suarez', 'Luis Suárez')).toBe(true);
    expect(matchesName('Suares', 'Luis Suárez')).toBe(true);
    expect(matchesName('shakira', 'Shakira')).toBe(true);
    expect(matchesName('Messi', 'Lionel Messi')).toBe(true);
    expect(matchesName('Cavani', 'Luis Suárez')).toBe(false);
    expect(matchesName('', 'Shakira')).toBe(false);
  });

  it('acierto + velocidad', () => {
    const c = ctx({ config: { type: 'reves', rounds: 2 }, customFamous: ['Natalia Oreiro'] });
    const s = reves.init(c);
    expect(s.names).toContain('Natalia Oreiro');
    reves.onHost(s, 'start-round', null, c);
    const answer = s.names[s.round];
    // el famoso no viaja a los celulares mientras se juega
    expect(JSON.stringify(reves.playerView(s, 'a', c))).not.toContain(answer);
    reves.onPlayer(s, 'b', 'guess', { text: answer }, { ...c, now: c.now + 1000 });
    reves.onPlayer(s, 'a', 'guess', { text: answer }, { ...c, now: c.now + 2000 });
    reves.onPlayer(s, 'c', 'guess', { text: 'Pepe' }, { ...c, now: c.now + 3000 });
    expect(s.phase).toBe('reveal'); // respondieron todos
    expect(s.points.b).toBe(8);
    expect(s.points.a).toBe(7);
    expect(s.points.c ?? 0).toBe(0);
  });
});

describe('no digas tu palabra', () => {
  it('nadie ve su propia palabra; reclamo aprobado suma y cambia la palabra', () => {
    const c = ctx({ config: { type: 'palabra', rounds: 10 } });
    const s = palabra.init(c);
    palabra.onHost(s, 'start', null, c);
    const viewA = palabra.playerView(s, 'a', c) as any;
    expect(viewA.others.map((o: any) => o.playerId).sort()).toEqual(['b', 'c']);
    expect(JSON.stringify(viewA)).not.toContain(`"${s.assign.a.word}"`);

    const wordB = s.assign.b.word;
    palabra.onPlayer(s, 'a', 'claim', { target: 'b' }, c);
    const claim = s.claims[0];
    palabra.onHost(s, 'approve', { id: claim.id }, c);
    expect(s.points.a).toBeGreaterThan(0);
    expect(s.assign.b.word).not.toBe(wordB);

    // arriesgar mal: -1 y no puede volver a intentar con esa palabra
    palabra.onPlayer(s, 'c', 'accuse', { guess: 'zzzz' }, c);
    expect(s.points.c).toBe(-1);
    expect(() => palabra.onPlayer(s, 'c', 'accuse', { guess: 'yyyy' }, c)).toThrow();
    // arriesgar bien: suma y le toca otra
    const wordA = s.assign.a.word;
    palabra.onPlayer(s, 'a', 'accuse', { guess: wordA.toUpperCase() }, c);
    expect(s.assign.a.word).not.toBe(wordA);
  });
});

describe('puntaje', () => {
  it('geo decae con la distancia', () => {
    expect(geoPoints(0)).toBe(1000);
    expect(geoPoints(1)).toBeGreaterThan(400);
    expect(geoPoints(1)).toBeLessThan(450);
    expect(geoPoints(10)).toBeLessThan(5);
  });
  it('tabla general por puesto con empates', () => {
    const r = placeRanking(
      [
        { key: [5] }, { key: [9] }, { key: [9] }, { key: [1] }
      ],
      [10, 8, 6, 5]
    );
    expect(r.map((x) => [x.place, x.points])).toEqual([[1, 10], [1, 10], [3, 6], [4, 5]]);
  });
});

describe('geo: búsqueda en Mapillary', () => {
  it('elige la imagen más cercana y prefiere 360° cercanas', async () => {
    const { findImage } = await import('../src/worker/games/geo');
    const place = { name: 'Plaza Independencia', lat: -34.9069, lng: -56.2001 };
    let calledUrl = '';
    const fake = (async (url: string, init: any) => {
      calledUrl = url;
      expect(init.headers.Authorization).toBe('OAuth TOKEN');
      return new Response(
        JSON.stringify({
          data: [
            { id: 'lejos', is_pano: false, geometry: { coordinates: [-56.2101, -34.9069] } },
            { id: 'plana-cerca', is_pano: false, geometry: { coordinates: [-56.2002, -34.9069] } },
            { id: 'pano-cerca', is_pano: true, computed_geometry: { coordinates: [-56.2005, -34.9070] } }
          ]
        })
      );
    }) as unknown as typeof fetch;
    const found = await findImage('TOKEN', place, fake);
    expect(found?.imageId).toBe('pano-cerca');
    expect(found?.lat).toBeCloseTo(-34.907);
    expect(calledUrl).toContain('bbox=');
    const bbox = new URL(calledUrl).searchParams.get('bbox')!.split(',').map(Number);
    expect((bbox[2] - bbox[0]) * (bbox[3] - bbox[1])).toBeLessThan(0.01);
  });
});

describe('penales', () => {
  it('fixture todos contra todos sin repetir cruces', async () => {
    const { fixture } = await import('../src/worker/games/penales');
    for (const n of [2, 3, 6, 7]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const { rounds, byes } = fixture(ids);
      const seen = new Set<string>();
      for (const [ri, r] of rounds.entries()) {
        const inRound = new Set<string>();
        for (const { a, b } of r) {
          const k = [a, b].sort().join('-');
          expect(seen.has(k)).toBe(false);
          seen.add(k);
          expect(inRound.has(a) || inRound.has(b)).toBe(false);
          inRound.add(a);
          inRound.add(b);
        }
        if (n % 2) expect(byes[ri]).not.toBeNull();
      }
      expect(seen.size).toBe((n * (n - 1)) / 2);
    }
  });

  it('gana el que mete si el otro falla; si empatan la tanda, se repite', async () => {
    const { penales } = await import('../src/worker/games/penales');
    const c = ctx({ playerIds: ['a', 'b'], config: { type: 'penales', rounds: 1 } });
    const s = penales.init(c);
    penales.onHost(s, 'start-round', null, c);
    const m = s.matches[0];
    const [x, y] = [m.a, m.b];
    // los dos meten
    penales.onPlayer(s, x, 'choose', { kick: 0, dive: 0 }, c);
    expect(m.tandas.length).toBe(0); // espera al rival
    penales.onPlayer(s, y, 'choose', { kick: 1, dive: 2 }, c);
    expect(m.tandas.length).toBe(1);
    expect(m.winner).toBeNull();
    // x mete (patea 2, y se tira 0) y x ataja (y patea 1, x se tira 1)
    penales.onPlayer(s, x, 'choose', { kick: 2, dive: 1 }, c);
    penales.onPlayer(s, y, 'choose', { kick: 1, dive: 0 }, c);
    expect(m.winner).toBe(x);
    expect(s.phase).toBe('done');
    const r = placeRanking(penales.ranking(s, c), [10, 8]);
    expect(r[0].playerId).toBe(x);
    expect(r[0].points).toBe(10);
    // la vista del rival no revela la elección pendiente
  });

  it('timeout patea al azar por el que no eligió', async () => {
    const { penales } = await import('../src/worker/games/penales');
    const c = ctx({ playerIds: ['a', 'b', 'c'], config: { type: 'penales', rounds: 1 } });
    const s = penales.init(c);
    penales.onHost(s, 'start-round', null, c);
    expect(s.matches.length).toBe(1);
    const m = s.matches[0];
    penales.onPlayer(s, m.a, 'choose', { kick: 0, dive: 0 }, c);
    const view = penales.playerView(s, m.b, c) as any;
    expect(JSON.stringify(view)).not.toContain('"kick":0');
    penales.onHost(s, 'timeout', null, { ...c, now: c.now + 30_000 });
    expect(m.tandas.length).toBe(1);
  });
});

describe('personajes especiales', () => {
  it('reconoce el nombre sin importar mayúsculas, tildes ni espacios', async () => {
    const { specialForName, nameHash } = await import('../src/shared/specials');
    expect(specialForName('Manuel Perera')).toBe('manuel');
    expect(specialForName('  manuel   PERERA ')).toBe('manuel');
    expect(specialForName('Facundo Centurión')).toBe('facundo');
    expect(specialForName('facundo centurion')).toBe('facundo');
    expect(specialForName('Manuel')).toBeUndefined();
    expect(specialForName('Pablo')).toBeUndefined();
    // el script de npm run hash calcula lo mismo
    const script = await import('../scripts/hash-name.mjs');
    expect(script.nameHash('Facundo Centurión')).toBe(nameHash('Facundo Centurión'));
  });

  it('el código no tiene los nombres en texto', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/shared/specials.ts', import.meta.url), 'utf8').toLowerCase();
    expect(src).not.toContain('perera');
    expect(src).not.toContain('centuri');
  });
});
