import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { Landing } from './pages/Landing';
import { Create } from './pages/Create';
import { Host } from './pages/Host';
import { Play } from './pages/Play';

export function navigate(path: string) {
  history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const join = path.match(/^\/j\/([A-Za-z0-9]{4})\/?$/);
  if (join) return <Play code={join[1].toUpperCase()} />;
  const host = path.match(/^\/host\/([A-Za-z0-9]{4})\/?$/);
  if (host) return <Host code={host[1].toUpperCase()} />;
  if (path === '/crear') return <Create />;
  return <Landing />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
