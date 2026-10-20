import { useEffect, useRef } from 'react';
import type { PublicPlayer, RoomView } from '../../shared/types';
import type { useRoom } from '../lib/room';

export type Send = ReturnType<typeof useRoom>['send'];

export interface HostProps<G> {
  game: G;
  room: RoomView;
  players: Record<string, PublicPlayer>;
  send: Send;
}

export interface PlayProps<G> extends HostProps<G> {
  me: PublicPlayer;
}

/** En el host: cuando se cumple el tiempo, dispara la acción una sola vez. */
export function useWhenTimeUp(deadline: number | null | undefined, active: boolean, fire: () => void) {
  const fired = useRef<number | null>(null);
  const fireRef = useRef(fire);
  fireRef.current = fire;
  useEffect(() => {
    if (!active || !deadline || fired.current === deadline) return;
    const ms = deadline - Date.now();
    const t = window.setTimeout(() => {
      fired.current = deadline;
      fireRef.current();
    }, Math.max(0, ms) + 300);
    return () => window.clearTimeout(t);
  }, [deadline, active]);
}

export function RoundLabel({ round, rounds, noun }: { round: number; rounds: number; noun: string }) {
  if (round < 0) return null;
  return (
    <span className="blue" style={{ fontSize: 20 }}>
      {noun} {round + 1} de {rounds}
    </span>
  );
}
