import type { Lang } from './i18n';

export function homePath(lang: Lang): string {
  return lang === 'en' ? '/en' : '/';
}

export function projectsPath(lang: Lang, tag?: string): string {
  const base = lang === 'en' ? '/en/projects' : '/projecten';
  return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base;
}

export function projectPath(lang: Lang, slug: string): string {
  return lang === 'en' ? `/en/projects/${slug}` : `/projecten/${slug}`;
}

export function pagePath(lang: Lang, slug: string): string {
  if (slug === 'home') return homePath(lang);
  if (slug === 'over') return lang === 'en' ? '/en/about' : '/over';
  return lang === 'en' ? `/en/${slug}` : `/${slug}`;
}

export function requestOrigin(requestUrl: string, forwardedProto?: string, forwardedHost?: string): string {
  const parsed = new URL(requestUrl);
  const proto = forwardedProto?.split(',')[0]?.trim() || parsed.protocol.replace(/:$/, '');
  const host = forwardedHost?.split(',')[0]?.trim() || parsed.host;
  if ((proto !== 'http' && proto !== 'https') || !/^[\w.-]+(?::\d+)?$/.test(host)) {
    return parsed.origin;
  }
  return `${proto}://${host}`;
}

/** Local path only, so the language redirect cannot leave the site. */
export function safeLocalPath(input: string | undefined, fallback: string): string {
  if (!input) return fallback;
  if (!input.startsWith('/') || input.startsWith('//')) return fallback;
  if (/[\r\n\\]/.test(input)) return fallback;
  return input;
}
