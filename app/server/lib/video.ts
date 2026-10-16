export type VideoEmbed = { kind: 'iframe' | 'file'; src: string; title: string };

const YOUTUBE_ID = /^[\w-]{11}$/;

export function parseVideo(input: string | null, title: string): VideoEmbed | null {
  if (!input?.trim()) return null;
  const value = input.trim();

  if (value.startsWith('/media/') && value.endsWith('.mp4') && !value.includes('..') && !value.includes('\\')) {
    return { kind: 'file', src: value, title };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    return YOUTUBE_ID.test(id) ? youtube(id, title) : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
    const fromQuery = url.searchParams.get('v') ?? '';
    const fromPath = url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1] ?? '';
    const id = YOUTUBE_ID.test(fromQuery) ? fromQuery : fromPath;
    return YOUTUBE_ID.test(id) ? youtube(id, title) : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = url.pathname.match(/\/(?:video\/)?(\d+)/)?.[1] ?? '';
    if (!id) return null;
    return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}?dnt=1`, title };
  }
  return null;
}

function youtube(id: string, title: string): VideoEmbed {
  return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}`, title };
}
