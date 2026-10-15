import { Hono } from 'hono';
import type { AppDatabase } from '../db/client';
import { healthz } from '../health';

/**
 * Ingress listener (port 8099). Admin API and the CMS SPA will mount here.
 * This app is never attached to the public listener.
 */
export function createAdminApp(db: AppDatabase): Hono {
  const app = new Hono();
  app.get('/healthz', healthz(db));
  return app;
}
