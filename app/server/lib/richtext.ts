type Mark = { type?: string; attrs?: Record<string, unknown> };
type Node = {
  type?: string;
  text?: string;
  content?: Node[];
  marks?: Mark[];
  attrs?: Record<string, unknown>;
};

const EMPTY = '';

export function richTextToHtml(stored: string): string {
  const doc = parseDoc(stored);
  if (!doc) return EMPTY;
  return renderNode(doc);
}

/** Plain text from the CMS, stored as TipTap JSON. Blank lines start a new paragraph. */
export function textToDoc(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph.replace(/\n/g, ' ') }],
    })),
  });
}

/** Inverse of textToDoc, for the project form. */
export function docToPlain(stored: string): string {
  const doc = parseDoc(stored);
  if (!doc) return '';
  const paragraphs: string[] = [];
  const visit = (node: Node) => {
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'blockquote') {
      const text = collectText(node).trim();
      if (text) paragraphs.push(text);
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(doc);
  return paragraphs.join('\n\n');
}

function collectText(node: Node): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(collectText).join('');
}

export function richTextIsEmpty(stored: string): boolean {
  const doc = parseDoc(stored);
  if (!doc) return true;
  return !hasVisible(doc);
}

function parseDoc(stored: string): Node | null {
  const trimmed = stored.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Node;
  } catch {
    return null;
  }
}

function hasVisible(node: Node): boolean {
  if (node.type === 'text' && (node.text ?? '').trim()) return true;
  if (node.type === 'image' && safeMediaSrc(node.attrs?.src)) return true;
  return (node.content ?? []).some(hasVisible);
}

function renderNode(node: Node): string {
  if (node.type === 'text') return renderText(node);
  const inner = (node.content ?? []).map(renderNode).join('');
  switch (node.type) {
    case 'doc':
      return inner;
    case 'paragraph':
      return inner ? `<p>${inner}</p>` : '';
    case 'heading':
      return inner ? `<h${headingLevel(node)}>${inner}</h${headingLevel(node)}>` : '';
    case 'bulletList':
      return inner ? `<ul>${inner}</ul>` : '';
    case 'orderedList':
      return inner ? `<ol>${inner}</ol>` : '';
    case 'listItem':
      return `<li>${inner}</li>`;
    case 'blockquote':
      return inner ? `<blockquote>${inner}</blockquote>` : '';
    case 'hardBreak':
      return '<br>';
    case 'image': {
      const src = safeMediaSrc(node.attrs?.src);
      if (!src) return '';
      const alt = typeof node.attrs?.alt === 'string' ? escapeHtml(node.attrs.alt) : '';
      return `<img src="${escapeHtml(src)}" alt="${alt}">`;
    }
    default:
      return inner;
  }
}

function renderText(node: Node): string {
  let html = escapeHtml(node.text ?? '');
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') html = `<strong>${html}</strong>`;
    else if (mark.type === 'italic') html = `<em>${html}</em>`;
    else if (mark.type === 'link') {
      const href = typeof mark.attrs?.href === 'string' ? safeHref(mark.attrs.href) : null;
      if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
    }
  }
  return html;
}

function headingLevel(node: Node): 2 | 3 | 4 {
  const level = node.attrs?.level;
  if (level === 1 || level === 2) return 2;
  if (level === 3) return 3;
  return 4;
}

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:' || url.protocol === 'tel:') {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

function safeMediaSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/media/') || value.includes('..') || value.includes('\\') || value.includes(' ')) {
    return null;
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
