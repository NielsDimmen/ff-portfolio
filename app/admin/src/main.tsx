import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './styles.css';

const baseHref = document.querySelector('base')?.getAttribute('href') ?? '/';
const basename = baseHref === '/' || baseHref === './' ? '/' : new URL(baseHref, window.location.origin).pathname.replace(/\/$/, '');

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}
