import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Config } from '../config';
import type { AppDatabase } from '../db/client';
import { healthz } from '../health';
import { sendMediaFile } from '../media/files';
import { ingressGuard } from './ingress';
import { registerProjectRoutes } from './projects';

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../admin/dist');

/**
 * Ingress listener (port 8099). Admin API and the CMS SPA live here.
 * This app is never attached to the public listener.
 */
export function createAdminApp(db: AppDatabase, config: Config): Hono {
  const app = new Hono();

  app.get('/healthz', healthz(db));
  app.use('*', ingressGuard(config.devSkipIngressCheck));

  const api = new Hono();
  registerProjectRoutes(api, db, {
    dataDir: config.dataDir,
    maxUploadBytes: config.maxUploadMb * 1024 * 1024,
  });
  app.route('/api', api);

  app.get('/media/:id/:file', (c) => sendMediaFile(c, config.dataDir));

  if (fs.existsSync(distDir)) {
    app.use(
      '*',
      serveStatic({
        root: distDir,
        index: '__none__',
        onFound: (file, c) => {
          c.header('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
        },
      }),
    );
  }

  app.notFound((c) => {
    if (c.req.path.startsWith('/api')) return c.json({ error: 'Niet gevonden.' }, 404);
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return c.text('Niet gevonden', 404);
    return c.html(adminHtml(c, config));
  });

  app.onError((error, c) => {
    console.error('[portfolio] admin error', error);
    return c.json({ error: 'Er ging iets mis.' }, 500);
  });

  return app;
}

function adminHtml(c: Context, config: Config): string {
  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return '<!doctype html><meta charset="utf-8"><title>Portfolio CMS</title><p>De beheerpagina is nog niet gebouwd. Draai npm run build:admin.</p>';
  }
  const html = fs.readFileSync(indexPath, 'utf8');
  const base = ingressBase(c.req.header('x-ingress-path'));
  const origin = config.siteUrl || `http://${new URL(c.req.url).hostname}:${config.publicPort}`;
  return html.replace(
    '<head>',
    `<head><base href="${escapeAttr(base)}"><meta name="public-origin" content="${escapeAttr(origin)}">`,
  );
}

function ingressBase(header: string | undefined): string {
  if (!header) return '/';
  const withSlash = header.startsWith('/') ? header : `/${header}`;
  if (!/^\/[A-Za-z0-9/_-]*$/.test(withSlash)) return '/';
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
