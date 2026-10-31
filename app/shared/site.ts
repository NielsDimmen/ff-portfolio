import { z } from 'zod';
import { isLabelKey } from './labels';

const optionalText = (max: number) => z.string().trim().max(max).default('');

export const siteWriteSchema = z.object({
  siteName: z.string().trim().min(1, 'Naam is verplicht').max(80),
  taglineNl: optionalText(160),
  taglineEn: optionalText(160),
  email: optionalText(200).refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'E-mailadres klopt niet'),
  phone: optionalText(40),
  whatsapp: optionalText(40),
  instagram: optionalText(80).transform((value) => value.replace(/^@/, '')),
  linkedin: optionalText(120).transform((value) => value.replace(/^@/, '')),
  vcfName: optionalText(80),
  vcfCompany: optionalText(80),
  vcfTitle: optionalText(120),
});

export type SiteWrite = z.infer<typeof siteWriteSchema>;

export const pageWriteSchema = z.object({
  titleNl: z.string().trim().min(1, 'Titel (NL) is verplicht').max(120),
  titleEn: optionalText(120),
  bodyNl: z.string().max(20000).default(''),
  bodyEn: z.string().max(20000).default(''),
  published: z.boolean(),
});

export type PageWrite = z.infer<typeof pageWriteSchema>;

export type PageListItem = {
  id: number;
  slug: string;
  titleNl: string;
  titleEn: string;
  isSystem: boolean;
};

export type PageDetail = PageWrite & {
  id: number;
  slug: string;
  isSystem: boolean;
};

export const labelsWriteSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string().refine(isLabelKey, 'Onbekend tekstveld'),
        nl: z.string().trim().min(1, 'Nederlandse tekst is verplicht').max(200),
        en: optionalText(200),
      }),
    )
    .max(40),
});

export type LabelItem = {
  key: string;
  label: string;
  nl: string;
  en: string;
};
