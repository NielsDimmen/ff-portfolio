import { z } from 'zod';

export const projectWriteSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is verplicht')
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug mag alleen kleine letters, cijfers en streepjes bevatten'),
  titleNl: z.string().trim().min(1, 'Titel (NL) is verplicht').max(200),
  titleEn: z.string().trim().max(200).default(''),
  client: z.string().trim().max(200).default(''),
  location: z.string().trim().max(200).default(''),
  year: z.number().int().min(1900, 'Jaar moet tussen 1900 en 2100 liggen').max(2100).nullable().default(null),
  roleNl: z.string().trim().max(200).default(''),
  roleEn: z.string().trim().max(200).default(''),
  summaryNl: z.string().trim().max(400).default(''),
  summaryEn: z.string().trim().max(400).default(''),
  bodyNl: z.string().max(20000).default(''),
  bodyEn: z.string().max(20000).default(''),
  videoUrl: z.string().trim().max(500).default(''),
  published: z.boolean(),
  featured: z.boolean(),
  coverMediaId: z.number().int().positive().nullable().default(null),
  tagIds: z.array(z.number().int().positive()).max(40).default([]),
});

export type ProjectWrite = z.infer<typeof projectWriteSchema>;

export const tagWriteSchema = z.object({
  nameNl: z.string().trim().min(1, 'Naam (NL) is verplicht').max(80),
  nameEn: z.string().trim().max(80).default(''),
});

export type TagWrite = z.infer<typeof tagWriteSchema>;

export const focalSchema = z.object({
  focalX: z.number().min(0).max(1),
  focalY: z.number().min(0).max(1),
});

export type TagRecord = {
  id: number;
  slug: string;
  nameNl: string;
  nameEn: string;
};

export type ProjectListItem = {
  id: number;
  slug: string;
  titleNl: string;
  client: string;
  year: number | null;
  published: boolean;
  featured: boolean;
  coverMediaId: number | null;
};

export type GalleryItem = {
  id: number;
  mediaId: number;
};

export type ProjectDetail = ProjectWrite & {
  id: number;
  focalX: number;
  focalY: number;
  gallery: GalleryItem[];
};
