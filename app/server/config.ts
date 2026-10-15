export type Config = {
  dataDir: string;
  publicPort: number;
  adminPort: number;
  /** When true, the ingress IP check is skipped. Never enable this in production. */
  devSkipIngressCheck: boolean;
};

function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a TCP port, got ${raw}`);
  }
  return port;
}

export function loadConfig(): Config {
  const config: Config = {
    dataDir: process.env.DATA_DIR || './.data',
    publicPort: readPort('PUBLIC_PORT', 8080),
    adminPort: readPort('ADMIN_PORT', 8099),
    devSkipIngressCheck: process.env.DEV_SKIP_INGRESS_CHECK === 'true',
  };

  if (config.publicPort === config.adminPort) {
    throw new Error('PUBLIC_PORT and ADMIN_PORT must be different');
  }

  return config;
}
