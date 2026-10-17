import { and, asc, eq, inArray, max } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { focalSchema, projectWriteSchema, tagWriteSchema } from '../../shared/project';
import type { ProjectDetail, ProjectListItem, ProjectWrite, TagRecord } from '../../shared/project';
import { slugify } from '../../shared/slug';
import type { AppDatabase } from '../db/client';
import { media, projectMedia, projectTags, projects, tags } from '../db/schema';
import { docToPlain, textToDoc } from '../lib/richtext';
import { parseVideo } from '../lib/video';
import { UploadError, storeImage } from '../media/store';

type ApiOptions = {
  dataDir: string;
  maxUploadBytes: number;
};

export function registerProjectRoutes(api: Hono, db: AppDatabase, options: ApiOptions) {
  api.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  api.get('/tags', (c) => c.json(listTags(db)));

  api.post('/tags', async (c) => {
    const parsed = tagWriteSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message);
    const base = slugify(parsed.data.nameNl) || 'tag';
    const slug = uniqueSlug(base, (candidate) =>
      Boolean(db.select({ id: tags.id }).from(tags).where(eq(tags.slug, candidate)).get()),
    );
    const created = db
      .insert(tags)
      .values({ slug, nameNl: parsed.data.nameNl, nameEn: parsed.data.nameEn })
      .returning()
      .get();
    return c.json(toTag(created), 201);
  });

  api.get('/projects', (c) => c.json(listProjects(db)));

  api.get('/projects/:id', (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Project niet gevonden.' }, 404);
    const detail = getProject(db, id);
    if (!detail) return c.json({ error: 'Project niet gevonden.' }, 404);
    return c.json(detail);
  });

  api.post('/projects', async (c) => {
    const parsed = projectWriteSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message);
    const problem = validateRelations(db, parsed.data.coverMediaId, parsed.data.tagIds, parsed.data.videoUrl);
    if (problem) return c.json({ error: problem }, 400);

    const now = new Date().toISOString();
    const sortOrder = (db.select({ n: max(projects.sortOrder) }).from(projects).get()?.n ?? -1) + 1;
    try {
      const created = db.transaction((tx) => {
        const row = tx
          .insert(projects)
          .values({ ...projectValues(parsed.data), sortOrder, createdAt: now, updatedAt: now })
          .returning()
          .get();
        if (parsed.data.tagIds.length) {
          tx.insert(projectTags)
            .values(parsed.data.tagIds.map((tagId) => ({ projectId: row.id, tagId })))
            .run();
        }
        return row;
      });
      return c.json(getProject(db, created.id), 201);
    } catch (error) {
      if (isUnique(error)) return c.json({ error: 'Deze slug bestaat al.' }, 409);
      throw error;
    }
  });

  api.patch('/projects/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Project niet gevonden.' }, 404);
    if (!db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get()) {
      return c.json({ error: 'Project niet gevonden.' }, 404);
    }
    const parsed = projectWriteSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message);
    const problem = validateRelations(db, parsed.data.coverMediaId, parsed.data.tagIds, parsed.data.videoUrl);
    if (problem) return c.json({ error: problem }, 400);

    try {
      db.transaction((tx) => {
        tx.update(projects)
          .set({ ...projectValues(parsed.data), updatedAt: new Date().toISOString() })
          .where(eq(projects.id, id))
          .run();
        tx.delete(projectTags).where(eq(projectTags.projectId, id)).run();
        if (parsed.data.tagIds.length) {
          tx.insert(projectTags)
            .values(parsed.data.tagIds.map((tagId) => ({ projectId: id, tagId })))
            .run();
        }
      });
    } catch (error) {
      if (isUnique(error)) return c.json({ error: 'Deze slug bestaat al.' }, 409);
      throw error;
    }
    return c.json(getProject(db, id));
  });

  api.delete('/projects/:id', (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Project niet gevonden.' }, 404);
    const result = db.delete(projects).where(eq(projects.id, id)).run();
    if (result.changes === 0) return c.json({ error: 'Project niet gevonden.' }, 404);
    return c.json({ ok: true });
  });

  api.post('/media', async (c) => {
    const file = await readUpload(c, options.maxUploadBytes);
    if (file instanceof Response) return file;
    try {
      const stored = await storeImage(db, options.dataDir, file.bytes, file.name);
      return c.json({ id: stored.id }, 201);
    } catch (error) {
      if (error instanceof UploadError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  api.patch('/media/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null || !db.select({ id: media.id }).from(media).where(eq(media.id, id)).get()) {
      return c.json({ error: 'Foto niet gevonden.' }, 404);
    }
    const parsed = focalSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, 'Focuspunt is ongeldig.');
    db.update(media).set(parsed.data).where(eq(media.id, id)).run();
    return c.json({ ok: true });
  });

  api.post('/projects/:id/gallery', async (c) => {
    const projectId = parseId(c.req.param('id'));
    if (projectId === null || !db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get()) {
      return c.json({ error: 'Project niet gevonden.' }, 404);
    }
    const file = await readUpload(c, options.maxUploadBytes);
    if (file instanceof Response) return file;
    try {
      const stored = await storeImage(db, options.dataDir, file.bytes, file.name);
      const sortOrder =
        (db.select({ n: max(projectMedia.sortOrder) }).from(projectMedia).where(eq(projectMedia.projectId, projectId)).get()
          ?.n ?? -1) + 1;
      const link = db
        .insert(projectMedia)
        .values({ projectId, mediaId: stored.id, sortOrder, captionNl: '', captionEn: '' })
        .returning()
        .get();
      return c.json({ id: link.id, mediaId: stored.id }, 201);
    } catch (error) {
      if (error instanceof UploadError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  api.delete('/projects/:id/gallery/:linkId', (c) => {
    const projectId = parseId(c.req.param('id'));
    const linkId = parseId(c.req.param('linkId'));
    if (projectId === null || linkId === null) return c.json({ error: 'Foto niet gevonden.' }, 404);
    const result = db
      .delete(projectMedia)
      .where(and(eq(projectMedia.id, linkId), eq(projectMedia.projectId, projectId)))
      .run();
    if (result.changes === 0) return c.json({ error: 'Foto niet gevonden.' }, 404);
    return c.json({ ok: true });
  });
}

function listProjects(db: AppDatabase): ProjectListItem[] {
  return db
    .select({
      id: projects.id,
      slug: projects.slug,
      titleNl: projects.titleNl,
      client: projects.client,
      year: projects.year,
      published: projects.published,
      featured: projects.featured,
      coverMediaId: projects.coverMediaId,
    })
    .from(projects)
    .orderBy(asc(projects.sortOrder), asc(projects.id))
    .all();
}

function listTags(db: AppDatabase): TagRecord[] {
  return db
    .select({ id: tags.id, slug: tags.slug, nameNl: tags.nameNl, nameEn: tags.nameEn })
    .from(tags)
    .orderBy(asc(tags.nameNl))
    .all();
}

function getProject(db: AppDatabase, id: number): ProjectDetail | null {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!row) return null;
  const tagIds = db
    .select({ tagId: projectTags.tagId })
    .from(projectTags)
    .where(eq(projectTags.projectId, id))
    .all()
    .map((item) => item.tagId);
  const gallery = db
    .select({ id: projectMedia.id, mediaId: projectMedia.mediaId })
    .from(projectMedia)
    .where(eq(projectMedia.projectId, id))
    .orderBy(asc(projectMedia.sortOrder), asc(projectMedia.id))
    .all();
  const cover = row.coverMediaId
    ? db.select({ focalX: media.focalX, focalY: media.focalY }).from(media).where(eq(media.id, row.coverMediaId)).get()
    : undefined;

  return {
    id: row.id,
    slug: row.slug,
    titleNl: row.titleNl,
    titleEn: row.titleEn,
    client: row.client,
    location: row.location,
    year: row.year,
    roleNl: row.roleNl,
    roleEn: row.roleEn,
    summaryNl: row.summaryNl,
    summaryEn: row.summaryEn,
    bodyNl: docToPlain(row.bodyNl),
    bodyEn: docToPlain(row.bodyEn),
    videoUrl: row.videoUrl ?? '',
    published: row.published,
    featured: row.featured,
    coverMediaId: row.coverMediaId,
    tagIds,
    focalX: cover?.focalX ?? 0.5,
    focalY: cover?.focalY ?? 0.5,
    gallery,
  };
}

function projectValues(input: ProjectWrite) {
  return {
    slug: input.slug,
    titleNl: input.titleNl,
    titleEn: input.titleEn,
    client: input.client,
    location: input.location,
    year: input.year,
    roleNl: input.roleNl,
    roleEn: input.roleEn,
    summaryNl: input.summaryNl,
    summaryEn: input.summaryEn,
    bodyNl: textToDoc(input.bodyNl),
    bodyEn: textToDoc(input.bodyEn),
    videoUrl: input.videoUrl || null,
    published: input.published,
    featured: input.featured,
    coverMediaId: input.coverMediaId,
  };
}

function validateRelations(
  db: AppDatabase,
  coverMediaId: number | null,
  tagIds: number[],
  videoUrl: string,
): string | null {
  if (coverMediaId !== null && !db.select({ id: media.id }).from(media).where(eq(media.id, coverMediaId)).get()) {
    return 'Cover niet gevonden.';
  }
  if (tagIds.length) {
    const found = db.select({ id: tags.id }).from(tags).where(inArray(tags.id, tagIds)).all();
    if (found.length !== new Set(tagIds).size) return 'Onbekende tag.';
  }
  if (videoUrl && !parseVideo(videoUrl, 'video')) {
    return 'Video-link wordt niet herkend. Gebruik een YouTube- of Vimeo-link.';
  }
  return null;
}

function toTag(row: { id: number; slug: string; nameNl: string; nameEn: string }): TagRecord {
  return { id: row.id, slug: row.slug, nameNl: row.nameNl, nameEn: row.nameEn };
}

function uniqueSlug(base: string, exists: (slug: string) => boolean): string {
  if (!exists(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const next = `${base}-${i}`;
    if (!exists(next)) return next;
  }
  return `${base}-${Date.now()}`;
}

function parseId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function invalid(c: Context, message: string | undefined) {
  return c.json({ error: message || 'Ongeldige invoer.' }, 400);
}

async function readUpload(
  c: Context,
  maxBytes: number,
): Promise<{ bytes: Buffer; name: string } | Response> {
  const declared = Number(c.req.header('content-length') ?? 0);
  if (declared > maxBytes) {
    return c.json({ error: `Bestand is te groot (max ${Math.round(maxBytes / (1024 * 1024))} MB).` }, 413);
  }
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: 'Geen bestand gekozen.' }, 400);
  if (file.size > maxBytes) {
    return c.json({ error: `Bestand is te groot (max ${Math.round(maxBytes / (1024 * 1024))} MB).` }, 413);
  }
  return { bytes: Buffer.from(await file.arrayBuffer()), name: file.name || 'upload' };
}

function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE';
}
