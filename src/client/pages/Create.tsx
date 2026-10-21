import { useState } from 'react';
import { navigate } from '../main';
import { Avatar, ChalkCircle, Ledge, Underline } from '../components/chalk';
import { specialForName } from '../../shared/specials';
import { DEFAULT_ROUNDS, GAME_INFO, type CreateRoomRequest, type GameType } from '../../shared/types';

const ALL: GameType[] = ['chess', 'reves', 'geo', 'penales', 'palabra'];
const ROUND_LABEL: Record<GameType, string> = { chess: 'retos', reves: 'famosos', geo: 'lugares', palabra: 'minutos', penales: 'vueltas' };

export const pendingPin = {
  set: (code: string, pin: string) => sessionStorage.setItem(`mj:pin:${code}`, pin),
  take: (code: string) => {
    const v = sessionStorage.getItem(`mj:pin:${code}`);
    sessionStorage.removeItem(`mj:pin:${code}`);
    return v;
  }
};

export function Create() {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [adminName, setAdminName] = useState('');
  const [games, setGames] = useState<{ type: GameType; on: boolean; rounds: number }[]>(
    ALL.map((type) => ({ type, on: true, rounds: DEFAULT_ROUNDS[type] }))
  );
  const [words, setWords] = useState('');
  const [famous, setFamous] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = games.filter((g) => g.on);
  const ok = name.trim() && /^\d{4,8}$/.test(pin) && chosen.length > 0;

  const moveGame = (i: number, dir: -1 | 1) =>
    setGames((gs) => {
      const j = i + dir;
      if (j < 0 || j >= gs.length) return gs;
      const copy = [...gs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const submit = async () => {
    setBusy(true);
    setError(null);
    const body: CreateRoomRequest = {
      name: name.trim(),
      pin,
      adminName: adminName.trim() || undefined,
      games: chosen.map(({ type, rounds }) => ({ type, rounds })),
      customWords: words.split(/[\n,]/).map((w) => w.trim()).filter(Boolean),
      customFamous: famous.split(/\n/).map((w) => w.trim()).filter(Boolean)
    };
    try {
      const res = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.text()) || 'No se pudo crear el evento');
      const { code } = (await res.json()) as { code: string };
      pendingPin.set(code, pin);
      navigate(`/host/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el evento');
      setBusy(false);
    }
  };

  return (
    <div className="frame">
      <main className="slate" style={{ padding: 'clamp(20px, 4vw, 48px)' }}>
        <form
          className="stack fade-in"
          style={{ maxWidth: 760, margin: '0 auto', gap: 26 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (ok && !busy) void submit();
          }}
        >
          <div>
            <button type="button" className="chip" onClick={() => navigate('/')}>
              ← volver
            </button>
            <h1 className="display h1" style={{ marginTop: 12 }}>
              Armá tu noche
            </h1>
            <Underline width={280} />
          </div>

          <div className="field">
            <label htmlFor="ev">Nombre del evento o del grupo</label>
            <input id="ev" className="chalk-input" value={name} maxLength={40} placeholder="Los pibes del barrio" onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="row wrap" style={{ alignItems: 'flex-end', gap: 20 }}>
            <div className="field grow" style={{ minWidth: 240 }}>
              <label htmlFor="admin">Tu nombre (el profe que conduce, opcional)</label>
              <input id="admin" className="chalk-input" value={adminName} maxLength={24} placeholder="Prof. …" onChange={(e) => setAdminName(e.target.value)} />
            </div>
            {specialForName(adminName) && (
              <div className="row" style={{ gap: 10 }}>
                <Avatar avatar={{ seed: 'x', hue: 0, expression: 'happy', special: specialForName(adminName) }} size={56} />
                <span className="yellow" style={{ fontWeight: 700 }}>¡Personaje especial!</span>
              </div>
            )}
          </div>

          <div className="field" style={{ maxWidth: 280 }}>
            <label htmlFor="pin">PIN del admin (4 a 8 números)</label>
            <input
              id="pin"
              className="chalk-input"
              inputMode="numeric"
              value={pin}
              maxLength={8}
              placeholder="••••"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
            <span className="muted" style={{ fontSize: 15 }}>
              Te lo va a pedir la pantalla grande. No lo compartas.
            </span>
          </div>

          <div className="stack">
            <h2 className="display h3 yellow">Hoy se juega:</h2>
            {games.map((g, i) => (
              <div key={g.type} className="row wrap" style={{ opacity: g.on ? 1 : 0.5 }}>
                <ChalkCircle size={40}>{i + 1}</ChalkCircle>
                <label className="row grow" style={{ cursor: 'pointer', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={g.on}
                    onChange={(e) => setGames((gs) => gs.map((x) => (x.type === g.type ? { ...x, on: e.target.checked } : x)))}
                    style={{ width: 22, height: 22, accentColor: '#f3d36b' }}
                  />
                  <span style={{ fontSize: 24, fontWeight: 700 }}>{GAME_INFO[g.type].name}</span>
                </label>
                <label className="row" style={{ gap: 6 }}>
                  <input
                    type="number"
                    min={1}
                    max={g.type === 'palabra' ? 60 : g.type === 'penales' ? 2 : 15}
                    value={g.rounds}
                    onChange={(e) => setGames((gs) => gs.map((x) => (x.type === g.type ? { ...x, rounds: Number(e.target.value) || 1 } : x)))}
                    className="chalk-input"
                    style={{ width: 64, height: 40, fontSize: 22, textAlign: 'center' }}
                    aria-label={`Cantidad de ${ROUND_LABEL[g.type]}`}
                  />
                  <span className="muted">{ROUND_LABEL[g.type]}</span>
                </label>
                <div className="row" style={{ gap: 4 }}>
                  <button type="button" className="chip" aria-label="Subir" onClick={() => moveGame(i, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" className="chip" aria-label="Bajar" onClick={() => moveGame(i, 1)} disabled={i === games.length - 1}>
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>

          <details className="dashed-box">
            <summary style={{ cursor: 'pointer', fontSize: 20 }}>Contenido propio (opcional)</summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="fam">Famosos para Nombres al revés (uno por línea, van primero)</label>
                <textarea id="fam" className="chalk-input" value={famous} onChange={(e) => setFamous(e.target.value)} placeholder={'Luis Suárez\nNatalia Oreiro'} />
              </div>
              <div className="field">
                <label htmlFor="words">Palabras para No digas tu palabra (separadas por coma)</label>
                <textarea id="words" className="chalk-input" value={words} onChange={(e) => setWords(e.target.value)} placeholder="chistes internos, apodos, lugares del grupo…" />
              </div>
            </div>
          </details>

          {error && <div className="pink">{error}</div>}
          <button className="btn yellow" disabled={!ok || busy} style={{ alignSelf: 'flex-start' }}>
            {busy ? 'Armando…' : 'Crear evento'}
          </button>
        </form>
      </main>
      <Ledge />
    </div>
  );
}
