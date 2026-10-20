import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, HostMessage, PlayerMessage, ServerMessage } from '../../shared/types';

// ---------- Sesiones guardadas en el celular / la compu del host ----------

const playerKey = (code: string) => `mj:player:${code}`;
const hostKey = (code: string) => `mj:host:${code}`;

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado */
  }
}

export const playerSession = {
  get: (code: string) => read<{ playerId: string; secret: string }>(playerKey(code)),
  set: (code: string, s: { playerId: string; secret: string } | null) => write(playerKey(code), s)
};
export const hostSession = {
  get: (code: string) => read<string>(hostKey(code)),
  set: (code: string, token: string | null) => write(hostKey(code), token)
};

// ---------- Conexión ----------

export type Status = 'connecting' | 'online' | 'offline' | 'need-pin' | 'need-join' | 'fatal';

type StateMsg<R> = R extends 'host' ? HostMessage : PlayerMessage;

export function useRoom<R extends 'host' | 'player'>(code: string, role: R) {
  const [status, setStatus] = useState<Status>('connecting');
  const [state, setState] = useState<StateMsg<R> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const alive = useRef(true);
  const retry = useRef(0);
  const errTimer = useRef<number>(0);

  const showError = useCallback((msg: string) => {
    setError(msg);
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setError(null), 3500);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else showError('Sin conexión, reintentando…');
  }, [showError]);

  useEffect(() => {
    alive.current = true;
    let pingTimer = 0;
    let reconnectTimer = 0;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/api/rooms/${code}/ws`);
      wsRef.current = ws;
      setStatus((s) => (s === 'fatal' ? s : 'connecting'));

      ws.onopen = () => {
        retry.current = 0;
        if (role === 'host') {
          const token = hostSession.get(code);
          if (token) ws.send(JSON.stringify({ t: 'hello-host', adminToken: token } satisfies ClientMessage));
          else setStatus('need-pin');
        } else {
          const s = playerSession.get(code);
          if (s) ws.send(JSON.stringify({ t: 'hello-player', ...s } satisfies ClientMessage));
          else setStatus('need-join');
        }
        pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"t":"ping"}'), 25_000);
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage | { t: 'pong' };
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.t === 'state') {
          setState(msg as StateMsg<R>);
          setStatus('online');
        } else if (msg.t === 'joined') {
          playerSession.set(code, { playerId: msg.playerId, secret: msg.secret });
        } else if (msg.t === 'host-ok') {
          hostSession.set(code, msg.adminToken);
        } else if (msg.t === 'error') {
          if (msg.fatal) {
            if (role === 'player') playerSession.set(code, null);
            setStatus(role === 'player' && /sesión/.test(msg.message) ? 'need-join' : 'fatal');
          }
          if (role === 'host' && msg.message === 'PIN incorrecto') {
            hostSession.set(code, null);
            setStatus('need-pin');
          }
          showError(msg.message);
        }
      };

      ws.onclose = () => {
        window.clearInterval(pingTimer);
        if (!alive.current) return;
        setStatus((s) => (s === 'fatal' ? s : 'offline'));
        const wait = Math.min(8000, 500 * 2 ** retry.current++);
        reconnectTimer = window.setTimeout(connect, wait);
      };
    };

    connect();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wsRef.current?.readyState !== WebSocket.OPEN) {
        window.clearTimeout(reconnectTimer);
        retry.current = 0;
        wsRef.current?.close();
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(pingTimer);
      window.clearTimeout(reconnectTimer);
      document.removeEventListener('visibilitychange', onVisible);
      wsRef.current?.close();
    };
  }, [code, role]);

  return { status, state, send, error, showError };
}

/** Segundos que faltan para `deadline` (se actualiza solo). */
export function useCountdown(deadline: number | null | undefined): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function joinUrl(code: string) {
  return `${location.origin}/j/${code}`;
}
