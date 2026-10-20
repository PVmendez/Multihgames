// Ajedrez en un tablero de 3x3 con 5 piezas: Rey, Dama, Torre, Alfil y Caballo.
// Las piezas se mueven como en ajedrez, sin capturas (con 5 piezas y 9 casillas no se come).
// Un tablero es un string de 9 caracteres, fila por fila desde arriba: 'K','Q','R','B','N' o '.'.

export type Piece = 'K' | 'Q' | 'R' | 'B' | 'N';
export const PIECES: Piece[] = ['K', 'Q', 'R', 'B', 'N'];
export const PIECE_NAMES: Record<Piece, string> = { K: 'Rey', Q: 'Dama', R: 'Torre', B: 'Alfil', N: 'Caballo' };

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

const inside = (r: number, c: number) => r >= 0 && r < 3 && c >= 0 && c < 3;

/** Casillas vacías a las que puede ir la pieza que está en `from`. */
export function targets(board: string, from: number): number[] {
  const p = board[from] as Piece | '.';
  if (p === '.') return [];
  const r0 = Math.floor(from / 3);
  const c0 = from % 3;
  const out: number[] = [];
  const step = (dirs: number[][], slide: boolean) => {
    for (const [dr, dc] of dirs) {
      let r = r0 + dr;
      let c = c0 + dc;
      while (inside(r, c) && board[r * 3 + c] === '.') {
        out.push(r * 3 + c);
        if (!slide) break;
        r += dr;
        c += dc;
      }
    }
  };
  switch (p) {
    case 'K': step([...ORTHO, ...DIAG], false); break;
    case 'Q': step([...ORTHO, ...DIAG], true); break;
    case 'R': step(ORTHO, true); break;
    case 'B': step(DIAG, true); break;
    case 'N': step(KNIGHT, false); break;
  }
  return out;
}

export function move(board: string, from: number, to: number): string | null {
  if (!targets(board, from).includes(to)) return null;
  const a = board.split('');
  a[to] = a[from];
  a[from] = '.';
  return a.join('');
}

/** Distancias mínimas (en movimientos) desde `start` a cada posición alcanzable. */
export function bfs(start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const b = queue[i];
    const d = dist.get(b)!;
    for (let from = 0; from < 9; from++) {
      if (b[from] === '.') continue;
      for (const to of targets(b, from)) {
        const nb = move(b, from, to)!;
        if (!dist.has(nb)) {
          dist.set(nb, d + 1);
          queue.push(nb);
        }
      }
    }
  }
  return dist;
}

export function minMoves(start: string, goal: string): number {
  return bfs(start).get(goal) ?? -1;
}

export function randomBoard(rand: () => number = Math.random): string {
  const cells = [...PIECES, '.', '.', '.', '.'];
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.join('');
}

export interface Challenge {
  start: string;
  goal: string;
  par: number; // mínimo de movimientos posible
}

/** Genera un reto cuyo mínimo de movimientos cae entre `min` y `max`. */
export function makeChallenge(min = 4, max = 7, rand: () => number = Math.random): Challenge {
  for (let attempt = 0; attempt < 50; attempt++) {
    const start = randomBoard(rand);
    const dist = bfs(start);
    const pool = [...dist.entries()].filter(([, d]) => d >= min && d <= max);
    if (pool.length) {
      const [goal, par] = pool[Math.floor(rand() * pool.length)];
      return { start, goal, par };
    }
  }
  throw new Error('No se pudo generar un reto');
}
