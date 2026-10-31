import type { AppDatabase } from '../db/client';
import { uiStrings } from '../db/schema';
import { pickText, ui, type Lang } from './i18n';

export type UiCopy = { -readonly [K in keyof (typeof ui)['nl']]: string };

/** Database labels override the built-in copy. An empty English value falls back to Dutch. */
export function loadCopy(db: AppDatabase, lang: Lang): UiCopy {
  const rows = db.select().from(uiStrings).all();
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const copy: UiCopy = { ...ui[lang] };
  for (const key of Object.keys(ui.nl) as (keyof UiCopy)[]) {
    const row = byKey.get(key);
    if (!row) continue;
    const value = pickText(lang, row.nl, row.en);
    if (value.trim()) copy[key] = value;
  }
  return copy;
}
