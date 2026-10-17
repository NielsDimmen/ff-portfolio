import fs from 'node:fs';
import path from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { media } from '../db/schema';

const SIZES = [400, 800, 1600, 2400] as const;

export class UploadError extends Error {}

type StoredImage = { id: number };

export async function storeImage(
  db: AppDatabase,
  dataDir: string,
  bytes: Buffer,
  originalName: string,
): Promise<StoredImage> {
  const kind = detectImage(bytes);
  if (kind === 'heic') {
    throw new UploadError('HEIC wordt niet ondersteund. Exporteer de foto als JPG.');
  }
  if (!kind) {
    throw new UploadError('Gebruik een JPG, PNG, WebP, GIF of AVIF.');
  }

  let image: Sharp;
  try {
    image = sharp(bytes, { failOn: 'error', limitInputPixels: 150_000_000 }).rotate();
  } catch {
    throw new UploadError('Deze afbeelding kan niet gelezen worden.');
  }

  const meta = await image.metadata();
  if (!meta.width || !meta.height) {
    throw new UploadError('Deze afbeelding kan niet gelezen worden.');
  }

  const now = new Date().toISOString();
  const created = db
    .insert(media)
    .values({
      originalFilename: safeOriginalName(originalName),
      mime: mimeFor(kind),
      byteSize: bytes.length,
      width: meta.width,
      height: meta.height,
      altNl: '',
      altEn: '',
      focalX: 0.5,
      focalY: 0.5,
      createdAt: now,
    })
    .returning()
    .get();

  const dir = path.join(dataDir, 'media', String(created.id));
  fs.mkdirSync(dir, { recursive: true });

  try {
    for (const size of SIZES) {
      const resized = () => image.clone().resize({ width: size, withoutEnlargement: true, fit: 'inside' });
      await resized().webp({ quality: 78 }).toFile(path.join(dir, `${size}.webp`));
      await resized().avif({ quality: 45 }).toFile(path.join(dir, `${size}.avif`));
      await resized().jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(dir, `${size}.jpg`));
    }
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    db.delete(media).where(eq(media.id, created.id)).run();
    console.error('[portfolio] image processing failed', error);
    throw new UploadError('De foto kon niet verwerkt worden.');
  }

  return { id: created.id };
}

function detectImage(bytes: Buffer): 'jpeg' | 'png' | 'webp' | 'gif' | 'avif' | 'heic' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  if (bytes.length >= 6) {
    const gif = bytes.subarray(0, 6).toString('ascii');
    if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif';
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (brand.startsWith('hei') || brand === 'mif1' || brand === 'msf1') return 'heic';
  }
  return null;
}

function mimeFor(kind: 'jpeg' | 'png' | 'webp' | 'gif' | 'avif'): string {
  if (kind === 'jpeg') return 'image/jpeg';
  if (kind === 'png') return 'image/png';
  if (kind === 'webp') return 'image/webp';
  if (kind === 'gif') return 'image/gif';
  return 'image/avif';
}

function safeOriginalName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'upload';
  const cleaned = base.replace(/[^\w.\- ]+/g, '').slice(0, 180).trim();
  return cleaned || 'upload';
}
