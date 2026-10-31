import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const DATA = process.env.HA_DATA || '/data';
const APP_PORT = Number(process.env.APP_PORT || 8081);
const PUBLIC_PORT = Number(process.env.PUBLIC_PORT || 8080);
const CONTROL_PORT = Number(process.env.CONTROL_PORT || 9099);
const PID_FILE = process.env.APP_PID_FILE || '/tmp/ff-portfolio.pid';
const MAX_APP = 1200 * 1024 * 1024;
const MAX_CONTENT = 500 * 1024 * 1024;

function token() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA, 'options.json'), 'utf8'));
    const value = String(data.admin_token || '').trim();
    if (value) return value;
  } catch {
    // options appear after the add-on starts
  }
  return String(process.env.ADMIN_TOKEN || '').trim();
}

function authorized(req) {
  const expected = token();
  if (!expected || expected === 'change-me-now') return false;
  return req.headers.authorization === `Bearer ${expected}`;
}

function sendJson(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(raw) });
  res.end(raw);
}

function hasApp() {
  return fs.existsSync(path.join(DATA, 'app', 'app', 'server', 'index.ts'));
}

function hasContent() {
  return fs.existsSync(path.join(DATA, 'db.sqlite'));
}

function restartApp() {
  let pid = 0;
  try {
    pid = Number(fs.readFileSync(PID_FILE, 'utf8'));
  } catch {
    return;
  }
  if (!pid) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // already gone; the run loop starts it again
  }
}

function saveBody(req, dest, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const out = fs.createWriteStream(dest);
    const finish = (error, bytes) => {
      if (settled) return;
      settled = true;
      if (error) {
        out.destroy();
        fs.rmSync(dest, { force: true });
        reject(error);
        return;
      }
      resolve(bytes);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max) {
        const error = new Error('te groot');
        error.status = 413;
        finish(error);
        req.destroy();
        return;
      }
      if (!out.write(chunk)) req.pause();
    });
    out.on('drain', () => req.resume());
    req.on('end', () => out.end(() => finish(null, size)));
    req.on('error', finish);
    out.on('error', finish);
  });
}

function isGzip(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(2);
  fs.readSync(fd, buf, 0, 2, 0);
  fs.closeSync(fd);
  return buf[0] === 0x1f && buf[1] === 0x8b;
}

function extractTar(file, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const args = isGzip(file) ? ['-xzf', file, '-C', dest] : ['-xf', file, '-C', dest];
  return new Promise((resolve, reject) => {
    const child = spawn('tar', args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar stopte met ${code}`))));
  });
}

async function deployApp(upload) {
  const tmp = path.join(DATA, 'app.tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  await extractTar(upload, tmp);
  if (!fs.existsSync(path.join(tmp, 'app', 'server', 'index.ts'))) {
    fs.rmSync(tmp, { recursive: true, force: true });
    const error = new Error('bundle mist app/server/index.ts');
    error.status = 400;
    throw error;
  }
  const current = path.join(DATA, 'app');
  const prev = path.join(DATA, 'app.prev');
  fs.rmSync(prev, { recursive: true, force: true });
  if (fs.existsSync(current)) fs.renameSync(current, prev);
  fs.renameSync(tmp, current);
  restartApp();
}

async function deployContent(upload) {
  const incoming = path.join(DATA, 'incoming');
  fs.rmSync(incoming, { recursive: true, force: true });
  await extractTar(upload, incoming);
  if (!fs.existsSync(path.join(incoming, 'db.sqlite'))) {
    fs.rmSync(incoming, { recursive: true, force: true });
    const error = new Error('content mist db.sqlite');
    error.status = 400;
    throw error;
  }
  restartApp();
  await new Promise((resolve) => setTimeout(resolve, 700));
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(path.join(DATA, `db.sqlite${suffix}`), { force: true });
  }
  fs.renameSync(path.join(incoming, 'db.sqlite'), path.join(DATA, 'db.sqlite'));
  if (fs.existsSync(path.join(incoming, 'media'))) {
    const previous = path.join(DATA, 'media.prev');
    fs.rmSync(previous, { recursive: true, force: true });
    if (fs.existsSync(path.join(DATA, 'media'))) fs.renameSync(path.join(DATA, 'media'), previous);
    fs.renameSync(path.join(incoming, 'media'), path.join(DATA, 'media'));
    fs.rmSync(previous, { recursive: true, force: true });
  }
  fs.rmSync(incoming, { recursive: true, force: true });
}

function proxy(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${APP_PORT}` };
  delete headers['transfer-encoding'];
  const upstream = http.request(
    { hostname: '127.0.0.1', port: APP_PORT, path: req.url, method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) sendJson(res, 502, { ok: false, error: 'de site start nog' });
    else res.end();
  });
  req.pipe(upstream);
}

async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const route = url.pathname;

  if (req.method === 'GET' && (route === '/v1/health' || route === '/_ha/health')) {
    sendJson(res, 200, { ok: true, service: 'ff-portfolio-gateway' });
    return;
  }

  if (req.method === 'GET' && route === '/v1/admin/status') {
    if (!authorized(req)) {
      sendJson(res, 403, { ok: false, error: 'token klopt niet' });
      return;
    }
    sendJson(res, 200, { ok: true, service: 'ff-portfolio-gateway', hasApp: hasApp(), hasContent: hasContent() });
    return;
  }

  const deploying = req.method === 'POST' && (route === '/v1/admin/deploy' || route === '/_ha/deploy');
  const content = req.method === 'POST' && (route === '/v1/admin/content' || route === '/_ha/content');
  if (deploying || content) {
    if (!authorized(req)) {
      sendJson(res, 403, { ok: false, error: 'token klopt niet' });
      return;
    }
    const upload = path.join(DATA, deploying ? 'deploy.tar' : 'content.tar');
    try {
      const size = await saveBody(req, upload, deploying ? MAX_APP : MAX_CONTENT);
      if (deploying) await deployApp(upload);
      else await deployContent(upload);
      fs.rmSync(upload, { force: true });
      sendJson(res, 200, { ok: true, bytes: size });
    } catch (error) {
      fs.rmSync(upload, { force: true });
      const status = error && error.status ? error.status : 500;
      sendJson(res, status, { ok: false, error: error instanceof Error ? error.message : 'mislukt' });
    }
    return;
  }

  proxy(req, res);
}

function listen(port, name) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(`[portfolio-gateway] ${name}`, error);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'mislukt' });
    });
  });
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.listen(port, '0.0.0.0', () => {
    console.log(`[portfolio-gateway] ${name} on ${port}`);
  });
}

listen(PUBLIC_PORT, 'public');
listen(CONTROL_PORT, 'control');
