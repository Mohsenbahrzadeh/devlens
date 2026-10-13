import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../app/App';
import type { Route } from '../app/routes';
import '../styles/index.css';
import { Panel } from './Panel';

// Defined once so the App does not rebuild its tab list on every render.
const EXTRA: Route[] = [
  { id: 'network', label: 'Network', icon: 'send', component: Panel, wide: true, keepAlive: true },
];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App extraRoutes={EXTRA} />
  </StrictMode>,
);
