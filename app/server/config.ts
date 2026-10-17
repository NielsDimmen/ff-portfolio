export type Config = {
  dataDir: string;
  publicPort: number;
  adminPort: number;
  /** When true, the ingress IP check is skipped. Never enable this in production. */
  devSkipIngressCheck: boolean;
  maxUploadMb: number;
  /** Public site origin for links in the CMS. Empty uses the request hostname and the public port. */
  siteUrl: string;
};

function readUploadMb(): number {
  const raw = process.env.MAX_UPLOAD_MB;
  if (!raw) return 50;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 5 || value > 500) {
    throw new Error('MAX_UPLOAD_MB must be an integer from 5 to 500');
  }
  return value;
}

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
    maxUploadMb: readUploadMb(),
    siteUrl: (process.env.SITE_URL ?? '').replace(/\/$/, ''),
  };

  if (config.publicPort === config.adminPort) {
    throw new Error('PUBLIC_PORT and ADMIN_PORT must be different');
  }

  return config;
}
