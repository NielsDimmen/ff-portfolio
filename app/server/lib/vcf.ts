import type { settings } from '../db/schema';

type Settings = typeof settings.$inferSelect;

export function renderVcard(row: Settings): string {
  const fn = row.vcfName.trim() || row.siteName.trim() || 'ff dimmen';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVcard(fn)}`, `N:${nameField(fn)}`];

  if (row.vcfCompany.trim()) lines.push(`ORG:${escapeVcard(row.vcfCompany.trim())}`);
  if (row.vcfTitle.trim()) lines.push(`TITLE:${escapeVcard(row.vcfTitle.trim())}`);
  if (row.email.trim()) lines.push(`EMAIL;TYPE=INTERNET:${escapeVcard(row.email.trim())}`);
  if (row.phone.trim()) lines.push(`TEL;TYPE=VOICE:${escapeVcard(row.phone.trim())}`);
  if (row.whatsapp.trim()) lines.push(`TEL;TYPE=CELL:${escapeVcard(row.whatsapp.trim())}`);

  const instagram = instagramUrl(row.instagram.trim());
  if (instagram) lines.push(`URL:${instagram}`);
  const linkedin = linkedinUrl(row.linkedin.trim());
  if (linkedin) lines.push(`URL:${linkedin}`);

  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}

export function vcardFilename(siteName: string): string {
  const slug = siteName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'contact'}.vcf`;
}

function nameField(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const given = parts[0] ?? '';
  if (parts.length < 2) return `;${escapeVcard(given)};;;`;
  const family = parts[parts.length - 1] ?? '';
  const rest = parts.slice(0, -1).join(' ');
  return `${escapeVcard(family)};${escapeVcard(rest)};;;`;
}

function escapeVcard(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\n|\r/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function instagramUrl(value: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, '');
  return handle ? `https://instagram.com/${handle}` : null;
}

function linkedinUrl(value: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://www.linkedin.com/in/${value.replace(/^@/, '')}`;
}
