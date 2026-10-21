import { DurableObject } from 'cloudflare:workers';
import {
  DEFAULT_SCALE,
  MAX_PLAYERS,
  type Avatar,
  type ClientMessage,
  type CreateRoomRequest,
  type GameConfig,
  type GameResult,
  type GameType,
  type PublicPlayer,
  type RoomPhase,
  type RoomView,
  type ServerMessage
} from '../shared/types';
import { placeRanking } from '../shared/text';
import { specialForName } from '../shared/specials';
import { chess } from './games/chess';
import { geo } from './games/geo';
import { palabra } from './games/palabra';
import { penales } from './games/penales';
import { currentFamous, reves, type RevesState } from './games/reves';
import { GameError, type Env, type GameCtx, type GameModule } from './games/types';

const MODULES: Record<GameType, GameModule<any>> = { chess, reves, geo, palabra, penales };

interface StoredPlayer extends Omit<PublicPlayer, 'connected'> {
  secret: string;
  joinedAt: number;
}

interface RoomData {
  code: string;
  name: string;
  admin?: { name: string; avatar: Avatar } | null;
  pinHash: string;
  adminToken: string;
  createdAt: number;
  games: GameConfig[];
  scale: number[];
  customWords: string[];
  customFamous: string[];
  players: Record<string, StoredPlayer>;
  order: string[];
  phase: RoomPhase;
  gameIndex: number;
  game: unknown | null;
  results: (GameResult | null)[];
}

interface Attachment {
  role: 'host' | 'player' | 'pending';
  playerId?: string;
}

const randomId = (bytes = 12) => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const VALID_GAMES: GameType[] = ['chess', 'reves', 'geo', 'palabra', 'penales'];

function cleanAvatar(a: any, name: string): Avatar {
  const seed = String(a?.seed ?? 'jugador').slice(0, 40) || 'jugador';
  const hue = Math.max(0, Math.min(360, Math.round(Number(a?.hue) || 0)));
  const expression = String(a?.expression ?? 'happy') as Avatar['expression'];
  const special = specialForName(name);
  return special ? { seed, hue, expression, special } : { seed, hue, expression };
}

/** Avatar del admin: personaje especial si el nombre coincide, si no un blob fijo derivado del nombre. */
function adminAvatar(name: string): Avatar {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const special = specialForName(name);
  const base: Avatar = { seed: `profe-${name}`, hue: h % 360, expression: 'smug' };
  return special ? { ...base, special } : base;
}

function cleanList(list: unknown, max: number, len: number): string[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((x) => String(x).trim().slice(0, len)).filter(Boolean))].slice(0, max);
}

export class Room extends DurableObject<Env> {
  private data: RoomData | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  /** Procesa de a un mensaje por vez, aunque haya awaits (Mapillary, IA) en el medio. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<RoomData | null> {
    if (!this.data) this.data = (await this.ctx.storage.get<RoomData>('room')) ?? null;
    return this.data;
  }

  private async save() {
    if (this.data) await this.ctx.storage.put('room', this.data);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init') return this.serial(() => this.init(request));
    if (url.pathname === '/info') {
      const d = await this.load();
      if (!d) return Response.json({ exists: false }, { status: 404 });
      return Response.json({ exists: true, name: d.name, phase: d.phase, players: d.order.length, maxPlayers: MAX_PLAYERS });
    }
    if (url.pathname === '/tts') return this.tts(request);
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba WebSocket', { status: 426 });
      if (!(await this.load())) return new Response('La sala no existe', { status: 404 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ role: 'pending' } satisfies Attachment);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('No encontrado', { status: 404 });
  }

  private async init(request: Request): Promise<Response> {
    if (await this.load()) return new Response('Existe', { status: 409 });
    const body = (await request.json()) as CreateRoomRequest & { code: string };
    const name = String(body.name ?? '').trim().slice(0, 40);
    const pin = String(body.pin ?? '').trim();
    if (!name) return new Response('Falta el nombre del evento', { status: 400 });
    if (!/^\d{4,8}$/.test(pin)) return new Response('El PIN tiene que ser de 4 a 8 números', { status: 400 });
    const games = (Array.isArray(body.games) ? body.games : [])
      .filter((g) => VALID_GAMES.includes(g?.type))
      .map((g) => ({ type: g.type, rounds: Math.max(1, Math.min(g.type === 'palabra' ? 60 : g.type === 'penales' ? 2 : 15, Math.round(Number(g.rounds) || 1))) }));
    if (!games.length) return new Response('Elegí al menos un juego', { status: 400 });
    const adminName = String(body.adminName ?? '').trim().slice(0, 24);
    this.data = {
      code: body.code,
      name,
      admin: adminName ? { name: adminName, avatar: adminAvatar(adminName) } : null,
      pinHash: await sha256(`${body.code}:${pin}`),
      adminToken: randomId(),
      createdAt: Date.now(),
      games,
      scale: DEFAULT_SCALE,
      customWords: cleanList(body.customWords, 100, 30),
      customFamous: cleanList(body.customFamous, 50, 40),
      players: {},
      order: [],
      phase: 'lobby',
      gameIndex: 0,
      game: null,
      results: games.map(() => null)
    };
    await this.save();
    return Response.json({ code: body.code });
  }

  // ---------- Vistas ----------

  private connectedIds(): Set<string> {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.role === 'player' && a.playerId) ids.add(a.playerId);
    }
    return ids;
  }

  private gameCtx(d: RoomData): GameCtx {
    return {
      playerIds: [...d.order],
      names: Object.fromEntries(d.order.map((id) => [id, d.players[id].name])),
      now: Date.now(),
      env: this.env,
      rand: Math.random,
      config: d.games[d.gameIndex],
      customWords: d.customWords,
      customFamous: d.customFamous
    };
  }

  private roomView(d: RoomData): RoomView {
    const online = this.connectedIds();
    const totals: Record<string, number> = Object.fromEntries(d.order.map((id) => [id, 0]));
    for (const r of d.results) for (const e of r?.ranking ?? []) totals[e.playerId] = (totals[e.playerId] ?? 0) + e.points;
    return {
      code: d.code,
      name: d.name,
      admin: d.admin ?? null,
      phase: d.phase,
      games: d.games,
      gameIndex: d.gameIndex,
      players: d.order.map((id) => ({ id, name: d.players[id].name, avatar: d.players[id].avatar, connected: online.has(id) })),
      results: d.results,
      totals,
      scale: d.scale,
      maxPlayers: MAX_PLAYERS
    };
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket cerrado */
    }
  }

  private broadcast() {
    const d = this.data;
    if (!d) return;
    const room = this.roomView(d);
    const ctx = this.gameCtx(d);
    const mod = d.phase === 'game' && d.game ? MODULES[d.games[d.gameIndex].type] : null;
    let hostGame: unknown;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.role === 'host') {
        hostGame ??= mod ? mod.hostView(d.game, ctx) : null;
        this.send(ws, { t: 'state', role: 'host', room, game: hostGame });
      } else if (a?.role === 'player' && a.playerId && d.players[a.playerId]) {
        const me = room.players.find((p) => p.id === a.playerId)!;
        this.send(ws, { t: 'state', role: 'player', room, me, game: mod ? mod.playerView(d.game, a.playerId, ctx) : null });
      }
    }
  }

  // ---------- WebSocket ----------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 20_000) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    await this.serial(async () => {
      const d = await this.load();
      if (!d) {
        this.send(ws, { t: 'error', message: 'La sala no existe', fatal: true });
        return;
      }
      try {
        const changed = await this.handle(ws, d, msg);
        if (changed) {
          await this.save();
          this.broadcast();
        }
      } catch (e) {
        const message = e instanceof GameError ? e.message : 'Algo salió mal';
        if (!(e instanceof GameError)) console.error(e);
        this.send(ws, { t: 'error', message });
        // Algunas reglas cierran la ronda antes de rechazar la acción (ej. se terminó el tiempo).
        if (e instanceof GameError) {
          await this.save();
          this.broadcast();
        }
      }
    });
  }

  async webSocketClose(ws: WebSocket) {
    ws.serializeAttachment({ role: 'pending' } satisfies Attachment);
    await this.serial(async () => {
      if (await this.load()) this.broadcast();
    });
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  /** Devuelve true si hay que guardar y mandar el estado a todos. */
  private async handle(ws: WebSocket, d: RoomData, msg: ClientMessage): Promise<boolean> {
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { role: 'pending' };

    switch (msg.t) {
      case 'hello-host': {
        const ok = (msg.adminToken && msg.adminToken === d.adminToken) || (msg.pin && (await sha256(`${d.code}:${msg.pin}`)) === d.pinHash);
        if (!ok) throw new GameError('PIN incorrecto');
        ws.serializeAttachment({ role: 'host' } satisfies Attachment);
        this.send(ws, { t: 'host-ok', adminToken: d.adminToken });
        return true;
      }
      case 'hello-player': {
        const p = d.players[msg.playerId];
        if (!p || p.secret !== msg.secret) {
          this.send(ws, { t: 'error', message: 'Tu sesión no es de esta sala', fatal: true });
          return false;
        }
        ws.serializeAttachment({ role: 'player', playerId: p.id } satisfies Attachment);
        return true;
      }
      case 'join': {
        if (d.phase === 'final') throw new GameError('El evento ya terminó');
        if (d.order.length >= MAX_PLAYERS) throw new GameError(`La sala está llena (máximo ${MAX_PLAYERS})`);
        const typed = String(msg.name ?? '').trim();
        let name = typed.slice(0, 24);
        if (!name) throw new GameError('Poné tu nombre');
        const taken = new Set(d.order.map((id) => d.players[id].name.toLowerCase()));
        for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${name.replace(/ \d+$/, '')} ${n}`;
        const id = randomId(6);
        const secret = randomId(16);
        d.players[id] = { id, name, avatar: cleanAvatar(msg.avatar, name === typed.slice(0, 24) ? typed : name), secret, joinedAt: Date.now() };
        d.order.push(id);
        ws.serializeAttachment({ role: 'player', playerId: id } satisfies Attachment);
        if (d.phase === 'game' && d.game) MODULES[d.games[d.gameIndex].type].onPlayerJoined?.(d.game, id, this.gameCtx(d));
        this.send(ws, { t: 'joined', playerId: id, secret });
        return true;
      }
      case 'profile': {
        if (att.role !== 'player' || !att.playerId) throw new GameError('No estás en la sala');
        const p = d.players[att.playerId];
        const name = String(msg.name ?? '').trim().slice(0, 24);
        if (name && !d.order.some((id) => id !== p.id && d.players[id].name.toLowerCase() === name.toLowerCase())) p.name = name;
        p.avatar = cleanAvatar(msg.avatar, p.name);
        return true;
      }
      case 'room': {
        if (att.role !== 'host') throw new GameError('Solo el admin puede hacer eso');
        return this.roomAction(d, msg.action, msg.payload);
      }
      case 'game': {
        if (d.phase !== 'game' || !d.game) throw new GameError('No hay un juego en curso');
        const mod = MODULES[d.games[d.gameIndex].type];
        const ctx = this.gameCtx(d);
        if (att.role === 'host') await mod.onHost(d.game, String(msg.action), msg.payload, ctx);
        else if (att.role === 'player' && att.playerId) await mod.onPlayer(d.game, att.playerId, String(msg.action), msg.payload, ctx);
        else throw new GameError('No estás en la sala');
        return true;
      }
      default:
        return false;
    }
  }

  private roomAction(d: RoomData, action: string, payload: any): boolean {
    switch (action) {
      case 'start-game': {
        if (d.phase !== 'lobby' && d.phase !== 'results') throw new GameError('Ahora no se puede empezar un juego');
        if (d.gameIndex >= d.games.length) throw new GameError('Ya se jugaron todos los juegos');
        if (!d.order.length) throw new GameError('Todavía no se sumó nadie');
        d.game = MODULES[d.games[d.gameIndex].type].init(this.gameCtx(d));
        d.phase = 'game';
        return true;
      }
      case 'end-game': {
        if (d.phase !== 'game' || !d.game) throw new GameError('No hay un juego en curso');
        const type = d.games[d.gameIndex].type;
        const rows = MODULES[type].ranking(d.game, this.gameCtx(d));
        const placed = placeRanking(rows, d.scale);
        d.results[d.gameIndex] = { type, ranking: placed.map((r) => ({ playerId: r.playerId, place: r.place, points: r.points, label: r.label })) };
        d.game = null;
        d.gameIndex++;
        d.phase = 'results';
        return true;
      }
      case 'crown': {
        if (d.phase !== 'results') throw new GameError('Primero terminá el juego en curso');
        d.phase = 'final';
        return true;
      }
      case 'kick': {
        const id = String(payload?.playerId ?? '');
        if (!d.players[id]) return false;
        if (d.phase !== 'lobby') throw new GameError('Solo se puede sacar gente antes de empezar');
        delete d.players[id];
        d.order = d.order.filter((x) => x !== id);
        for (const ws of this.ctx.getWebSockets()) {
          const a = ws.deserializeAttachment() as Attachment | null;
          if (a?.playerId === id) {
            this.send(ws, { t: 'error', message: 'El admin te sacó de la sala', fatal: true });
            ws.serializeAttachment({ role: 'pending' } satisfies Attachment);
          }
        }
        return true;
      }
      default:
        throw new GameError('Acción desconocida');
    }
  }

  // ---------- Voz para "Nombres al revés" ----------

  private async tts(request: Request): Promise<Response> {
    const d = await this.load();
    if (!d) return new Response('La sala no existe', { status: 404 });
    if (request.headers.get('x-admin-token') !== d.adminToken) return new Response('Solo el admin', { status: 403 });
    if (d.phase !== 'game' || d.games[d.gameIndex]?.type !== 'reves' || !d.game) return new Response('No hay famoso en juego', { status: 409 });
    const name = currentFamous(d.game as RevesState);
    if (!name) return new Response('No hay famoso en juego', { status: 409 });

    const key = `tts:${name}`;
    let audio = await this.ctx.storage.get<ArrayBuffer>(key);
    if (!audio) {
      if (!this.env.AI) return new Response('Workers AI no está configurado', { status: 503 });
      try {
        const out: any = await this.env.AI.run('@cf/myshell-ai/melotts' as any, { prompt: name, lang: 'es' } as any);
        audio = await toArrayBuffer(out);
      } catch (e) {
        console.error('TTS', e);
        return new Response('No se pudo generar la voz', { status: 502 });
      }
      await this.ctx.storage.put(key, audio);
    }
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
  }
}

async function toArrayBuffer(out: any): Promise<ArrayBuffer> {
  if (out instanceof ArrayBuffer) return out;
  if (out instanceof Uint8Array) return out.slice().buffer;
  if (out instanceof ReadableStream) return new Response(out).arrayBuffer();
  if (typeof out?.audio === 'string') {
    const bin = atob(out.audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  throw new Error('Formato de audio desconocido');
}
