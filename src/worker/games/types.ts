import type { GameConfig } from '../../shared/types';

export interface Env {
  ROOMS: DurableObjectNamespace;
  AI?: Ai;
  ASSETS?: Fetcher;
  MAPILLARY_TOKEN?: string;
}

export interface GameCtx {
  playerIds: string[];
  names: Record<string, string>;
  now: number;
  env: Env;
  rand: () => number;
  config: GameConfig;
  customWords: string[];
  customFamous: string[];
}

export interface RankRow {
  playerId: string;
  key: number[]; // mayor = mejor
  label: string;
}

export interface GameModule<S> {
  init(ctx: GameCtx): S;
  hostView(s: S, ctx: GameCtx): unknown;
  playerView(s: S, playerId: string, ctx: GameCtx): unknown;
  onHost(s: S, action: string, payload: any, ctx: GameCtx): void | Promise<void>;
  onPlayer(s: S, playerId: string, action: string, payload: any, ctx: GameCtx): void | Promise<void>;
  onPlayerJoined?(s: S, playerId: string, ctx: GameCtx): void;
  ranking(s: S, ctx: GameCtx): RankRow[];
}

/** Error que se muestra tal cual al que hizo la acción. */
export class GameError extends Error {}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
