import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { raw } from 'hono/html';
import type { Child } from 'hono/jsx';
import type { HomeBlockKey } from '../db/schema';
import type { ContactLink } from '../lib/contact';
import type { Lang } from '../lib/i18n';
import { imageSources } from '../lib/media';
import { projectPath, projectsPath } from '../lib/paths';
import type { VideoEmbed } from '../lib/video';
import type { BackgroundPhoto, Cover, HomeContent, ProjectCard, ProjectDetail, ProjectIndex, Shell } from './content';

const WORDMARK = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../brand/logo/ff-dimmen-woordmerk.svg'),
  'utf8',
);

const THEME_BOOT =
  "(function(){try{var t=localStorage.getItem('ffd-theme');if(t==='papier'||t==='podium')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();";

export function document(page: Child) {
  return (
    <>
      {raw('<!DOCTYPE html>')}
      {page}
    </>
  );
}

type FrameProps = {
  shell: Shell;
  title: string;
  description: string;
  canonicalPath: string;
  alternateNl: string;
  alternateEn: string;
  robots?: string;
  mainClass?: string;
  background?: BackgroundPhoto[];
  children: Child;
};

export function Frame(props: FrameProps) {
  const copy = props.shell.copy;
  const canonical = absolute(props.shell.origin, props.canonicalPath);
  return (
    <html lang={props.shell.lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{props.title}</title>
        <meta name="description" content={props.description} />
        <meta name="theme-color" content="#0b0b0a" />
        {props.robots ? <meta name="robots" content={props.robots} /> : null}
        <link rel="icon" href="/brand/logo/favicon.svg" type="image/svg+xml" />
        <link rel="canonical" href={canonical} />
        <link rel="alternate" hreflang="nl" href={absolute(props.shell.origin, props.alternateNl)} />
        <link rel="alternate" hreflang="en" href={absolute(props.shell.origin, props.alternateEn)} />
        <link rel="alternate" hreflang="x-default" href={absolute(props.shell.origin, props.alternateNl)} />
        <meta property="og:title" content={props.title} />
        <meta property="og:description" content={props.description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content={props.shell.siteName} />
        <meta property="og:locale" content={props.shell.lang === 'nl' ? 'nl_NL' : 'en_US'} />
        <meta property="og:locale:alternate" content={props.shell.lang === 'nl' ? 'en_US' : 'nl_NL'} />
        {props.shell.ogImage ? <meta property="og:image" content={absolute(props.shell.origin, props.shell.ogImage)} /> : null}
        {props.background?.[0] ? <link rel="preload" as="image" href={`/media/${props.background[0].id}/1600.webp`} /> : null}
        <link rel="stylesheet" href="/brand/ff-dimmen.css" />
        <link rel="stylesheet" href="/assets/site.css" />
        <script>{raw(THEME_BOOT)}</script>
      </head>
      <body>
        {props.background?.length ? <Backdrop lang={props.shell.lang} photos={props.background} /> : null}
        <a class="skip" href="#content">
          {copy.skip}
        </a>
        <button
          type="button"
          class="menu-btn"
          data-menu-toggle
          aria-expanded="false"
          aria-controls="menu"
          aria-label={copy.menuOpen}
          data-open-label={copy.menuOpen}
          data-close-label={copy.menuClose}
        >
          <span />
          <span />
          <span />
        </button>
        <div class="menu" id="menu" role="dialog" aria-modal="true" aria-label={copy.menu}>
          <SiteNav shell={props.shell} />
          <div class="lang" role="group" aria-label={props.shell.lang === 'en' ? 'Language' : 'Taal'}>
            <LangLink lang="nl" current={props.shell.lang} href={switchHref('nl', props.alternateNl)} />
            <span aria-hidden="true">|</span>
            <LangLink lang="en" current={props.shell.lang} href={switchHref('en', props.alternateEn)} />
          </div>
          <button type="button" class="ffd-btn ffd-btn--ghost" data-theme-toggle>
            <span class="when-podium">{copy.light}</span>
            <span class="when-papier">{copy.dark}</span>
          </button>
        </div>
        <main id="content" class={props.mainClass}>
          {props.children}
        </main>
        <footer>
          <p>
            © {props.shell.year} {props.shell.siteName}
          </p>
        </footer>
        <script src="/brand/motion.js" defer></script>
        <script src="/assets/theme.js" defer></script>
      </body>
    </html>
  );
}

function logo(className: string) {
  return raw(WORDMARK.replace('class="ffd-logo"', `class="${className}"`));
}

function Backdrop(props: { lang: Shell['lang']; photos: BackgroundPhoto[] }) {
  return (
    <>
      <div class="bg" aria-hidden="true">
        <div class="slides">
          {props.photos.map((photo, index) => (
            <img
              class={index === 0 ? 'on' : undefined}
              alt=""
              src={`/media/${photo.id}/1600.webp`}
              style={`object-position: ${focal(photo.focalX)} ${focal(photo.focalY)}`}
            />
          ))}
        </div>
      </div>
      <div class="bg-caps">
        {props.photos.map((photo, index) => {
          const meta = captionMeta(photo);
          const credit = photoCredit(props.lang, photo.photographer);
          return (
            <p class={index === 0 ? 'bg-cap on' : 'bg-cap'} aria-hidden={index === 0 ? undefined : 'true'}>
              {photo.title ? <span class="t-h3">{photo.title}</span> : null}
              {photo.role ? <span class="t-small">{photo.role}</span> : null}
              {meta ? <span class="t-small">{meta}</span> : null}
              {credit ? <span class="t-small">{credit}</span> : null}
            </p>
          );
        })}
      </div>
    </>
  );
}

function captionMeta(photo: BackgroundPhoto): string {
  return [photo.client, photo.location, photo.year ? String(photo.year) : ''].filter((part) => part.length > 0).join(' · ');
}

function photoCredit(lang: Shell['lang'], name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return lang === 'en' ? `Photo ${trimmed}` : `Foto ${trimmed}`;
}

function SiteNav(props: { shell: Shell }) {
  return (
    <nav aria-label={props.shell.lang === 'en' ? 'Navigation' : 'Navigatie'}>
      <ul>
        {props.shell.nav.map((item) => (
          <li key={item.href}>
            <a class="t-h2" href={item.href} aria-current={item.current ? 'page' : undefined}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function LangLink(props: { lang: Lang; current: Lang; href: string }) {
  const label = props.lang === 'nl' ? 'NL' : 'EN';
  if (props.current === props.lang) return <span aria-current="true">{label}</span>;
  return (
    <a href={props.href} hreflang={props.lang} lang={props.lang}>
      {label}
    </a>
  );
}

export function HomePage(props: { shell: Shell; content: HomeContent }) {
  const blocks = props.content.blocks;
  const show = (key: HomeBlockKey) => blocks.includes(key);
  return document(
    <Frame
      shell={props.shell}
      title={props.shell.siteName}
      description={props.content.description || props.shell.tagline}
      canonicalPath={props.shell.lang === 'en' ? '/en' : '/'}
      alternateNl="/"
      alternateEn="/en"
      mainClass="home"
      background={props.content.background}
    >
      <div class="stage">
        {show('hero') ? <Hero shell={props.shell} /> : null}
        {show('contact') ? <Contact shell={props.shell} links={props.content.contact} /> : null}
      </div>
      {show('intro') && props.content.introHtml ? (
        <section class="band prose" data-dim-in>
          {raw(props.content.introHtml)}
        </section>
      ) : null}
      {show('featured') && props.content.featured.length ? (
        <section class="band" data-dim-in>
          <p class="t-label band-label">{props.shell.copy.projects}</p>
          <ProjectGrid lang={props.shell.lang} projects={props.content.featured} linked={!props.shell.landingOnly} />
        </section>
      ) : null}
    </Frame>,
  );
}

export function ProjectsPage(props: { shell: Shell; index: ProjectIndex }) {
  const copy = props.shell.copy;
  const canonical = projectsPath(props.shell.lang, props.index.tags.find((tag) => tag.current)?.slug);
  return document(
    <Frame
      shell={props.shell}
      title={documentTitle(copy.projects, props.shell.siteName)}
      description={props.shell.tagline}
      canonicalPath={canonical}
      alternateNl={projectsPath('nl', props.index.tags.find((tag) => tag.current)?.slug)}
      alternateEn={projectsPath('en', props.index.tags.find((tag) => tag.current)?.slug)}
    >
      <PageHeading title={copy.projects} />
      {props.index.tags.length ? (
        <nav class="ffd-tags" aria-label={copy.tags}>
          <a class="ffd-tag" href={projectsPath(props.shell.lang)} aria-current={props.index.tags.some((tag) => tag.current) ? undefined : 'true'}>
            {copy.allTags}
          </a>
          {props.index.tags.map((tag) => (
            <a class="ffd-tag" key={tag.slug} href={projectsPath(props.shell.lang, tag.slug)} aria-current={tag.current ? 'true' : undefined}>
              {tag.name}
            </a>
          ))}
        </nav>
      ) : null}
      {props.index.projects.length ? (
        <ProjectGrid lang={props.shell.lang} projects={props.index.projects} />
      ) : (
        <p class="empty">{copy.emptyProjects}</p>
      )}
    </Frame>,
  );
}

export function ProjectPage(props: { shell: Shell; project: ProjectDetail; slug: string }) {
  return document(
    <Frame
      shell={props.shell}
      title={documentTitle(props.project.title, props.shell.siteName)}
      description={props.project.description || props.shell.tagline}
      canonicalPath={projectPath(props.shell.lang, props.slug)}
      alternateNl={projectPath('nl', props.slug)}
      alternateEn={projectPath('en', props.slug)}
    >
      <article class="project-page">
        <header class="page-head">
          <a class="ffd-btn ffd-btn--quiet back" href={projectsPath(props.shell.lang)}>{`← ${props.shell.copy.projects}`}</a>
          <h1 class="t-h1">{props.project.title}</h1>
          <Facts shell={props.shell} facts={props.project.facts} />
          {props.project.tags.length ? (
            <p class="ffd-tags">
              {props.project.tags.map((tag) => (
                <a class="ffd-tag" key={tag.href} href={tag.href}>
                  {tag.name}
                </a>
              ))}
            </p>
          ) : null}
        </header>
        {props.project.cover ? (
          <div class="cover-block">
            <div class="cover-frame">
              <Picture cover={props.project.cover} sizes="(min-width: 70rem) 68rem, 100vw" priority />
            </div>
            {photoCredit(props.shell.lang, props.project.coverPhotographer) ? (
              <p class="t-small credit">{photoCredit(props.shell.lang, props.project.coverPhotographer)}</p>
            ) : null}
          </div>
        ) : null}
        {props.project.html ? <div class="prose">{raw(props.project.html)}</div> : null}
        {props.project.video ? <Video video={props.project.video} /> : null}
        {props.project.gallery.length ? (
          <ul class="gallery">
            {props.project.gallery.map((item) => (
              <li key={item.cover.id}>
                <figure>
                  <Picture cover={item.cover} sizes="(min-width: 70rem) 68rem, 100vw" />
                  {item.caption || item.photographer ? (
                    <figcaption>
                      {item.caption ? <span>{item.caption}</span> : null}
                      {photoCredit(props.shell.lang, item.photographer) ? (
                        <span class="t-small">{photoCredit(props.shell.lang, item.photographer)}</span>
                      ) : null}
                    </figcaption>
                  ) : null}
                </figure>
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    </Frame>,
  );
}

export function TextPage(props: {
  shell: Shell;
  title: string;
  html: string;
  description: string;
  canonicalPath: string;
  alternateNl: string;
  alternateEn: string;
}) {
  return document(
    <Frame
      shell={props.shell}
      title={documentTitle(props.title, props.shell.siteName)}
      description={props.description || props.shell.tagline}
      canonicalPath={props.canonicalPath}
      alternateNl={props.alternateNl}
      alternateEn={props.alternateEn}
    >
      <PageHeading title={props.title} />
      {props.html ? <div class="prose">{raw(props.html)}</div> : null}
    </Frame>,
  );
}

export function NotFoundPage(props: { shell: Shell; path: string }) {
  const copy = props.shell.copy;
  const enPath = props.path.startsWith('/en') ? props.path : props.path === '/' ? '/en' : `/en${props.path}`;
  const nlPath = props.path.startsWith('/en/') ? props.path.slice(3) : props.path === '/en' ? '/' : props.path;
  return document(
    <Frame
      shell={props.shell}
      title={documentTitle(copy.notFound, props.shell.siteName)}
      description={props.shell.tagline}
      canonicalPath={props.path}
      alternateNl={nlPath || '/'}
      alternateEn={enPath}
      robots="noindex"
    >
      <PageHeading title={copy.notFound} />
    </Frame>,
  );
}

function Hero(props: { shell: Shell }) {
  return (
    <header class="hero">
      <h1 class="logo-title">{logo('ffd-logo ffd-logo--dim-up')}</h1>
      {props.shell.tagline ? <p class="t-lead">{props.shell.tagline}</p> : null}
    </header>
  );
}

function PageHeading(props: { title: string }) {
  return (
    <header class="page-head">
      <h1 class="t-h1">{props.title}</h1>
    </header>
  );
}

function Facts(props: { shell: Shell; facts: ProjectDetail['facts'] }) {
  const copy = props.shell.copy;
  const rows = [
    [copy.client, props.facts.client],
    [copy.location, props.facts.location],
    [copy.period, props.facts.period],
    [copy.role, props.facts.role],
  ].filter((row) => row[1]);
  if (!rows.length) return null;
  return (
    <dl class="ffd-facts">
      {rows.map((row) => (
        <div key={row[0]}>
          <dt>{row[0]}</dt>
          <dd>{row[1]}</dd>
        </div>
      ))}
    </dl>
  );
}

function Contact(props: { shell: Shell; links: ContactLink[] }) {
  const save = props.links.find((link) => link.kind === 'save');
  const rest = props.links.filter((link) => link.kind !== 'save');
  if (!save && rest.length === 0) return null;
  return (
    <section class="ffd-contact home-contact" aria-label={props.shell.copy.contact}>
      {rest.length ? (
        <ul class="ffd-contact__list">
          {rest.map((link) => (
            <li key={link.href}>
              <ContactAnchor link={link}>{link.label}</ContactAnchor>
            </li>
          ))}
        </ul>
      ) : null}
      {save ? <ContactAnchor link={save} className="ffd-btn ffd-btn--quiet">{`${save.label} →`}</ContactAnchor> : null}
    </section>
  );
}

function ContactAnchor(props: { link: ContactLink; className?: string; children: Child }) {
  const external = /^https?:/i.test(props.link.href);
  return (
    <a class={props.className} href={props.link.href} download={props.link.downloadName} rel={props.link.rel} target={external ? '_blank' : undefined}>
      {props.children}
    </a>
  );
}

function ProjectGrid(props: { lang: Lang; projects: ProjectCard[]; linked?: boolean }) {
  const linked = props.linked !== false;
  return (
    <ul class="grid">
      {props.projects.map((project) => {
        const meta = [project.client.trim(), project.location.trim(), project.year ? String(project.year) : ''].filter(Boolean);
        const body = (
          <>
            <div class="ffd-card__img">
              <Picture cover={project.cover} sizes="(min-width: 700px) 34rem, 100vw" />
            </div>
            <div>
              <h2 class="ffd-card__title">{project.title}</h2>
              {meta.length ? <p class="ffd-card__meta">{meta.join(' · ')}</p> : null}
            </div>
          </>
        );
        return (
          <li key={project.slug}>
            {linked ? (
              <a class="ffd-card" href={projectPath(props.lang, project.slug)}>
                {body}
              </a>
            ) : (
              <div class="ffd-card">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Picture(props: { cover: Cover | null; sizes: string; priority?: boolean; imgClass?: string }) {
  if (!props.cover) return null;
  const sources = imageSources(props.cover.id);
  return (
    <picture>
      <source type="image/avif" srcset={sources.avif} sizes={props.sizes} />
      <source type="image/webp" srcset={sources.webp} sizes={props.sizes} />
      <img
        class={props.imgClass ?? 'cover'}
        src={sources.jpg}
        alt={props.cover.alt}
        width={props.cover.width ?? undefined}
        height={props.cover.height ?? undefined}
        style={`object-position: ${focal(props.cover.focalX)} ${focal(props.cover.focalY)}`}
        loading={props.priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    </picture>
  );
}


function Video(props: { video: VideoEmbed }) {
  if (props.video.kind === 'file') {
    return (
      <div class="video">
        <video controls preload="metadata" src={props.video.src} />
      </div>
    );
  }
  return (
    <div class="video">
      <iframe
        src={props.video.src}
        title={props.video.title}
        loading="lazy"
        allow="fullscreen; picture-in-picture"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      />
    </div>
  );
}

function switchHref(lang: Lang, nextPath: string): string {
  return `/lang/${lang}?next=${encodeURIComponent(nextPath)}`;
}

function absolute(origin: string, path: string): string {
  return new URL(path, origin).href;
}

function documentTitle(title: string, siteName: string): string {
  if (!title || title === siteName) return siteName;
  return `${title} — ${siteName}`;
}

function focal(value: number): string {
  if (!Number.isFinite(value)) return '50%';
  const percent = Math.min(100, Math.max(0, Math.round(value * 1000) / 10));
  return `${percent}%`;
}
