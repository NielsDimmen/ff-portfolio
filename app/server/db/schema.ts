import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

/**
 * Uploaded files. Variants live on disk at {dataDir}/media/{id}/{size}.{webp|avif|jpg}.
 * byteSize is the original upload size, used later by the media library.
 * focalX/focalY are 0..1 and drive cover crops.
 */
export const media = sqliteTable('media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  originalFilename: text('original_filename').notNull(),
  mime: text('mime').notNull(),
  byteSize: integer('byte_size').notNull().default(0),
  width: integer('width'),
  height: integer('height'),
  altNl: text('alt_nl').notNull().default(''),
  altEn: text('alt_en').notNull().default(''),
  focalX: real('focal_x').notNull().default(0.5),
  focalY: real('focal_y').notNull().default(0.5),
  createdAt: text('created_at').notNull(),
});

/** Single row (id = 1). Visitor-facing copy is bilingual; empty EN falls back to NL. */
export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey(),
    siteName: text('site_name').notNull(),
    taglineNl: text('tagline_nl').notNull().default(''),
    taglineEn: text('tagline_en').notNull().default(''),
    email: text('email').notNull().default(''),
    phone: text('phone').notNull().default(''),
    whatsapp: text('whatsapp').notNull().default(''),
    instagram: text('instagram').notNull().default(''),
    linkedin: text('linkedin').notNull().default(''),
    logoMediaId: integer('logo_media_id').references(() => media.id, { onDelete: 'set null' }),
    faviconMediaId: integer('favicon_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    ogImageMediaId: integer('og_image_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),
    defaultLang: text('default_lang').notNull().default('nl'),
    accentColor: text('accent_color'),
    vcfName: text('vcf_name').notNull().default(''),
    vcfCompany: text('vcf_company').notNull().default(''),
    vcfTitle: text('vcf_title').notNull().default(''),
  },
  (table) => [
    check('settings_singleton_check', sql`${table.id} = 1`),
    check('settings_default_lang_check', sql`${table.defaultLang} in ('nl', 'en')`),
  ],
);

/**
 * CMS pages. isSystem marks home and over: those slugs stay, later API calls refuse to delete them.
 * body_* stores TipTap JSON, never raw HTML.
 */
export const pages = sqliteTable('pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  titleNl: text('title_nl').notNull(),
  titleEn: text('title_en').notNull().default(''),
  bodyNl: text('body_nl').notNull().default(''),
  bodyEn: text('body_en').notNull().default(''),
  seoDescriptionNl: text('seo_description_nl').notNull().default(''),
  seoDescriptionEn: text('seo_description_en').notNull().default(''),
  showInNav: integer('show_in_nav', { mode: 'boolean' }).notNull().default(false),
  navOrder: integer('nav_order').notNull().default(0),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const HOME_BLOCK_KEYS = ['hero', 'intro', 'featured', 'contact'] as const;
export type HomeBlockKey = (typeof HOME_BLOCK_KEYS)[number];

/** Home layout: which blocks are on, and in which order. Copy lives on the home page and settings. */
export const homeBlocks = sqliteTable(
  'home_blocks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    blockKey: text('block_key').notNull().unique(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    check(
      'home_blocks_key_check',
      sql`${table.blockKey} in ('hero', 'intro', 'featured', 'contact')`,
    ),
  ],
);

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    titleNl: text('title_nl').notNull(),
    titleEn: text('title_en').notNull().default(''),
    client: text('client').notNull().default(''),
    location: text('location').notNull().default(''),
    year: integer('year'),
    dateStart: text('date_start'),
    dateEnd: text('date_end'),
    roleNl: text('role_nl').notNull().default(''),
    roleEn: text('role_en').notNull().default(''),
    summaryNl: text('summary_nl').notNull().default(''),
    summaryEn: text('summary_en').notNull().default(''),
    bodyNl: text('body_nl').notNull().default(''),
    bodyEn: text('body_en').notNull().default(''),
    coverMediaId: integer('cover_media_id').references(() => media.id, { onDelete: 'set null' }),
    videoUrl: text('video_url'),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    published: integer('published', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('projects_published_sort_idx').on(table.published, table.sortOrder)],
);

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  nameNl: text('name_nl').notNull(),
  nameEn: text('name_en').notNull().default(''),
});

export const projectTags = sqliteTable(
  'project_tags',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.tagId] })],
);

export const projectMedia = sqliteTable(
  'project_media',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    mediaId: integer('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    captionNl: text('caption_nl').notNull().default(''),
    captionEn: text('caption_en').notNull().default(''),
  },
  (table) => [index('project_media_project_sort_idx').on(table.projectId, table.sortOrder)],
);
