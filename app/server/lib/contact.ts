import type { settings } from '../db/schema';
import { vcardFilename } from './vcf';

type Settings = typeof settings.$inferSelect;

export type ContactKind = 'email' | 'phone' | 'whatsapp' | 'instagram' | 'linkedin' | 'save';

export type ContactLink = {
  kind: ContactKind;
  href: string;
  label: string;
  downloadName?: string;
  rel?: string;
};

export function contactLinks(row: Settings, saveLabel: string): ContactLink[] {
  const links: ContactLink[] = [];
  const email = row.email.trim();
  const phone = row.phone.trim();
  const whatsapp = row.whatsapp.trim();
  const instagram = row.instagram.trim();
  const linkedin = row.linkedin.trim();

  if (email) links.push({ kind: 'email', href: `mailto:${email}`, label: email });
  if (phone) links.push({ kind: 'phone', href: `tel:${phone.replace(/[^\d+]/g, '')}`, label: phone });

  const whatsappHref = whatsappLink(whatsapp);
  if (whatsappHref) links.push({ kind: 'whatsapp', href: whatsappHref, label: 'WhatsApp', rel: 'noopener noreferrer' });

  const instagramHref = instagramLink(instagram);
  if (instagramHref) {
    links.push({
      kind: 'instagram',
      href: instagramHref,
      label: instagramLabel(instagram),
      rel: 'noopener noreferrer me',
    });
  }

  const linkedinHref = linkedinLink(linkedin);
  if (linkedinHref) links.push({ kind: 'linkedin', href: linkedinHref, label: 'LinkedIn', rel: 'noopener noreferrer me' });

  links.push({ kind: 'save', href: '/contact.vcf', label: saveLabel, downloadName: vcardFilename(row.siteName) });
  return links;
}

function whatsappLink(value: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return url.href;
    } catch {
      return null;
    }
  }
  const digits = value.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

function instagramLink(value: string): string | null {
  const handle = instagramHandle(value);
  if (handle) return `https://instagram.com/${handle}`;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

function instagramLabel(value: string): string {
  const handle = instagramHandle(value);
  return handle ? `@${handle}` : 'Instagram';
}

function instagramHandle(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const part = new URL(trimmed).pathname.split('/').find(Boolean) ?? '';
      return /^[\w.]+$/.test(part) ? part : null;
    } catch {
      return null;
    }
  }
  const handle = trimmed.replace(/^@/, '');
  return /^[\w.]+$/.test(handle) ? handle : null;
}

function linkedinLink(value: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, '').trim();
  if (!/^[\w-]+$/.test(handle)) return null;
  return `https://www.linkedin.com/in/${handle}`;
}
