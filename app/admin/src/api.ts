export class ApiError extends Error {}

export function apiUrl(path: string): string {
  const base = document.querySelector('base')?.getAttribute('href') ?? '/';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return new URL(path.replace(/^\//, ''), new URL(normalized, window.location.origin)).href;
}

export function mediaUrl(id: number, size = 800): string {
  return apiUrl(`media/${id}/${size}.webp`);
}

export function publicProjectUrl(slug: string): string {
  const origin = document.querySelector('meta[name="public-origin"]')?.getAttribute('content') ?? '';
  return `${origin.replace(/\/$/, '')}/projecten/${slug}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });
  if (!response.ok) throw new ApiError(data.error || 'Er ging iets mis.');
  return data;
}

export function uploadFile(
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ id: number; mediaId?: number; focalX?: number; focalY?: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(path));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      let data: { id?: number; mediaId?: number; focalX?: number; focalY?: number; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText) as typeof data;
      } catch {
        reject(new ApiError('Upload mislukt.'));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.id) {
        resolve({ id: data.id, mediaId: data.mediaId, focalX: data.focalX, focalY: data.focalY });
      }
      else reject(new ApiError(data.error || 'Upload mislukt.'));
    };
    xhr.onerror = () => reject(new ApiError('Upload mislukt.'));
    const body = new FormData();
    body.append('file', file);
    xhr.send(body);
  });
}
