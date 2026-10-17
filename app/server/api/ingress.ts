import { getConnInfo } from '@hono/node-server/conninfo';
import type { MiddlewareHandler } from 'hono';

/** Home Assistant ingress proxy. Anything else is refused, except /healthz. */
const INGRESS_IP = '172.30.32.2';

export function ingressGuard(devSkip: boolean): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.path === '/healthz') return next();
    if (devSkip) return next();

    const address = (getConnInfo(c).remote.address ?? '').replace(/^::ffff:/, '');
    if (address !== INGRESS_IP) {
      console.warn(`[portfolio] rejected admin request from ${address || 'unknown'}`);
      return c.json({ error: 'Geen toegang.' }, 403);
    }
    return next();
  };
}
