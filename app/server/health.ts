import type { Context } from 'hono';
import type { AppDatabase } from './db/client';

export function healthz(db: AppDatabase) {
  return (c: Context) => {
    try {
      const row = db.$client.prepare('select 1 as ok').get() as { ok: number } | undefined;
      if (!row || row.ok !== 1) {
        return c.json({ ok: false }, 503);
      }
      c.header('Cache-Control', 'no-store');
      return c.json({ ok: true });
    } catch (error) {
      console.error('[portfolio] health check failed', error);
      return c.json({ ok: false }, 503);
    }
  };
}
