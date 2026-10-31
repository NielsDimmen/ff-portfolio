export const CSV_COLUMNS = [
  'titel_nl',
  'titel_en',
  'klant',
  'locatie',
  'jaar',
  'rol_nl',
  'rol_en',
  'kort_nl',
  'kort_en',
  'tekst_nl',
  'tekst_en',
  'video',
  'tags',
] as const;

export const CLAUDE_PROJECT_PROMPT = `Maak één CSV-regel voor een project op de site van ff dimmen. Geen uitleg, geen kopregel, alleen die ene regel.

Kolommen, in deze volgorde, gescheiden door een komma:
${CSV_COLUMNS.join(',')}

Regels voor de regel:
- Zet een veld tussen "dubbele aanhalingstekens" als er een komma in staat. Een aanhalingsteken in de tekst schrijf je als "".
- Een nieuwe alinea in tekst_nl of tekst_en schrijf je als \\n\\n, zodat de hele regel op één lijn blijft.
- titel_nl is verplicht. titel_en is dezelfde titel in het Engels.
- jaar is een jaartal zoals 2025, of leeg.
- kort_nl en kort_en zijn één korte zin, hooguit 400 tekens.
- video is een YouTube- of Vimeo-link, of leeg.
- tags zijn namen gescheiden door een |. Gebruik een bestaande tag als die past: Follow-Me, Licht, LED, Media server, Netwerk, AV.

Toon van de teksten:
- Nederlands, informeel, korte zinnen achter elkaar. "we"-vorm. Klanten zijn "jullie".
- Geen opsomming van apparatuur of merknamen. Geen emoji.
- Engels in dezelfde toon, geen kromme letterlijke vertaling.

Het project:
`;

export type CsvProject = {
  titleNl: string;
  titleEn: string;
  client: string;
  location: string;
  year: number | null;
  roleNl: string;
  roleEn: string;
  summaryNl: string;
  summaryEn: string;
  bodyNl: string;
  bodyEn: string;
  videoUrl: string;
  tags: string[];
};

export function parseProjectCsv(input: string): CsvProject {
  const rows = parseRecords(input);
  const first = rows[0];
  if (!first) throw new Error('Plak een CSV-regel.');
  const header = first.map((cell) => cell.trim().toLowerCase());
  const data = header[0] === 'titel_nl' ? rows[1] : first;
  if (!data) throw new Error('Onder de kopregel mist de projectregel.');
  if (data.length > CSV_COLUMNS.length) {
    throw new Error(`Te veel kolommen. Gebruik deze volgorde: ${CSV_COLUMNS.join(', ')}.`);
  }
  const cell = (index: number) => unescapeCell(data[index] ?? '');
  const titleNl = cell(0);
  const titleEn = cell(1);
  const client = cell(2);
  const location = cell(3);
  const yearText = cell(4);
  const roleNl = cell(5);
  const roleEn = cell(6);
  const summaryNl = cell(7);
  const summaryEn = cell(8);
  const bodyNl = cell(9);
  const bodyEn = cell(10);
  const videoUrl = cell(11);
  const tags = cell(12);
  if (!titleNl.trim()) throw new Error('titel_nl is leeg.');
  checkLength('titel_nl', titleNl, 200);
  checkLength('titel_en', titleEn, 200);
  checkLength('klant', client, 200);
  checkLength('locatie', location, 200);
  checkLength('rol_nl', roleNl, 200);
  checkLength('rol_en', roleEn, 200);
  checkLength('kort_nl', summaryNl, 400);
  checkLength('kort_en', summaryEn, 400);
  checkLength('tekst_nl', bodyNl, 20000);
  checkLength('tekst_en', bodyEn, 20000);
  checkLength('video', videoUrl, 500);
  return {
    titleNl: titleNl.trim(),
    titleEn: titleEn.trim(),
    client: client.trim(),
    location: location.trim(),
    year: parseYear(yearText.trim()),
    roleNl: roleNl.trim(),
    roleEn: roleEn.trim(),
    summaryNl: summaryNl.trim(),
    summaryEn: summaryEn.trim(),
    bodyNl: bodyNl.trim(),
    bodyEn: bodyEn.trim(),
    videoUrl: videoUrl.trim(),
    tags: tags
      .split('|')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 40),
  };
}

function checkLength(name: string, value: string, max: number) {
  if (value.trim().length > max) throw new Error(`${name} is te lang (maximaal ${max} tekens).`);
}

function parseYear(value: string): number | null {
  if (!value) return null;
  if (!/^\d{4}$/.test(value)) throw new Error('jaar moet een jaartal zijn, zoals 2025.');
  const year = Number(value);
  if (year < 1900 || year > 2100) throw new Error('jaar moet tussen 1900 en 2100 liggen.');
  return year;
}

function unescapeCell(value: string): string {
  return value.replace(/\\n/g, '\n');
}

function parseRecords(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  const delimiter = chooseDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  return rows;
}

function chooseDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === ',') commas += 1;
    if (char === ';') semicolons += 1;
    if (char === '\n') break;
  }
  return semicolons > commas ? ';' : ',';
}
