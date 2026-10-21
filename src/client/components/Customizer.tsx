import { useMemo, useState } from 'react';
import { EXPRESSIONS, type Avatar as AvatarT } from '../../shared/types';
import { Avatar, ChalkCircle } from './chalk';
import { specialForName } from '../../shared/specials';

const HUES = [330, 10, 40, 95, 150, 195, 230, 270];
const EXPRESSION_LABELS: Record<string, string> = {
  happy: 'Feliz', wink: 'Guiño', smug: 'Canchero', love: 'Enamorado',
  surprised: 'Sorprendido', mad: 'Enojado', shy: 'Tímido', sleepy: 'Dormido'
};

function randomSeed() {
  return Math.random().toString(36).slice(2, 8);
}

export function defaultAvatar(): AvatarT {
  return { seed: randomSeed(), hue: HUES[Math.floor(Math.random() * HUES.length)], expression: 'happy' };
}

export function Customizer({
  initialName = '',
  initialAvatar,
  submitLabel,
  onSubmit,
  busy
}: {
  initialName?: string;
  initialAvatar?: AvatarT;
  submitLabel: string;
  onSubmit: (name: string, avatar: AvatarT) => void;
  busy?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<AvatarT>(initialAvatar ?? defaultAvatar());
  const [batch, setBatch] = useState(0);
  const special = specialForName(name);

  // Cuatro formas para elegir; "otras" trae cuatro nuevas.
  const shapes = useMemo(() => {
    const base = [avatar.seed];
    for (let i = 0; base.length < 4; i++) base.push(`${randomSeed()}${batch}${i}`);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch]);

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim(), avatar);
      }}
    >
      <div className="stack" style={{ alignItems: 'center', gap: 4 }}>
        <Avatar avatar={{ ...avatar, special }} size={special ? 120 : 150} title="Tu personaje" body />
        {special && (
          <span className="yellow" style={{ fontSize: 22, fontWeight: 700 }}>
            ¡Personaje especial desbloqueado!
          </span>
        )}
        <label htmlFor="nombre" className="label">
          tu nombre
        </label>
        <input
          id="nombre"
          className="chalk-input center"
          style={{ width: '80%' }}
          value={name}
          maxLength={24}
          autoComplete="nickname"
          placeholder="¿Cómo te dicen?"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {!special && (
        <>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row between">
          <span className="yellow" style={{ fontSize: 22, fontWeight: 700 }}>
            Elegí tu imán
          </span>
          <button type="button" className="chip" onClick={() => setBatch((b) => b + 1)}>
            Otras formas
          </button>
        </div>
        <div className="row between">
          {shapes.map((seed, i) => (
            <button
              key={seed}
              type="button"
              aria-label={`Forma ${i + 1}`}
              aria-pressed={avatar.seed === seed}
              onClick={() => setAvatar((a) => ({ ...a, seed }))}
              style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer' }}
            >
              {avatar.seed === seed ? (
                <ChalkCircle size={68} color="var(--yellow)">
                  <Avatar avatar={{ ...avatar, seed }} size={56} />
                </ChalkCircle>
              ) : (
                <Avatar avatar={{ ...avatar, seed }} size={56} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <span className="blue" style={{ fontSize: 22, fontWeight: 700 }}>
          Color
        </span>
        <div className="row between">
          {HUES.map((hue) => (
            <button
              key={hue}
              type="button"
              aria-label={`Color ${hue}`}
              aria-pressed={avatar.hue === hue}
              onClick={() => setAvatar((a) => ({ ...a, hue }))}
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                border: 0,
                cursor: 'pointer',
                background: `oklch(0.8 0.12 ${hue})`,
                boxShadow: avatar.hue === hue ? '0 0 0 3px var(--slate), 0 0 0 6px var(--chalk)' : 'none'
              }}
            />
          ))}
        </div>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <span className="pink" style={{ fontSize: 22, fontWeight: 700 }}>
          Cara de festejo
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {EXPRESSIONS.map((expression) => (
            <button
              key={expression}
              type="button"
              aria-label={EXPRESSION_LABELS[expression]}
              aria-pressed={avatar.expression === expression}
              onClick={() => setAvatar((a) => ({ ...a, expression }))}
              style={{
                background: 'none',
                border: 0,
                borderBottom: `3px solid ${avatar.expression === expression ? 'var(--pink)' : 'transparent'}`,
                padding: '2px 0 4px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <Avatar avatar={{ ...avatar, expression }} size={46} />
            </button>
          ))}
        </div>
      </div>

        </>
      )}

      <button className="btn yellow block" disabled={!name.trim() || busy} style={{ marginTop: 8 }}>
        {submitLabel}
      </button>
    </form>
  );
}
