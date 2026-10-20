import type { CreateRoomRequest } from '../shared/types';
import type { Env } from './games/types';

export { Room } from './room';

// Sin letras ni números que se confundan (O/0, I/1, L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newCode(): string {
  const a = new Uint8Array(4);
  crypto.getRandomValues(a);
  return [...a].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

const roomStub = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code.toUpperCase()));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['api','rooms',CODE,'ws']

    if (parts[0] !== 'api') {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('No encontrado', { status: 404 });
    }

    // Diagnóstico rápido: qué configuración ve el Worker (sin mostrar valores).
    if (parts[1] === 'health') {
      return Response.json({ mapillaryToken: !!env.MAPILLARY_TOKEN, workersAI: !!env.AI });
    }

    if (parts[1] === 'rooms' && parts.length === 2 && request.method === 'POST') {
      let body: CreateRoomRequest;
      try {
        body = await request.json();
      } catch {
        return new Response('Pedido inválido', { status: 400 });
      }
      for (let i = 0; i < 8; i++) {
        const code = newCode();
        const res = await roomStub(env, code).fetch('https://room/init', {
          method: 'POST',
          body: JSON.stringify({ ...body, code })
        });
        if (res.status !== 409) return res;
      }
      return new Response('No se pudo crear la sala, probá de nuevo', { status: 503 });
    }

    if (parts[1] === 'rooms' && parts[2] && /^[A-Za-z0-9]{4}$/.test(parts[2])) {
      const sub = parts[3] ?? 'info';
      if (!['ws', 'tts', 'info'].includes(sub)) return new Response('No encontrado', { status: 404 });
      const target = new URL(`https://room/${sub}`);
      return roomStub(env, parts[2]).fetch(new Request(target, request));
    }

    return new Response('No encontrado', { status: 404 });
  }
} satisfies ExportedHandler<Env>;
