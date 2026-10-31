// Literal port of mixSlides / spread / rotateSeam from app/server/public/content.ts.
// Math.random is replaced by the same LCG the Swift checker uses, so the orders can be diffed.

const seed = Number(process.argv[2]);
const slides = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(process.argv[3], 'utf8')));

let state = seed >>> 0;
function mathRandom() {
  state = (Math.imul(1664525, state) + 1013904223) >>> 0;
  return state / 4294967296;
}

function mixSlides(input) {
  const groups = new Map();
  for (const slide of input) {
    const group = groups.get(slide.projectId) ?? [];
    group.push(slide);
    groups.set(slide.projectId, group);
  }
  const pools = [...groups.values()]
    .map((group) => shuffle(group))
    .sort((a, b) => b.length - a.length);
  return rotateSeam(spread(pools));
}

function spread(groups) {
  const primary = groups[0];
  if (!primary) return [];
  const rest = groups.slice(1);
  if (rest.length === 0) return primary;
  const separators = spread(rest);
  const gaps = Math.max(separators.length, 1);
  const base = Math.floor(primary.length / gaps);
  const extra = primary.length % gaps;
  const extraGaps = new Set(shuffle([...Array(gaps).keys()]).slice(0, extra));
  const result = [];
  let cursor = 0;
  for (let gap = 0; gap < gaps; gap += 1) {
    const count = base + (extraGaps.has(gap) ? 1 : 0);
    for (let step = 0; step < count; step += 1) {
      const photo = primary[cursor];
      cursor += 1;
      if (photo) result.push(photo);
    }
    const separator = separators[gap];
    if (separator) result.push(separator);
  }
  return result;
}

function rotateSeam(items) {
  if (items.length < 2) return items;
  const seams = [];
  for (let index = 0; index < items.length; index += 1) {
    const current = items[index];
    const next = items[(index + 1) % items.length];
    if (current && next && current.projectId !== next.projectId) seams.push(index);
  }
  if (seams.length === 0) return items;
  const seam = seams[Math.floor(mathRandom() * seams.length)];
  if (seam === undefined) return items;
  const start = (seam + 1) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(mathRandom() * (index + 1));
    const current = copy[index];
    const other = copy[swap];
    if (current === undefined || other === undefined) continue;
    copy[index] = other;
    copy[swap] = current;
  }
  return copy;
}

const mixed = mixSlides(slides);
process.stdout.write(mixed.map((slide) => `${slide.id}:${slide.projectId}`).join(' ') + '\n');
