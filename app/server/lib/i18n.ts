import { richTextIsEmpty } from './richtext';

export type Lang = 'nl' | 'en';

export function isLang(value: string | undefined): value is Lang {
  return value === 'nl' || value === 'en';
}

/** Visitor-facing copy: English when it has text, otherwise Dutch. */
export function pickText(lang: Lang, nl: string, en: string): string {
  if (lang === 'en' && en.trim()) return en;
  return nl;
}

export function pickBody(lang: Lang, nl: string, en: string): string {
  if (lang === 'en' && !richTextIsEmpty(en)) return en;
  return nl;
}

export const ui = {
  nl: {
    home: 'Home',
    projects: 'Projecten',
    saveContact: 'Save contact',
    dark: 'Donker',
    light: 'Licht',
    allTags: 'Alles',
    emptyProjects: 'Nog geen projecten.',
    notFound: 'Deze pagina bestaat niet.',
    skip: 'Naar inhoud',
    contact: 'Contact',
    tags: 'Tags',
  },
  en: {
    home: 'Home',
    projects: 'Projects',
    saveContact: 'Save contact',
    dark: 'Dark',
    light: 'Light',
    allTags: 'All',
    emptyProjects: 'No projects yet.',
    notFound: 'This page does not exist.',
    skip: 'Skip to content',
    contact: 'Contact',
    tags: 'Tags',
  },
} as const;
