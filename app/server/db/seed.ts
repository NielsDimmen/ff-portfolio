import { count, eq } from 'drizzle-orm';
import type { AppDatabase } from './client';
import { homeBlocks, pages, projects, settings, tags } from './schema';

const EMPTY_DOC = '{"type":"doc","content":[]}';

function doc(paragraphs: string[]): string {
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  });
}

/**
 * First boot only. A settings row means the database was already seeded,
 * so later edits in the CMS are left alone.
 */
export function seedIfEmpty(db: AppDatabase): boolean {
  const existing = db.select({ n: count() }).from(settings).get();
  if ((existing?.n ?? 0) > 0) return false;

  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.insert(settings)
      .values({
        id: 1,
        siteName: 'ff dimmen',
        taglineNl: 'Freelance event & tour techniek',
        taglineEn: 'Freelance event & tour technology',
        email: '',
        phone: '',
        whatsapp: '',
        instagram: 'nielsslein1',
        linkedin: '',
        defaultLang: 'nl',
        accentColor: null,
        vcfName: 'Niels',
        vcfCompany: 'ff dimmen',
        vcfTitle: 'Freelance event & tour techniek',
      })
      .run();

    tx.insert(pages)
      .values([
        {
          slug: 'home',
          titleNl: 'Home',
          titleEn: 'Home',
          bodyNl: EMPTY_DOC,
          bodyEn: EMPTY_DOC,
          seoDescriptionNl: 'Freelance event & tour techniek',
          seoDescriptionEn: 'Freelance event & tour technology',
          showInNav: true,
          navOrder: 0,
          published: true,
          isSystem: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          slug: 'over',
          titleNl: 'Over',
          titleEn: 'About',
          bodyNl: doc([
            'Technicus uit Maastricht. Werkt op tour, festivals en live events. Media servers, licht, netwerk en AV.',
          ]),
          bodyEn: doc([
            'Technician from Maastricht. Works on tours, festivals and live events. Media servers, lighting, networking and AV.',
          ]),
          seoDescriptionNl:
            'Technicus uit Maastricht. Werkt op tour, festivals en live events.',
          seoDescriptionEn:
            'Technician from Maastricht. Works on tours, festivals and live events.',
          showInNav: true,
          navOrder: 1,
          published: true,
          isSystem: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    tx.insert(homeBlocks)
      .values([
        { blockKey: 'hero', enabled: true, sortOrder: 0 },
        { blockKey: 'intro', enabled: true, sortOrder: 1 },
        { blockKey: 'featured', enabled: true, sortOrder: 2 },
        { blockKey: 'contact', enabled: true, sortOrder: 3 },
      ])
      .run();

    tx.insert(tags)
      .values([
        { slug: 'led', nameNl: 'LED', nameEn: 'LED' },
        { slug: 'media-server', nameNl: 'Media server', nameEn: 'Media server' },
        { slug: 'follow-me', nameNl: 'Follow-Me', nameEn: 'Follow-Me' },
        { slug: 'licht', nameNl: 'Licht', nameEn: 'Lighting' },
        { slug: 'netwerk', nameNl: 'Netwerk', nameEn: 'Network' },
        { slug: 'av', nameNl: 'AV', nameEn: 'AV' },
      ])
      .run();

    tx.insert(projects)
      .values([
        {
          slug: 'andre-rieu-tour',
          titleNl: 'André Rieu tour',
          titleEn: 'André Rieu tour',
          client: 'André Rieu',
          summaryNl: 'Placeholder. Tourtechniek voor de André Rieu tour.',
          summaryEn: 'Placeholder. Tour technology for the André Rieu tour.',
          bodyNl: doc([
            'Placeholder. Dit voorbeeldproject gaat over de André Rieu tour. Tekst en foto’s vul je zelf aan in het CMS.',
          ]),
          bodyEn: doc([
            'Placeholder. This sample project is about the André Rieu tour. Add your own text and photos in the CMS.',
          ]),
          featured: false,
          published: false,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          slug: 'holland-festival-chernobyl-ost',
          titleNl: 'Holland Festival — CHERNOBYL OST',
          titleEn: 'Holland Festival — CHERNOBYL OST',
          client: 'Holland Festival',
          summaryNl: 'Placeholder. Live event voor Holland Festival — CHERNOBYL OST.',
          summaryEn: 'Placeholder. Live event for Holland Festival — CHERNOBYL OST.',
          bodyNl: doc([
            'Placeholder. Dit voorbeeldproject gaat over Holland Festival — CHERNOBYL OST. Tekst en foto’s vul je zelf aan in het CMS.',
          ]),
          bodyEn: doc([
            'Placeholder. This sample project is about Holland Festival — CHERNOBYL OST. Add your own text and photos in the CMS.',
          ]),
          featured: false,
          published: false,
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
  });

  return true;
}

export function warnIfSystemPagesMissing(db: AppDatabase): void {
  for (const slug of ['home', 'over']) {
    const page = db.select({ id: pages.id }).from(pages).where(eq(pages.slug, slug)).get();
    if (!page) {
      console.warn(`[portfolio] warning: system page "${slug}" is missing`);
    }
  }
}
