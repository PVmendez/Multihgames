import { useEffect, useMemo, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { blobatar } from 'blobatar';
import * as Expr from 'blobatar/expression';
import type { Avatar as AvatarT } from '../../shared/types';
import { fmtTime, useCountdown } from '../lib/room';

// ---------- Avatar (Blobatar) ----------

export function avatarSvg(avatar: AvatarT, title?: string): string {
  const expression = (Expr as Record<string, any>)[avatar.expression] ?? Expr.happy;
  // Tono fijo claro y saturado: se lee bien sobre el pizarrón oscuro.
  return blobatar(avatar.seed, { hue: avatar.hue, tone: 0.85, expression, background: false, title });
}

export function Avatar({ avatar, size = 56, offline, title }: { avatar: AvatarT; size?: number; offline?: boolean; title?: string }) {
  const svg = useMemo(() => avatarSvg(avatar, title), [avatar.seed, avatar.hue, avatar.expression, title]);
  return (
    <span
      className={`avatar${offline ? ' offline' : ''}`}
      style={{ width: size, height: size }}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ---------- Trazos de tiza ----------

export function ChalkCircle({ size = 44, color = 'var(--chalk)', children, stroke = 2.5 }: { size?: number; color?: string; children?: ReactNode; stroke?: number }) {
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontWeight: 700, color }}>
      <svg aria-hidden="true" width={size + 4} height={size + 4} viewBox="0 0 44 44" style={{ position: 'absolute', left: -2, top: -2 }}>
        <path d="M22 4 C 34 3, 41 12, 40 23 C 39 35, 30 41, 20 40 C 9 39, 3 31, 4 20 C 5 10, 14 5, 26 6" stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {children}
    </span>
  );
}

export function Underline({ width = 320, color = 'var(--yellow)' }: { width?: number; color?: string }) {
  return (
    <svg className="underline-chalk" aria-hidden="true" width={width} height="14" viewBox="0 0 340 16" preserveAspectRatio="none">
      <path d="M4 10 C 70 2, 140 15, 200 7 S 300 12, 336 5" stroke={color} strokeWidth="4" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Crown({ size = 40, color = 'var(--yellow)', filled }: { size?: number; color?: string; filled?: boolean }) {
  return (
    <svg aria-hidden="true" width={size} height={size * 0.65} viewBox="0 0 40 26">
      <path d="M3 22 L6 5 L14 14 L20 2 L26 14 L34 5 L37 22 Z" stroke={color} strokeWidth="3" fill={filled ? color : 'none'} strokeLinejoin="round" />
    </svg>
  );
}

/** Palitos de a cinco, como en el truco. */
export function Tally({ count, color = 'var(--chalk)' }: { count: number; color?: string }) {
  const groups: number[] = [];
  for (let left = Math.max(0, count); left > 0; left -= 5) groups.push(Math.min(5, left));
  const jit = [0, 1, -1, 1, 0];
  return (
    <>
      {groups.map((n, gi) => {
        let d = '';
        for (let i = 0; i < Math.min(n, 4); i++) {
          const x = 7 + i * 7;
          d += `M${x} ${4 + jit[i]} L${x + jit[i + 1]} ${30 - jit[i]} `;
        }
        if (n === 5) d += 'M2 25 L36 8';
        return (
          <svg key={gi} aria-hidden="true" width="38" height="34" viewBox="0 0 38 34">
            <path d={d} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
        );
      })}
    </>
  );
}

export function Countdown({ deadline, size = 64 }: { deadline: number | null | undefined; size?: number }) {
  const left = useCountdown(deadline);
  if (left === null) return null;
  const color = left <= 10 ? 'var(--pink)' : 'var(--chalk)';
  return (
    <ChalkCircle size={size} color={color}>
      <span style={{ fontSize: size * 0.33 }} aria-label={`Quedan ${left} segundos`}>
        {fmtTime(left)}
      </span>
    </ChalkCircle>
  );
}

export function Ledge() {
  return (
    <div className="ledge" aria-hidden="true">
      <span style={{ width: 70, background: 'var(--chalk)' }} />
      <span style={{ width: 46, background: 'var(--yellow)' }} />
      <span style={{ width: 34, background: 'var(--pink)' }} />
      <span style={{ marginLeft: 'auto', width: 120, height: 24, borderRadius: 4, background: '#2d2d2d', borderTop: '8px solid #8a6b4a' }} />
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast fade-in" role="status">
      {message}
    </div>
  );
}

export function QR({ text, size = 120 }: { text: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#1e1e1e', light: '#f4f1e8' } }).then(setSvg);
  }, [text]);
  return <div className="qr" style={{ width: size }} role="img" aria-label={`Código QR para entrar: ${text}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Connection({ status }: { status: string }) {
  if (status === 'online') return null;
  const label = status === 'offline' ? 'Sin conexión, reconectando…' : 'Conectando…';
  return (
    <div className="toast" role="status" style={{ top: 16, bottom: 'auto' }}>
      {label}
    </div>
  );
}

/** Texto que se ve solo mientras se mantiene apretado (para el admin). */
export function HoldToReveal({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      className={`reveal-hold${on ? ' on' : ''}`}
      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
      onPointerDown={() => setOn(true)}
      onPointerUp={() => setOn(false)}
      onPointerLeave={() => setOn(false)}
      onKeyDown={(e) => e.key === ' ' && setOn(true)}
      onKeyUp={() => setOn(false)}
      aria-label="Mantené apretado para ver la palabra"
    >
      {children}
    </button>
  );
}
