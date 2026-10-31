import { serve, type ServerType } from '@hono/node-server';
import type { Hono } from 'hono';
import { loadConfig } from './config';
import { createAdminApp } from './api/app';
import { openDatabase } from './db/client';
import { createPublicApp } from './public/app';

const config = loadConfig();

if (config.devSkipIngressCheck) {
  console.warn('');
  console.warn('============================================================');
  console.warn('WARNING: DEV_SKIP_INGRESS_CHECK is enabled.');
  console.warn('The admin ingress check is bypassed. Never use this in production.');
  console.warn('============================================================');
  console.warn('');
}

const db = openDatabase(config);
const servers: ServerType[] = [
  listen(createPublicApp(db, config.dataDir, config.siteScope === 'landing'), config.publicPort, 'public'),
  listen(createAdminApp(db, config), config.adminPort, 'admin'),
];

function listen(app: Hono, port: number, name: string): ServerType {
  const server = serve(
    { fetch: app.fetch, hostname: '0.0.0.0', port },
    (info) => {
      console.log(`[portfolio] ${name} listening on http://127.0.0.1:${info.port}`);
    },
  );
  server.on('error', (error) => {
    console.error(`[portfolio] ${name} failed to listen on port ${port}`, error);
    process.exit(1);
  });
  return server;
}

function shutdown(signal: string): void {
  console.log(`[portfolio] ${signal}, closing`);
  for (const server of servers) server.close();
  db.$client.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
