import type { settings } from '../db/schema';
import { ui, type Lang } from './i18n';
import { vcardFilename } from './vcf';

type Settings = typeof settings.$inferSelect;

export type ContactLink = {
  href: string;
  label: string;
  downloadName?: string;
  rel?: string;
};

export function contactLinks(row: Settings, lang: Lang): ContactLink[] {
  const links: ContactLink[] = [];
  const email = row.email.trim();
  const phone = row.phone.trim();
  const whatsapp = row.whatsapp.trim();
  const instagram = row.instagram.trim();
  const linkedin = row.linkedin.trim();

  if (email) links.push({ href: `mailto:${email}`, label: email });
  if (phone) links.push({ href: `tel:${phone.replace(/[^\d+]/g, '')}`, label: phone });

  const whatsappHref = whatsappLink(whatsapp);
  if (whatsappHref) links.push({ href: whatsappHref, label: 'WhatsApp' });

  const instagramHref = instagramLink(instagram);
  if (instagramHref) links.push({ href: instagramHref, label: 'Instagram', rel: 'me' });

  const linkedinHref = linkedinLink(linkedin);
  if (linkedinHref) links.push({ href: linkedinHref, label: 'LinkedIn', rel: 'me' });

  links.push({ href: '/contact.vcf', label: ui[lang].saveContact, downloadName: vcardFilename(row.siteName) });
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
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, '').trim();
  if (!/^[\w.]+$/.test(handle)) return null;
  return `https://instagram.com/${handle}`;
}

function linkedinLink(value: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, '').trim();
  if (!/^[\w-]+$/.test(handle)) return null;
  return `https://www.linkedin.com/in/${handle}`;
}
