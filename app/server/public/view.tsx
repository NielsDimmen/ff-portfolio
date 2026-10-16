import { raw } from 'hono/html';
import type { Child } from 'hono/jsx';
import type { HomeBlockKey } from '../db/schema';
import type { ContactLink } from '../lib/contact';
import { ui, type Lang } from '../lib/i18n';
import { imageSources } from '../lib/media';
import { projectPath, projectsPath } from '../lib/paths';
import type { VideoEmbed } from '../lib/video';
import type { Cover, HomeContent, ProjectCard, ProjectDetail, ProjectIndex, Shell } from './content';

const THEME_BOOT =
  "(function(){try{var s=localStorage.getItem('theme');var dark=s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;var t=dark?'dark':'light';document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name=\"theme-color\"]');if(m)m.setAttribute('content',t==='dark'?'#141413':'#f4f4f1');}catch(e){}})();";

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
  children: Child;
};

export function Frame(props: FrameProps) {
  const copy = ui[props.shell.lang];
  const canonical = absolute(props.shell.origin, props.canonicalPath);
  return (
    <html lang={props.shell.lang} style={props.shell.accentColor ? `--accent:${props.shell.accentColor}` : undefined}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{props.title}</title>
        <meta name="description" content={props.description} />
        <meta name="theme-color" content="#f4f4f1" />
        {props.robots ? <meta name="robots" content={props.robots} /> : null}
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
        <link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link rel="stylesheet" href="/assets/site.css" />
        <script>{raw(THEME_BOOT)}</script>
      </head>
      <body>
        <a class="skip" href="#content">
          {copy.skip}
        </a>
        <div class="top">
          <p class="tools">
            <span class="lang">
              <LangLink lang="nl" current={props.shell.lang} href={switchHref('nl', props.alternateNl)} />
              <span aria-hidden="true"> | </span>
              <LangLink lang="en" current={props.shell.lang} href={switchHref('en', props.alternateEn)} />
            </span>
            <button type="button" class="theme" data-theme-toggle>
              <span class="when-light">{copy.dark}</span>
              <span class="when-dark">{copy.light}</span>
            </button>
          </p>
        </div>
        <main id="content">{props.children}</main>
        <footer>
          <p>
            © {props.shell.year} {props.shell.siteName}
          </p>
        </footer>
        <script src="/assets/theme.js" defer></script>
      </body>
    </html>
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
  const heroFirst = blocks[0] === 'hero';
  const rest = heroFirst ? blocks.slice(1) : blocks;
  return document(
    <Frame
      shell={props.shell}
      title={props.shell.siteName}
      description={props.content.description || props.shell.tagline}
      canonicalPath={props.shell.lang === 'en' ? '/en' : '/'}
      alternateNl="/"
      alternateEn="/en"
    >
      {heroFirst ? <Hero shell={props.shell} /> : null}
      {!props.content.hero ? (
        <header class="hero">
          <h1>{props.shell.siteName}</h1>
          {props.shell.tagline ? <p class="tagline">{props.shell.tagline}</p> : null}
        </header>
      ) : null}
      <SiteNav shell={props.shell} />
      {rest.map((key) => (
        <Block key={key} block={key} shell={props.shell} content={props.content} />
      ))}
    </Frame>,
  );
}

function Block(props: { block: HomeBlockKey; shell: Shell; content: HomeContent }) {
  if (props.block === 'hero') return <Hero shell={props.shell} />;
  if (props.block === 'intro') {
    if (!props.content.introHtml) return null;
    return <section class="intro prose">{raw(props.content.introHtml)}</section>;
  }
  if (props.block === 'featured') {
    if (!props.content.featured.length) return null;
    return (
      <section class="featured">
        <h2 class="section-label">{ui[props.shell.lang].projects}</h2>
        <ProjectGrid lang={props.shell.lang} projects={props.content.featured} />
      </section>
    );
  }
  if (!props.content.contact.length) return null;
  return <Contact shell={props.shell} links={props.content.contact} />;
}

export function ProjectsPage(props: { shell: Shell; index: ProjectIndex }) {
  const copy = ui[props.shell.lang];
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
      <PageHeading shell={props.shell} title={copy.projects} />
      {props.index.tags.length ? (
        <nav class="tags" aria-label={copy.tags}>
          <a href={projectsPath(props.shell.lang)} aria-current={props.index.tags.some((tag) => tag.current) ? undefined : 'true'}>
            {copy.allTags}
          </a>
          {props.index.tags.map((tag) => (
            <a key={tag.slug} href={projectsPath(props.shell.lang, tag.slug)} aria-current={tag.current ? 'true' : undefined}>
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
        {props.project.cover ? (
          <Picture cover={props.project.cover} sizes="(min-width: 70rem) 68rem, 100vw" priority />
        ) : null}
        <PageHeading shell={props.shell} title={props.project.title} />
        {props.project.facts.length ? <p class="facts">{props.project.facts.join(' · ')}</p> : null}
        {props.project.tags.length ? (
          <p class="tags">
            {props.project.tags.map((tag) => (
              <a key={tag.href} href={tag.href}>
                {tag.name}
              </a>
            ))}
          </p>
        ) : null}
        {props.project.html ? <div class="prose">{raw(props.project.html)}</div> : null}
        {props.project.video ? <Video video={props.project.video} /> : null}
        {props.project.gallery.length ? (
          <ul class="gallery">
            {props.project.gallery.map((item) => (
              <li key={item.cover.id}>
                <figure>
                  <Picture cover={item.cover} sizes="(min-width: 70rem) 68rem, 100vw" />
                  {item.caption ? <figcaption>{item.caption}</figcaption> : null}
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
      <PageHeading shell={props.shell} title={props.title} />
      {props.html ? <div class="prose">{raw(props.html)}</div> : null}
    </Frame>,
  );
}

export function NotFoundPage(props: { shell: Shell; path: string }) {
  const copy = ui[props.shell.lang];
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
      <PageHeading shell={props.shell} title={copy.notFound} />
    </Frame>,
  );
}

function Hero(props: { shell: Shell }) {
  return (
    <header class="hero">
      {props.shell.logo ? <Picture cover={props.shell.logo} sizes="8rem" priority /> : null}
      <h1>{props.shell.siteName}</h1>
      {props.shell.tagline ? <p class="tagline">{props.shell.tagline}</p> : null}
    </header>
  );
}

function PageHeading(props: { shell: Shell; title: string }) {
  return (
    <header class="page-head">
      <a class="brand" href={props.shell.lang === 'en' ? '/en' : '/'}>
        {props.shell.siteName}
      </a>
      <SiteNav shell={props.shell} />
      <h1>{props.title}</h1>
    </header>
  );
}

function SiteNav(props: { shell: Shell }) {
  return (
    <nav class="nav" aria-label={props.shell.lang === 'en' ? 'Navigation' : 'Navigatie'}>
      {props.shell.nav.map((item) =>
        item.current ? (
          <a key={item.href} href={item.href} aria-current="page">
            {item.label}
          </a>
        ) : (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ),
      )}
    </nav>
  );
}

function Contact(props: { shell: Shell; links: ContactLink[] }) {
  return (
    <section class="contact" aria-label={ui[props.shell.lang].contact}>
      {props.links.map((link) => (
        <a key={link.href} href={link.href} download={link.downloadName} rel={link.rel}>
          {link.label}
        </a>
      ))}
    </section>
  );
}

function ProjectGrid(props: { lang: Lang; projects: ProjectCard[] }) {
  return (
    <ul class="grid">
      {props.projects.map((project) => (
        <li key={project.slug}>
          <a class="project" href={projectPath(props.lang, project.slug)}>
            <Picture cover={project.cover} sizes="(min-width: 700px) 32rem, 100vw" />
            <h2>{project.title}</h2>
            <Meta client={project.client} year={project.year} />
          </a>
        </li>
      ))}
    </ul>
  );
}

function Meta(props: { client: string; year: number | null }) {
  const parts = [props.client.trim(), props.year ? String(props.year) : ''].filter(Boolean);
  if (!parts.length) return null;
  return <p class="meta">{parts.join(' · ')}</p>;
}

function Picture(props: { cover: Cover | null; sizes: string; priority?: boolean }) {
  if (!props.cover) return null;
  const sources = imageSources(props.cover.id);
  return (
    <picture>
      <source type="image/avif" srcset={sources.avif} sizes={props.sizes} />
      <source type="image/webp" srcset={sources.webp} sizes={props.sizes} />
      <img
        class="cover"
        src={sources.jpg}
        alt={props.cover.alt}
        width={props.cover.width ?? undefined}
        height={props.cover.height ?? undefined}
        style={`object-position: ${focal(props.cover.focalX)} ${focal(props.cover.focalY)}`}
        loading={props.priority ? 'eager' : 'lazy'}
        decoding="async"
        data-fade
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
