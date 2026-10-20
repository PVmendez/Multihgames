import { useState } from 'react';
import { navigate } from '../main';
import { Ledge, Underline } from '../components/chalk';

export function Landing() {
  const [code, setCode] = useState('');
  const valid = /^[A-Za-z0-9]{4}$/.test(code);

  return (
    <div className="frame">
      <main className="slate" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="stack fade-in" style={{ maxWidth: 520, width: '100%', gap: 28 }}>
          <div>
            <div className="blue" style={{ fontSize: 20 }}>
              multijuegos para tu grupo
            </div>
            <h1 className="display h1">Noche de juegos</h1>
            <Underline width={300} />
          </div>

          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) navigate(`/j/${code.toUpperCase()}`);
            }}
          >
            <label htmlFor="code" className="display h3 yellow">
              Entrá con el código
            </label>
            <div className="row">
              <input
                id="code"
                className="chalk-input grow"
                style={{ letterSpacing: '0.2em', textTransform: 'uppercase' }}
                value={code}
                maxLength={4}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="4K7Q"
                onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
              />
              <button className="btn yellow" disabled={!valid}>
                Entrar
              </button>
            </div>
            <span className="muted">Lo ves en la pantalla grande, o escaneá el QR.</span>
          </form>

          <div className="paper" style={{ transform: 'rotate(-1.5deg)', marginTop: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>¿Organizás vos?</div>
            <p style={{ margin: '4px 0 12px' }}>Armá el evento, elegí los juegos y poné la pantalla en la tele.</p>
            <button className="btn paper-btn" onClick={() => navigate('/crear')}>
              Armar un evento
            </button>
          </div>
        </div>
      </main>
      <Ledge />
    </div>
  );
}
