import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import {
  HOME_BLOCK_KEYS,
  homeBlocks,
  media,
  pages,
  projectMedia,
  projectTags,
  projects,
  settings,
  tags,
} from '../db/schema';
import type { HomeBlockKey } from '../db/schema';
import { contactLinks, type ContactLink } from '../lib/contact';
import { pickBody, pickText, ui, type Lang } from '../lib/i18n';
import { hasImage } from '../lib/media';
import { homePath, pagePath, projectPath, projectsPath } from '../lib/paths';
import { richTextToHtml } from '../lib/richtext';
import { parseVideo, type VideoEmbed } from '../lib/video';

export type Cover = {
  id: number;
  alt: string;
  width: number | null;
  height: number | null;
  focalX: number;
  focalY: number;
};

export type ProjectCard = {
  slug: string;
  title: string;
  client: string;
  year: number | null;
  cover: Cover | null;
};

export type NavItem = { href: string; label: string; current: boolean };

export type Shell = {
  lang: Lang;
  origin: string;
  siteName: string;
  tagline: string;
  accentColor: string | null;
  nav: NavItem[];
  year: number;
  logo: Cover | null;
  ogImage: string | null;
};

export type HomeContent = {
  hero: boolean;
  blocks: HomeBlockKey[];
  introHtml: string;
  featured: ProjectCard[];
  contact: ContactLink[];
  description: string;
};

export type ProjectIndex = {
  tags: { slug: string; name: string; current: boolean }[];
  projects: ProjectCard[];
};

export type ProjectDetail = {
  title: string;
  description: string;
  facts: string[];
  html: string;
  tags: { href: string; name: string }[];
  cover: Cover | null;
  gallery: { cover: Cover; caption: string }[];
  video: VideoEmbed | null;
};

type ProjectRow = typeof projects.$inferSelect;
type MediaRow = typeof media.$inferSelect;

export function loadShell(db: AppDatabase, dataDir: string, lang: Lang, pathname: string, origin: string): Shell {
  const settings = requireSettings(db);
  const navPages = db
    .select()
    .from(pages)
    .where(and(eq(pages.published, true), eq(pages.showInNav, true)))
    .orderBy(asc(pages.navOrder), asc(pages.id))
    .all();

  const homePage = navPages.find((page) => page.slug === 'home');
  const items: { href: string; label: string; current: (path: string) => boolean }[] = [
    {
      href: homePath(lang),
      label: homePage ? pickText(lang, homePage.titleNl, homePage.titleEn) : ui[lang].home,
      current: (path) => path === homePath(lang),
    },
    {
      href: projectsPath(lang),
      label: ui[lang].projects,
      current: (path) => path === projectsPath(lang) || path.startsWith(`${projectsPath(lang)}/`),
    },
  ];

  for (const page of navPages) {
    if (page.slug === 'home') continue;
    const href = pagePath(lang, page.slug);
    items.push({
      href,
      label: pickText(lang, page.titleNl, page.titleEn),
      current: (path) => path === href,
    });
  }

  const logo = settings.logoMediaId ? coverFromId(db, dataDir, settings.logoMediaId, settings.siteName) : null;
  const ogImage = settings.ogImageMediaId && hasImage(dataDir, settings.ogImageMediaId)
    ? `/media/${settings.ogImageMediaId}/1600.jpg`
    : null;

  return {
    lang,
    origin,
    siteName: settings.siteName,
    tagline: pickText(lang, settings.taglineNl, settings.taglineEn),
    accentColor: sanitizeAccent(settings.accentColor),
    nav: items.map((item) => ({ href: item.href, label: item.label, current: item.current(pathname) })),
    year: new Date().getFullYear(),
    logo,
    ogImage,
  };
}

export function loadHome(db: AppDatabase, dataDir: string, lang: Lang): HomeContent {
  const settings = requireSettings(db);
  const home = db.select().from(pages).where(eq(pages.slug, 'home')).get();
  const storedBlocks = db.select().from(homeBlocks).orderBy(asc(homeBlocks.sortOrder), asc(homeBlocks.id)).all();
  const blockRows = storedBlocks.length ? storedBlocks : defaultBlocks();
  const blocks = blockRows
    .filter((block) => block.enabled)
    .map((block) => block.blockKey)
    .filter((key): key is HomeBlockKey => (HOME_BLOCK_KEYS as readonly string[]).includes(key));
  const introSource = home ? pickBody(lang, home.bodyNl, home.bodyEn) : '';
  const introHtml = richTextToHtml(introSource);
  const featuredRows = publishedProjects(db).filter((project) => project.featured);
  const covers = coversById(db, dataDir, ids(featuredRows));

  return {
    hero: blocks.includes('hero'),
    blocks,
    introHtml: richTextIsEmptySafe(introSource) ? '' : introHtml,
    featured: featuredRows.map((project) => toCard(project, lang, covers)),
    contact: contactLinks(settings, lang),
    description:
      (home ? pickText(lang, home.seoDescriptionNl, home.seoDescriptionEn) : '') ||
      pickText(lang, settings.taglineNl, settings.taglineEn),
  };
}

export function loadPage(db: AppDatabase, lang: Lang, slug: string) {
  const page = db.select().from(pages).where(and(eq(pages.slug, slug), eq(pages.published, true))).get();
  if (!page) return null;
  const body = pickBody(lang, page.bodyNl, page.bodyEn);
  return {
    title: pickText(lang, page.titleNl, page.titleEn),
    html: richTextToHtml(body),
    description: pickText(lang, page.seoDescriptionNl, page.seoDescriptionEn),
  };
}

export function loadProjectIndex(db: AppDatabase, dataDir: string, lang: Lang, tag: string | undefined): ProjectIndex {
  const tagRows = usedTags(db);
  const known = new Set(tagRows.map((row) => row.slug));
  const active = tag && known.has(tag) ? tag : null;
  let rows = publishedProjects(db);
  if (active) {
    const matching = new Set(
      db
        .select({ projectId: projectTags.projectId })
        .from(projectTags)
        .innerJoin(tags, eq(tags.id, projectTags.tagId))
        .where(eq(tags.slug, active))
        .all()
        .map((row) => row.projectId),
    );
    rows = rows.filter((project) => matching.has(project.id));
  }
  const covers = coversById(db, dataDir, ids(rows));
  return {
    tags: tagRows.map((row) => ({
      slug: row.slug,
      name: pickText(lang, row.nameNl, row.nameEn),
      current: row.slug === active,
    })),
    projects: rows.map((project) => toCard(project, lang, covers)),
  };
}

export function loadProject(db: AppDatabase, dataDir: string, lang: Lang, slug: string): ProjectDetail | null {
  const project = db
    .select()
    .from(projects)
    .where(and(eq(projects.slug, slug), eq(projects.published, true)))
    .get();
  if (!project) return null;

  const covers = coversById(db, dataDir, project.coverMediaId ? [project.coverMediaId] : []);
  const card = toCard(project, lang, covers);
  const title = card.title;
  const galleryRows = db
    .select({
      captionNl: projectMedia.captionNl,
      captionEn: projectMedia.captionEn,
      id: media.id,
      altNl: media.altNl,
      altEn: media.altEn,
      width: media.width,
      height: media.height,
      focalX: media.focalX,
      focalY: media.focalY,
    })
    .from(projectMedia)
    .innerJoin(media, eq(media.id, projectMedia.mediaId))
    .where(eq(projectMedia.projectId, project.id))
    .orderBy(asc(projectMedia.sortOrder), asc(projectMedia.id))
    .all();

  const projectTagRows = db
    .select({ slug: tags.slug, nameNl: tags.nameNl, nameEn: tags.nameEn })
    .from(tags)
    .innerJoin(projectTags, eq(projectTags.tagId, tags.id))
    .where(eq(projectTags.projectId, project.id))
    .all();

  const facts = [project.client, project.location, project.year ? String(project.year) : '', pickText(lang, project.roleNl, project.roleEn)]
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    title,
    description: pickText(lang, project.summaryNl, project.summaryEn),
    facts,
    html: richTextToHtml(pickBody(lang, project.bodyNl, project.bodyEn)),
    tags: projectTagRows.map((row) => ({
      href: projectsPath(lang, row.slug),
      name: pickText(lang, row.nameNl, row.nameEn),
    })),
    cover: card.cover,
    gallery: galleryRows
      .filter((row) => hasImage(dataDir, row.id))
      .map((row) => ({
        caption: pickText(lang, row.captionNl, row.captionEn),
        cover: {
          id: row.id,
          alt: pickText(lang, row.altNl, row.altEn) || title,
          width: row.width,
          height: row.height,
          focalX: row.focalX,
          focalY: row.focalY,
        },
      })),
    video: parseVideo(project.videoUrl, title),
  };
}

export function loadSitemap(db: AppDatabase): { nl: string; en: string; lastmod?: string }[] {
  const pageRows = db.select().from(pages).where(eq(pages.published, true)).all();
  const projectRows = publishedProjects(db);
  const entries: { nl: string; en: string; lastmod?: string }[] = [
    { nl: '/', en: '/en' },
    { nl: '/projecten', en: '/en/projects' },
  ];

  for (const page of pageRows) {
    if (page.slug === 'home') continue;
    entries.push({ nl: pagePath('nl', page.slug), en: pagePath('en', page.slug), lastmod: day(page.updatedAt) });
  }
  for (const project of projectRows) {
    entries.push({
      nl: projectPath('nl', project.slug),
      en: projectPath('en', project.slug),
      lastmod: day(project.updatedAt),
    });
  }
  return entries;
}

export function requireSettings(db: AppDatabase) {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) throw new Error('Settings row is missing');
  return row;
}

function publishedProjects(db: AppDatabase): ProjectRow[] {
  return db
    .select()
    .from(projects)
    .where(eq(projects.published, true))
    .orderBy(asc(projects.sortOrder), asc(projects.id))
    .all();
}

function usedTags(db: AppDatabase) {
  const rows = db
    .select({ slug: tags.slug, nameNl: tags.nameNl, nameEn: tags.nameEn })
    .from(tags)
    .innerJoin(projectTags, eq(projectTags.tagId, tags.id))
    .innerJoin(projects, eq(projects.id, projectTags.projectId))
    .where(eq(projects.published, true))
    .all();
  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of rows) unique.set(row.slug, row);
  return [...unique.values()].sort((a, b) => a.nameNl.localeCompare(b.nameNl, 'nl'));
}

function coversById(db: AppDatabase, dataDir: string, mediaIds: number[]): Map<number, MediaRow> {
  const unique = [...new Set(mediaIds)];
  const map = new Map<number, MediaRow>();
  if (unique.length === 0) return map;
  const rows = db.select().from(media).where(inArray(media.id, unique)).all();
  for (const row of rows) {
    if (hasImage(dataDir, row.id)) map.set(row.id, row);
  }
  return map;
}

function coverFromId(db: AppDatabase, dataDir: string, id: number, alt: string): Cover | null {
  if (!hasImage(dataDir, id)) return null;
  const row = db.select().from(media).where(eq(media.id, id)).get();
  if (!row) return null;
  return {
    id: row.id,
    alt,
    width: row.width,
    height: row.height,
    focalX: row.focalX,
    focalY: row.focalY,
  };
}

function toCard(project: ProjectRow, lang: Lang, covers: Map<number, MediaRow>): ProjectCard {
  const mediaRow = project.coverMediaId ? covers.get(project.coverMediaId) : undefined;
  const title = pickText(lang, project.titleNl, project.titleEn);
  return {
    slug: project.slug,
    title,
    client: project.client,
    year: project.year,
    cover: mediaRow
      ? {
          id: mediaRow.id,
          alt: pickText(lang, mediaRow.altNl, mediaRow.altEn) || title,
          width: mediaRow.width,
          height: mediaRow.height,
          focalX: mediaRow.focalX,
          focalY: mediaRow.focalY,
        }
      : null,
  };
}

function ids(rows: ProjectRow[]): number[] {
  return rows.flatMap((row) => (row.coverMediaId ? [row.coverMediaId] : []));
}

function defaultBlocks() {
  const keys: HomeBlockKey[] = ['hero', 'intro', 'featured', 'contact'];
  return keys.map((blockKey, sortOrder) => ({ blockKey, enabled: true, sortOrder }));
}

function day(value: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
}

function sanitizeAccent(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : null;
}

function richTextIsEmptySafe(stored: string): boolean {
  return !stored.trim() || richTextToHtml(stored).trim() === '';
}
