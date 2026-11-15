/** Azure DevOps stores Description and comments as HTML; these helpers move between HTML and plain text. */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}

function decodeEntities(value: string) {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1].toLowerCase() === 'x'
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

/** Plain-text view of Azure HTML: line breaks kept, tags dropped, entities decoded. */
export function htmlToText(html: string | null | undefined) {
  if (!html) return '';
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Text typed in Roadmap → Azure HTML: blank lines split paragraphs, single newlines become <br>. */
export function textToHtml(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<div>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</div>`,
    )
    .join('');
}

const PLAIN_TAGS = new Set(['p', 'div', 'br', 'span']);

/**
 * True when the HTML has only bare paragraphs and line breaks, so editing it as text loses nothing.
 * Lists, links, images, tables or any styled tag make the description read-only in Roadmap.
 */
export function isPlainHtml(html: string | null | undefined) {
  if (!html) return true;
  for (const match of html.matchAll(/<\/?\s*([a-z0-9]+)([^>]*)>/gi)) {
    const [, tag, attributes] = match;
    if (!PLAIN_TAGS.has(tag.toLowerCase())) return false;
    if (attributes.replace('/', '').trim()) return false;
  }
  return true;
}
