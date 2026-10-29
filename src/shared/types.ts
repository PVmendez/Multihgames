// Tipos compartidos entre el Worker (servidor de la sala) y el cliente (host y celulares).

export type GameType = 'chess' | 'reves' | 'geo' | 'palabra' | 'penales';

export const GAME_INFO: Record<GameType, { name: string; mode: string; blurb: string }> = {
  chess: {
    name: 'Ajedrez 9 casillas',
    mode: 'con el celu',
    blurb: 'Todos parten del mismo tablero. Llegá a la posición del reto en la menor cantidad de movimientos.'
  },
  reves: {
    name: 'Nombres al revés',
    mode: 'con el celu',
    blurb: 'Por turnos: a cada uno le toca su famoso al revés. Grabate imitándolo, escuchalo al derecho y adiviná quién es.'
  },
  geo: {
    name: 'GeoGuesser Montevideo',
    mode: 'con el celu',
    blurb: 'Todos ven el mismo lugar de Montevideo. Clavá tu imán en el mapa: gana el que pega más cerca.'
  },
  penales: {
    name: 'Penales',
    mode: 'con el celu',
    blurb: 'Mini liga todos contra todos. Cada uno patea y ataja a la vez: si uno mete y el otro no, gana el partido.'
  },
  palabra: {
    name: 'No digas tu palabra',
    mode: 'con el celu',
    blurb: 'Todos tienen una palabra secreta que no conocen. Hacé que los demás digan la suya sin que se den cuenta.'
  }
};

export const EXPRESSIONS = ['happy', 'wink', 'smug', 'love', 'surprised', 'mad', 'shy', 'sleepy'] as const;
export type ExpressionName = (typeof EXPRESSIONS)[number] | 'sad' | 'idle' | 'scared' | 'thinking';

export interface Avatar {
  seed: string;
  hue: number;
  expression: ExpressionName;
  special?: string; // personaje especial (ver shared/specials.ts); lo asigna el servidor según el nombre
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: Avatar;
  connected: boolean;
}

export interface GameConfig {
  type: GameType;
  rounds: number; // ajedrez: retos · revés: famosos por jugador · geo: lugares · palabra: minutos · penales: vueltas
}

export interface RankEntry {
  playerId: string;
  place: number; // 1 = primero (empates comparten puesto)
  points: number; // puntos para la tabla general
  label: string; // cómo se muestra el desempeño en el juego ("5 mov.", "1.240 pts")
}

export interface GameResult {
  type: GameType;
  ranking: RankEntry[];
}

export type RoomPhase = 'lobby' | 'game' | 'results' | 'final';

export interface AdminInfo {
  name: string;
  avatar: Avatar;
}

export interface RoomView {
  code: string;
  name: string;
  admin: AdminInfo | null; // el profe / anfitrión (no juega, conduce)
  phase: RoomPhase;
  games: GameConfig[];
  gameIndex: number; // juego en curso, o el próximo a jugar
  players: PublicPlayer[];
  results: (GameResult | null)[];
  totals: Record<string, number>; // tabla general
  scale: number[];
  maxPlayers: number;
}

export interface HostMessage {
  t: 'state';
  role: 'host';
  room: RoomView;
  game: unknown; // vista del juego para la pantalla grande
}

export interface PlayerMessage {
  t: 'state';
  role: 'player';
  room: RoomView;
  me: PublicPlayer;
  game: unknown; // vista privada del juego para este jugador
}

export type ServerMessage =
  | HostMessage
  | PlayerMessage
  | { t: 'joined'; playerId: string; secret: string }
  | { t: 'host-ok'; adminToken: string }
  | { t: 'error'; message: string; fatal?: boolean };

export type ClientMessage =
  | { t: 'hello-host'; pin?: string; adminToken?: string }
  | { t: 'hello-player'; playerId: string; secret: string }
  | { t: 'join'; name: string; avatar: Avatar }
  | { t: 'profile'; name: string; avatar: Avatar }
  | { t: 'room'; action: 'start-game' | 'end-game' | 'next' | 'crown' | 'back-to-lobby' | 'kick'; payload?: unknown }
  | { t: 'game'; action: string; payload?: unknown }
  | { t: 'ping' };

export interface CreateRoomRequest {
  name: string;
  pin: string;
  adminName?: string;
  games: GameConfig[];
  customWords?: string[];
  customFamous?: string[];
}

export const DEFAULT_SCALE = [10, 8, 6, 5, 4, 3, 2, 1];
export const MAX_PLAYERS = 12;

export const DEFAULT_ROUNDS: Record<GameType, number> = { chess: 3, reves: 2, geo: 5, palabra: 15, penales: 1 };
