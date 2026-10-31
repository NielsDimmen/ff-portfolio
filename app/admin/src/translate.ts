import { api } from './api';

const DUTCH = /\b(de|het|een|van|op|en|uit|voor|met|naar|niet|wij|we|jullie|klant|techniek|licht|netwerk|projecten|opslaan|donker|alles|geen|deze|bestaat|nog|werkt|tour)\b/i;

/** Empty English, or English that is still a copy of Dutch that actually needs translating. */
export function needsEnglish(nl: string, en: string): boolean {
  const left = nl.trim();
  const right = en.trim();
  if (!left) return false;
  if (!right) return true;
  if (left.localeCompare(right, 'nl', { sensitivity: 'accent' }) !== 0) return false;
  return DUTCH.test(left);
}

export async function translateEmpty(pairs: { nl: string; en: string }[]): Promise<{ texts: string[]; changed: boolean }> {
  const pending = pairs.flatMap((pair, index) => (needsEnglish(pair.nl, pair.en) ? [index] : []));
  if (!pending.length) return { texts: pairs.map((pair) => pair.en), changed: false };
  const result = await api<{ texts: string[] }>('api/translate', {
    method: 'POST',
    body: JSON.stringify({ texts: pending.map((index) => pairs[index]?.nl ?? '') }),
  });
  const texts = pairs.map((pair) => pair.en);
  pending.forEach((index, offset) => {
    texts[index] = result.texts[offset] ?? pairs[index]?.nl ?? '';
  });
  return { texts, changed: true };
}
