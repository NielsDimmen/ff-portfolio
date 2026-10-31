import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import { labelFields } from '../../shared/labels';
import { labelsWriteSchema, pageWriteSchema, siteWriteSchema } from '../../shared/site';
import type { LabelItem, PageDetail, PageListItem, SiteWrite } from '../../shared/site';
import type { AppDatabase } from '../db/client';
import { pages, settings, uiStrings } from '../db/schema';
import { AiError, translateToEnglish } from '../lib/ai';
import { docToPlain, textToDoc } from '../lib/richtext';

const translateSchema = z.object({
  texts: z.array(z.string().max(20000)).max(40),
});

export function registerContentRoutes(api: Hono, db: AppDatabase, dataDir: string) {
  api.post('/translate', async (c) => {
    const parsed = translateSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, 'De tekst is te lang om te vertalen.');
    try {
      const texts = await translateToEnglish(dataDir, parsed.data.texts);
      return c.json({ texts });
    } catch (error) {
      if (error instanceof AiError) return c.json({ error: error.message }, 503);
      throw error;
    }
  });

  api.get('/site', (c) => {
    const row = db.select().from(settings).where(eq(settings.id, 1)).get();
    if (!row) return c.json({ error: 'Instellingen ontbreken.' }, 500);
    return c.json(toSite(row));
  });

  api.patch('/site', async (c) => {
    const parsed = siteWriteSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message);
    const row = db.select().from(settings).where(eq(settings.id, 1)).get();
    if (!row) return c.json({ error: 'Instellingen ontbreken.' }, 500);
    db.update(settings).set(parsed.data).where(eq(settings.id, 1)).run();
    return c.json(toSite({ ...row, ...parsed.data }));
  });

  api.get('/pages', (c) => {
    const rows = db.select().from(pages).orderBy(asc(pages.navOrder), asc(pages.id)).all();
    const list: PageListItem[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      titleNl: row.titleNl,
      titleEn: row.titleEn,
      isSystem: row.isSystem,
    }));
    return c.json(list);
  });

  api.get('/pages/:id', (c) => {
    const page = findPage(db, c.req.param('id'));
    if (!page) return c.json({ error: 'Pagina niet gevonden.' }, 404);
    return c.json(toPage(page));
  });

  api.patch('/pages/:id', async (c) => {
    const current = findPage(db, c.req.param('id'));
    if (!current) return c.json({ error: 'Pagina niet gevonden.' }, 404);
    const parsed = pageWriteSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message);
    const published = current.slug === 'home' ? true : parsed.data.published;
    db.update(pages)
      .set({
        titleNl: parsed.data.titleNl,
        titleEn: parsed.data.titleEn,
        bodyNl: textToDoc(parsed.data.bodyNl),
        bodyEn: textToDoc(parsed.data.bodyEn),
        published,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(pages.id, current.id))
      .run();
    const saved = db.select().from(pages).where(eq(pages.id, current.id)).get();
    return c.json(saved ? toPage(saved) : toPage(current));
  });

  api.get('/labels', (c) => c.json(listLabels(db)));

  api.patch('/labels', async (c) => {
    const parsed = labelsWriteSchema.safeParse(await readJson(c));
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.message);
    db.transaction((tx) => {
      for (const item of parsed.data.items) {
        tx.insert(uiStrings)
          .values({ key: item.key, nl: item.nl, en: item.en })
          .onConflictDoUpdate({ target: uiStrings.key, set: { nl: item.nl, en: item.en } })
          .run();
      }
    });
    return c.json(listLabels(db));
  });
}

function listLabels(db: AppDatabase): LabelItem[] {
  const rows = db.select().from(uiStrings).all();
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return labelFields.map((field) => {
    const row = byKey.get(field.key);
    return { key: field.key, label: field.label, nl: row?.nl ?? field.nl, en: row?.en ?? field.en };
  });
}

function findPage(db: AppDatabase, raw: string | undefined) {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return db.select().from(pages).where(eq(pages.id, Number(raw))).get();
}

function toSite(row: SiteWrite): SiteWrite {
  return {
    siteName: row.siteName,
    taglineNl: row.taglineNl,
    taglineEn: row.taglineEn,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    linkedin: row.linkedin,
    vcfName: row.vcfName,
    vcfCompany: row.vcfCompany,
    vcfTitle: row.vcfTitle,
  };
}

function toPage(row: {
  id: number;
  slug: string;
  titleNl: string;
  titleEn: string;
  bodyNl: string;
  bodyEn: string;
  published: boolean;
  isSystem: boolean;
}): PageDetail {
  return {
    id: row.id,
    slug: row.slug,
    titleNl: row.titleNl,
    titleEn: row.titleEn,
    bodyNl: docToPlain(row.bodyNl),
    bodyEn: docToPlain(row.bodyEn),
    published: row.published,
    isSystem: row.isSystem,
  };
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
