import fs from 'node:fs';
import path from 'node:path';

const SIZES = [400, 800, 1600, 2400] as const;

export function hasImage(dataDir: string, id: number): boolean {
  return fs.existsSync(path.join(dataDir, 'media', String(id), '800.webp'));
}

export function imageSources(id: number): { avif: string; webp: string; jpg: string } {
  const src = (size: (typeof SIZES)[number], ext: 'avif' | 'webp' | 'jpg') => `/media/${id}/${size}.${ext}`;
  return {
    avif: SIZES.map((size) => `${src(size, 'avif')} ${size}w`).join(', '),
    webp: SIZES.map((size) => `${src(size, 'webp')} ${size}w`).join(', '),
    jpg: src(1600, 'jpg'),
  };
}
