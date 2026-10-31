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
import { loadCopy, type UiCopy } from '../lib/copy';
import { pickBody, pickText, type Lang } from '../lib/i18n';
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
  location: string;
  role: string;
  tags: string[];
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
  copy: UiCopy;
  landingOnly: boolean;
};

export type BackgroundPhoto = {
  id: number;
  focalX: number;
  focalY: number;
  title: string;
  role: string;
  client: string;
  location: string;
  year: number | null;
  photographer: string;
};

export type HomeContent = {
  hero: boolean;
  blocks: HomeBlockKey[];
  introHtml: string;
  featured: ProjectCard[];
  contact: ContactLink[];
  description: string;
  background: BackgroundPhoto[];
};

export type ProjectIndex = {
  tags: { slug: string; name: string; current: boolean }[];
  projects: ProjectCard[];
};

export type ProjectDetail = {
  title: string;
  description: string;
  facts: { client: string; location: string; period: string; role: string };
  html: string;
  tags: { href: string; name: string }[];
  cover: Cover | null;
  coverPhotographer: string;
  gallery: { cover: Cover; caption: string; photographer: string }[];
  video: VideoEmbed | null;
};

type ProjectRow = typeof projects.$inferSelect;
type MediaRow = typeof media.$inferSelect;

export function loadShell(db: AppDatabase, dataDir: string, lang: Lang, pathname: string, origin: string): Shell {
  const settings = requireSettings(db);
  const copy = loadCopy(db, lang);
  const navPages = db
    .select()
    .from(pages)
    .where(and(eq(pages.published, true), eq(pages.showInNav, true)))
    .orderBy(asc(pages.navOrder), asc(pages.id))
    .all();

  const landingOnly = process.env.SITE_SCOPE === 'landing';
  const homePage = navPages.find((page) => page.slug === 'home');
  const items: { href: string; label: string; current: (path: string) => boolean }[] = [
    {
      href: homePath(lang),
      label: homePage ? pickText(lang, homePage.titleNl, homePage.titleEn) : copy.home,
      current: (path) => path === homePath(lang),
    },
  ];

  if (!landingOnly) {
    items.push({
      href: projectsPath(lang),
      label: copy.projects,
      current: (path) => path === projectsPath(lang) || path.startsWith(`${projectsPath(lang)}/`),
    });
  }

  for (const page of navPages) {
    if (page.slug === 'home' || landingOnly) continue;
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
    copy,
    landingOnly,
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
  const tagNames = tagNamesFor(db, lang, featuredRows.map((project) => project.id));

  return {
    hero: blocks.includes('hero'),
    blocks,
    introHtml: richTextIsEmptySafe(introSource) ? '' : introHtml,
    featured: featuredRows.map((project) => toCard(project, lang, covers, tagNames.get(project.id) ?? [])),
    contact: contactLinks(settings, loadCopy(db, lang).saveContact),
    background: backgroundPhotos(db, dataDir, lang),
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
  const tagNames = tagNamesFor(db, lang, rows.map((project) => project.id));
  return {
    tags: tagRows.map((row) => ({
      slug: row.slug,
      name: pickText(lang, row.nameNl, row.nameEn),
      current: row.slug === active,
    })),
    projects: rows.map((project) => toCard(project, lang, covers, tagNames.get(project.id) ?? [])),
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
  const card = toCard(project, lang, covers, []);
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
      photographer: media.photographer,
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

  return {
    title,
    description: pickText(lang, project.summaryNl, project.summaryEn),
    facts: {
      client: project.client.trim(),
      location: project.location.trim(),
      period: project.year ? String(project.year) : '',
      role: pickText(lang, project.roleNl, project.roleEn).trim(),
    },
    html: richTextToHtml(pickBody(lang, project.bodyNl, project.bodyEn)),
    tags: projectTagRows.map((row) => ({
      href: projectsPath(lang, row.slug),
      name: pickText(lang, row.nameNl, row.nameEn),
    })),
    cover: card.cover,
    coverPhotographer: (project.coverMediaId ? covers.get(project.coverMediaId)?.photographer : '')?.trim() ?? '',
    gallery: galleryRows
      .filter((row) => hasImage(dataDir, row.id))
      .map((row) => ({
        caption: pickText(lang, row.captionNl, row.captionEn),
        photographer: row.photographer.trim(),
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

function backgroundPhotos(db: AppDatabase, dataDir: string, lang: Lang): BackgroundPhoto[] {
  const published = publishedProjects(db);
  const slides: Slide[] = [];
  const seen = new Set<number>();
  const push = (id: number | null, projectId: number) => {
    if (!id || seen.has(id) || !hasImage(dataDir, id)) return;
    seen.add(id);
    slides.push({ id, projectId });
  };
  for (const project of published) push(project.coverMediaId, project.id);
  if (published.length > 0) {
    const gallery = db
      .select({ mediaId: projectMedia.mediaId, projectId: projectMedia.projectId })
      .from(projectMedia)
      .where(inArray(projectMedia.projectId, published.map((project) => project.id)))
      .all();
    for (const row of gallery) push(row.mediaId, row.projectId);
  }
  const mixed = mixSlides(slides);
  if (mixed.length === 0) return [];
  const rows = db
    .select({ id: media.id, focalX: media.focalX, focalY: media.focalY, photographer: media.photographer })
    .from(media)
    .where(inArray(media.id, mixed.map((slide) => slide.id)))
    .all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byProject = new Map(published.map((project) => [project.id, project]));
  return mixed.flatMap((slide) => {
    const row = byId.get(slide.id);
    const project = byProject.get(slide.projectId);
    if (!row || !project) return [];
    return [
      {
        id: row.id,
        focalX: row.focalX,
        focalY: row.focalY,
        title: pickText(lang, project.titleNl, project.titleEn).trim(),
        role: pickText(lang, project.roleNl, project.roleEn).trim(),
        client: project.client.trim(),
        location: project.location.trim(),
        year: project.year,
        photographer: row.photographer.trim(),
      },
    ];
  });
}

type Slide = { id: number; projectId: number };

/** Shuffle photos, and spread each project so the same one rarely sits next to itself. */
function mixSlides(slides: Slide[]): Slide[] {
  const groups = new Map<number, Slide[]>();
  for (const slide of slides) {
    const group = groups.get(slide.projectId) ?? [];
    group.push(slide);
    groups.set(slide.projectId, group);
  }
  const pools = [...groups.values()]
    .map((group) => shuffle(group))
    .sort((a, b) => b.length - a.length);
  return rotateSeam(spread(pools));
}

/** Largest project forms the gaps; the others sit between those gaps, mixed the same way. */
function spread(groups: Slide[][]): Slide[] {
  const primary = groups[0];
  if (!primary) return [];
  const rest = groups.slice(1);
  if (rest.length === 0) return primary;
  const separators = spread(rest);
  const gaps = Math.max(separators.length, 1);
  const base = Math.floor(primary.length / gaps);
  let extra = primary.length % gaps;
  const extraGaps = new Set(shuffle([...Array(gaps).keys()]).slice(0, extra));
  const result: Slide[] = [];
  let cursor = 0;
  for (let gap = 0; gap < gaps; gap += 1) {
    const count = base + (extraGaps.has(gap) ? 1 : 0);
    for (let step = 0; step < count; step += 1) {
      const photo = primary[cursor];
      cursor += 1;
      if (photo) result.push(photo);
    }
    const separator = separators[gap];
    if (separator) result.push(separator);
  }
  return result;
}

function rotateSeam(slides: Slide[]): Slide[] {
  if (slides.length < 2) return slides;
  const seams: number[] = [];
  for (let index = 0; index < slides.length; index += 1) {
    const current = slides[index];
    const next = slides[(index + 1) % slides.length];
    if (current && next && current.projectId !== next.projectId) seams.push(index);
  }
  if (seams.length === 0) return slides;
  const seam = seams[Math.floor(Math.random() * seams.length)];
  if (seam === undefined) return slides;
  const start = (seam + 1) % slides.length;
  return [...slides.slice(start), ...slides.slice(0, start)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    const other = copy[swap];
    if (current === undefined || other === undefined) continue;
    copy[index] = other;
    copy[swap] = current;
  }
  return copy;
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

function tagNamesFor(db: AppDatabase, lang: Lang, projectIds: number[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (projectIds.length === 0) return map;
  const rows = db
    .select({ projectId: projectTags.projectId, nameNl: tags.nameNl, nameEn: tags.nameEn })
    .from(projectTags)
    .innerJoin(tags, eq(tags.id, projectTags.tagId))
    .where(inArray(projectTags.projectId, projectIds))
    .all();
  for (const row of rows) {
    const list = map.get(row.projectId) ?? [];
    list.push(pickText(lang, row.nameNl, row.nameEn));
    map.set(row.projectId, list);
  }
  return map;
}

function toCard(project: ProjectRow, lang: Lang, covers: Map<number, MediaRow>, tagNames: string[]): ProjectCard {
  const mediaRow = project.coverMediaId ? covers.get(project.coverMediaId) : undefined;
  const title = pickText(lang, project.titleNl, project.titleEn);
  return {
    slug: project.slug,
    title,
    client: project.client,
    year: project.year,
    location: project.location,
    role: pickText(lang, project.roleNl, project.roleEn),
    tags: tagNames,
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
