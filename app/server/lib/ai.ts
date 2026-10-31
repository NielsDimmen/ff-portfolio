import path from 'node:path';
import { env, pipeline, RawImage, type ObjectDetectionPipeline, type TranslationPipeline } from '@huggingface/transformers';
import type { Sharp } from 'sharp';

const TRANSLATION_MODEL = 'Xenova/nllb-200-distilled-600M';
const DETECTOR_MODEL = 'Xenova/yolos-tiny';

let readyDir = '';
let translatorPromise: Promise<TranslationPipeline> | null = null;
let detectorPromise: Promise<ObjectDetectionPipeline> | null = null;

export class AiError extends Error {}

/** Dutch paragraphs to English. Empty strings stay empty. */
export async function translateToEnglish(dataDir: string, texts: string[]): Promise<string[]> {
  const translator = await loadTranslator(dataDir);
  const translated: string[] = [];
  for (const text of texts) {
    translated.push(await translateOne(translator, text));
  }
  return translated;
}

/** Where a cover crop should sit: on the people, not on a spotlight. */
export async function findFocalPoint(dataDir: string, image: Sharp): Promise<{ focalX: number; focalY: number }> {
  const preview = image.clone().resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).removeAlpha();
  const { data, info } = await preview.raw().toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height) return { focalX: 0.5, focalY: 0.5 };

  try {
    const detector = await loadDetector(dataDir);
    const raw = new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
    const found = await detector(raw, { threshold: 0.3, percentage: true });
    const people = found.filter((item) => item.label.toLowerCase() === 'person');
    const focal = focusOnPeople(people.map((item) => item.box));
    if (focal) return focal;
  } catch (error) {
    console.error('[portfolio] person detection failed', error);
  }

  return focusOnDetail(data, info.width, info.height);
}

function prepare(dataDir: string) {
  const cacheDir = path.join(dataDir, 'models');
  if (readyDir === cacheDir) return;
  env.cacheDir = cacheDir;
  readyDir = cacheDir;
  translatorPromise = null;
  detectorPromise = null;
}

function loadTranslator(dataDir: string): Promise<TranslationPipeline> {
  prepare(dataDir);
  translatorPromise ??= pipeline('translation', TRANSLATION_MODEL, { dtype: 'q8' }).catch((error: unknown) => {
    translatorPromise = null;
    console.error('[portfolio] translation model failed', error);
    throw new AiError('Vertalen lukt nu niet. Probeer het zo nog eens.');
  });
  return translatorPromise;
}

function loadDetector(dataDir: string): Promise<ObjectDetectionPipeline> {
  prepare(dataDir);
  detectorPromise ??= pipeline('object-detection', DETECTOR_MODEL, { dtype: 'q8' }).catch((error: unknown) => {
    detectorPromise = null;
    throw error;
  });
  return detectorPromise;
}

async function translateOne(translator: TranslationPipeline, text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const parts = trimmed.split(/\n{2,}/);
  const translated = [];
  for (const part of parts) {
    const chunks = splitChunk(part.replace(/\s+/g, ' ').trim(), 420);
    const pieces = [];
    for (const chunk of chunks) {
      const output = await translator(chunk, { src_lang: 'nld_Latn', tgt_lang: 'eng_Latn', max_new_tokens: 256 });
      const value = output[0]?.translation_text?.trim();
      pieces.push(value || chunk);
    }
    translated.push(pieces.join(' '));
  }
  return translated.join('\n\n');
}

function splitChunk(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > max) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text.slice(0, max)];
}

type Box = { xmin: number; ymin: number; xmax: number; ymax: number };

function focusOnPeople(boxes: Box[]): { focalX: number; focalY: number } | null {
  const usable = boxes
    .map(normalizeBox)
    .filter((box) => box.xmax > box.xmin && box.ymax > box.ymin);
  if (!usable.length) return null;
  const onStage = usable.filter((box) => box.ymin < 0.78);
  const chosen = onStage.length ? onStage : usable;
  let weight = 0;
  let x = 0;
  let y = 0;
  for (const box of chosen) {
    const area = (box.xmax - box.xmin) * (box.ymax - box.ymin);
    const cx = (box.xmin + box.xmax) / 2;
    const cy = box.ymin + (box.ymax - box.ymin) * 0.35;
    x += cx * area;
    y += cy * area;
    weight += area;
  }
  if (!weight) return null;
  return { focalX: clamp(x / weight), focalY: clamp(y / weight) };
}

function normalizeBox(box: Box): Box {
  const percent = box.xmax > 1.5 || box.ymax > 1.5 || box.xmin > 1.5 || box.ymin > 1.5;
  if (!percent) return box;
  return { xmin: box.xmin / 100, ymin: box.ymin / 100, xmax: box.xmax / 100, ymax: box.ymax / 100 };
}

/** Contrast-weighted center, used when no people are found. Bright spots count less than detail. */
function focusOnDetail(data: Buffer, width: number, height: number): { focalX: number; focalY: number } {
  const cols = 36;
  const rows = 36;
  let weight = 0;
  let x = 0;
  let y = 0;
  for (let row = 1; row < rows - 1; row += 1) {
    for (let col = 1; col < cols - 1; col += 1) {
      const luma = sample(data, width, height, col / cols, row / rows);
      const neighbors = [
        sample(data, width, height, (col - 1) / cols, row / rows),
        sample(data, width, height, (col + 1) / cols, row / rows),
        sample(data, width, height, col / cols, (row - 1) / rows),
        sample(data, width, height, col / cols, (row + 1) / rows),
      ];
      const contrast = neighbors.reduce((sum, value) => sum + Math.abs(value - luma), 0) / neighbors.length;
      const notBlown = 1 - Math.max(0, (luma - 0.82) / 0.18);
      const score = contrast * Math.max(0.15, notBlown);
      weight += score;
      x += (col / (cols - 1)) * score;
      y += (row / (rows - 1)) * score;
    }
  }
  if (weight < 0.01) return { focalX: 0.5, focalY: 0.5 };
  return { focalX: clamp(x / weight), focalY: clamp(y / weight) };
}

function sample(data: Buffer, width: number, height: number, x: number, y: number): number {
  const px = Math.min(width - 1, Math.max(0, Math.round(x * (width - 1))));
  const py = Math.min(height - 1, Math.max(0, Math.round(y * (height - 1))));
  const index = (py * width + px) * 3;
  const red = data[index] ?? 0;
  const green = data[index + 1] ?? 0;
  const blue = data[index + 2] ?? 0;
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.92, Math.max(0.08, value));
}
