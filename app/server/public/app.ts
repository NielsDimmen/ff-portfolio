import { Hono } from 'hono';
import type { AppDatabase } from '../db/client';
import { healthz } from '../health';

/** Public listener (port 8080). No admin routes and no /api. */
export function createPublicApp(db: AppDatabase): Hono {
  const app = new Hono();
  app.get('/healthz', healthz(db));
  return app;
}
