import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { etag } from 'hono/etag';
import type { Context } from 'hono';
import type { AppDatabase } from '../db/client';
import { healthz } from '../health';
import { isLang, type Lang } from '../lib/i18n';
import { homePath, pagePath, requestOrigin, safeLocalPath } from '../lib/paths';
import { renderRobots, renderSitemap } from '../lib/sitemap';
import { renderVcard, vcardFilename } from '../lib/vcf';
import { sendMediaFile } from '../media/files';
import {
  loadHome,
  loadPage,
  loadProject,
  loadProjectIndex,
  loadShell,
  loadSitemap,
  requireSettings,
} from './content';
import { HomePage, NotFoundPage, ProjectPage, ProjectsPage, TextPage } from './view';

const assetsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public-assets');
const brandRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../brand');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Public listener (port 8080). No admin routes and no /api. */
export function createPublicApp(db: AppDatabase, dataDir: string, landingOnly = false): Hono {
  const app = new Hono();

  app.use('*', etag());
  app.use(
    '/brand/*',
    serveStatic({
      root: brandRoot,
      rewriteRequestPath: (requestPath) => requestPath.replace(/^\/brand\//, ''),
      onFound: (_file, c) => {
        c.header('Cache-Control', process.env.NODE_ENV === 'production' ? 'public, max-age=86400' : 'no-cache');
      },
    }),
  );
  app.use(
    '/assets/*',
    serveStatic({
      root: assetsRoot,
      rewriteRequestPath: (requestPath) => requestPath.replace(/^\/assets\//, ''),
      onFound: (_file, c) => {
        c.header('Cache-Control', process.env.NODE_ENV === 'production' ? 'public, max-age=86400' : 'no-cache');
      },
    }),
  );

  app.get('/healthz', healthz(db));
  app.get('/media/:id/:file', (c) => sendMediaFile(c, dataDir));

  app.get('/robots.txt', (c) => {
    c.header('Content-Type', 'text/plain; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=300');
    return c.body(renderRobots(originOf(c)));
  });

  app.get('/sitemap.xml', (c) => {
    c.header('Content-Type', 'application/xml; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=300');
    const entries = landingOnly ? [{ nl: '/', en: '/en' }] : loadSitemap(db);
    return c.body(renderSitemap(originOf(c), entries));
  });

  app.get('/contact.vcf', (c) => {
    const settings = requireSettings(db);
    const filename = vcardFilename(settings.siteName);
    c.header('Content-Type', 'text/vcard; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    c.header('Cache-Control', 'no-cache');
    return c.body(renderVcard(settings));
  });

  app.get('/lang/:code', (c) => {
    const code = c.req.param('code');
    if (!isLang(code)) return c.notFound();
    const next = safeLocalPath(c.req.query('next'), homePath(code));
    rememberLang(c, code);
    c.header('Cache-Control', 'no-store');
    return c.redirect(next, 302);
  });

  app.get('/', (c) => {
    if (getCookie(c, 'lang') === 'en') {
      c.header('Cache-Control', 'no-store');
      return c.redirect('/en', 302);
    }
    return renderHome(c, db, dataDir, 'nl');
  });

  app.get('/en', (c) => renderHome(c, db, dataDir, 'en'));
  if (landingOnly) {
    app.get('/en/*', (c) => c.redirect('/en', 302));
    app.get('/*', (c) => c.redirect('/', 302));
    return finish(app);
  }
  app.get('/projecten', (c) => renderProjects(c, db, dataDir, 'nl'));
  app.get('/en/projects', (c) => renderProjects(c, db, dataDir, 'en'));
  app.get('/projecten/:slug', (c) => renderProject(c, db, dataDir, 'nl'));
  app.get('/en/projects/:slug', (c) => renderProject(c, db, dataDir, 'en'));
  app.get('/over', (c) => renderCmsPage(c, db, dataDir, 'nl', 'over'));
  app.get('/en/about', (c) => renderCmsPage(c, db, dataDir, 'en', 'over'));
  app.get('/en/over', (c) => c.redirect('/en/about', 301));
  app.get('/:slug', (c) => renderCmsPage(c, db, dataDir, 'nl', c.req.param('slug')));
  app.get('/en/:slug', (c) => renderCmsPage(c, db, dataDir, 'en', c.req.param('slug')));

  return finish(app);

  function finish(appToFinish: Hono): Hono {
    appToFinish.notFound((c) => renderNotFound(c, db, dataDir));
    appToFinish.onError((error, c) => {
      console.error('[portfolio] public error', error);
      return c.text('Er ging iets mis.', 500);
    });
    return appToFinish;
  }
}

function renderHome(c: Context, db: AppDatabase, dataDir: string, lang: Lang) {
  rememberLang(c, lang);
  const shell = loadShell(db, dataDir, lang, homePath(lang), originOf(c));
  const content = loadHome(db, dataDir, lang);
  return sendHtml(c, <HomePage shell={shell} content={content} />);
}

function renderProjects(c: Context, db: AppDatabase, dataDir: string, lang: Lang) {
  rememberLang(c, lang);
  const pathname = new URL(c.req.url).pathname;
  const shell = loadShell(db, dataDir, lang, pathname, originOf(c));
  const index = loadProjectIndex(db, dataDir, lang, c.req.query('tag'));
  return sendHtml(c, <ProjectsPage shell={shell} index={index} />);
}

function renderProject(c: Context, db: AppDatabase, dataDir: string, lang: Lang) {
  const slug = c.req.param('slug');
  if (!slug || !SLUG.test(slug)) return renderNotFound(c, db, dataDir);
  const project = loadProject(db, dataDir, lang, slug);
  if (!project) return renderNotFound(c, db, dataDir);
  rememberLang(c, lang);
  const pathname = new URL(c.req.url).pathname;
  const shell = loadShell(db, dataDir, lang, pathname, originOf(c));
  return sendHtml(c, <ProjectPage shell={shell} project={project} slug={slug} />);
}

function renderCmsPage(c: Context, db: AppDatabase, dataDir: string, lang: Lang, slug: string) {
  if (!SLUG.test(slug)) return renderNotFound(c, db, dataDir);
  if (slug === 'home') return c.redirect(homePath(lang), 301);
  if (lang === 'nl' && slug === 'about') return c.redirect('/over', 301);
  const page = loadPage(db, lang, slug);
  if (!page) return renderNotFound(c, db, dataDir);
  rememberLang(c, lang);
  const pathname = new URL(c.req.url).pathname;
  const shell = loadShell(db, dataDir, lang, pathname, originOf(c));
  return sendHtml(
    c,
    <TextPage
      shell={shell}
      title={page.title}
      html={page.html}
      description={page.description}
      canonicalPath={pagePath(lang, slug)}
      alternateNl={pagePath('nl', slug)}
      alternateEn={pagePath('en', slug)}
    />,
  );
}

function renderNotFound(c: Context, db: AppDatabase, dataDir: string) {
  const pathname = new URL(c.req.url).pathname;
  const lang: Lang = pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'nl';
  try {
    const shell = loadShell(db, dataDir, lang, pathname, originOf(c));
    return sendHtml(c, <NotFoundPage shell={shell} path={pathname} />, 404);
  } catch (error) {
    console.error('[portfolio] not found page failed', error);
    return c.text(lang === 'en' ? 'Not found' : 'Niet gevonden', 404);
  }
}

function sendHtml(c: Context, body: unknown, status: 200 | 404 = 200) {
  c.header('Cache-Control', process.env.NODE_ENV === 'production' ? 'private, max-age=60' : 'no-cache');
  c.header('Vary', 'Cookie');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  return c.html(body as never, status);
}

function rememberLang(c: Context, lang: Lang) {
  const forwarded = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const secure = forwarded === 'https' || new URL(c.req.url).protocol === 'https:';
  setCookie(c, 'lang', lang, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    maxAge: 60 * 60 * 24 * 365,
  });
}

function originOf(c: Context): string {
  return requestOrigin(c.req.url, c.req.header('x-forwarded-proto'), c.req.header('x-forwarded-host'));
}
