import fs from 'node:fs';
import path from 'node:path';
import type { Context } from 'hono';

const FILE_NAME = /^(?:400|800|1600|2400)\.(?:webp|avif|jpg)$/;

export function sendMediaFile(c: Context, dataDir: string) {
  const id = c.req.param('id') ?? '';
  const file = c.req.param('file') ?? '';
  if (!/^\d+$/.test(id) || !FILE_NAME.test(file)) return c.notFound();

  const mediaRoot = path.resolve(dataDir, 'media');
  const full = path.resolve(mediaRoot, id, file);
  if (!full.startsWith(`${mediaRoot}${path.sep}`)) return c.text('Niet gevonden', 404);
  if (!fs.existsSync(full)) return c.text('Niet gevonden', 404);

  const ext = path.extname(file);
  const type = ext === '.webp' ? 'image/webp' : ext === '.avif' ? 'image/avif' : 'image/jpeg';
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
  return c.body(new Uint8Array(fs.readFileSync(full)), 200, { 'Content-Type': type });
}
