export const MAX_FEED_BYTES = 512 * 1024;
const MAX_XML_DEPTH = 32;
const MAX_XML_ELEMENTS = 5000;
const MAX_TEXT_LENGTH = 64 * 1024;
const MAX_ENTRY_TITLE_LENGTH = 300;
const MAX_FEED_TITLE_LENGTH = 120;

export type ParsedFeedEntry = {
  id: string;
  title: string;
  link: string | null;
  publishedAt: number | null;
};

export type ParsedFeed = {
  feedTitle: string | null;
  entries: ParsedFeedEntry[];
};

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedParseError';
  }
}

type XmlNode = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
};

const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
};

function decodeEntities(input: string): string {
  return input.replaceAll(/&(#x[\da-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,10});/g, (m, ref) => {
    if (ref.startsWith('#x') || ref.startsWith('#X')) {
      const code = Number.parseInt(ref.slice(2), 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    if (ref.startsWith('#')) {
      const code = Number.parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? m;
  });
}

/** Strip HTML/XML markup and normalize whitespace to safe plain text. */
export function stripMarkupToPlainText(raw: string, maxLength = MAX_ENTRY_TITLE_LENGTH): string {
  if (!raw) return '';
  const decoded = decodeEntities(raw);
  const withoutBlocks = decoded
    .replaceAll(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replaceAll(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const stripped = withoutBlocks.replaceAll(/<[^>]*>/g, ' ');
  const collapsed = decodeEntities(stripped).replaceAll(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Validate entry links to allow only http: and https: URLs without embedded credentials. */
export function sanitizeFeedLink(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = decodeEntities(raw).trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let index = 0;
  const len = raw.length;
  while (index < len) {
    while (index < len && /\s/.test(raw[index]!)) index++;
    if (index >= len || raw[index] === '/') break;
    const nameStart = index;
    while (index < len && !/[\s=/>]/.test(raw[index]!)) index++;
    const name = raw.slice(nameStart, index).toLowerCase();
    while (index < len && /\s/.test(raw[index]!)) index++;
    if (raw[index] !== '=') {
      if (name) attrs[name] = '';
      continue;
    }
    index++; // skip '='
    while (index < len && /\s/.test(raw[index]!)) index++;
    let value: string;
    const quote = raw[index];
    if (quote === '"' || quote === "'") {
      index++;
      const valStart = index;
      while (index < len && raw[index] !== quote) index++;
      value = raw.slice(valStart, index);
      if (index < len) index++;
    } else {
      const valStart = index;
      while (index < len && !/[\s/>]/.test(raw[index]!)) index++;
      value = raw.slice(valStart, index);
    }
    if (name) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

function localTagName(rawName: string): string {
  const lower = rawName.toLowerCase();
  if (lower === 'dc:date') return lower;
  const colon = lower.indexOf(':');
  return colon >= 0 ? lower.slice(colon + 1) : lower;
}

/** Iterative, bounded XML parser that rejects DOCTYPE subsets and ENTITY declarations. */
function parseBoundedXml(xml: string): XmlNode {
  if (typeof xml !== 'string' || !xml.trim()) throw new FeedParseError('Empty feed.');
  if (new TextEncoder().encode(xml).byteLength > MAX_FEED_BYTES)
    throw new FeedParseError('Feed exceeds size limit.');

  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let elementCount = 0;
  let index = 0;
  const len = xml.length;

  const appendText = (chunk: string) => {
    const current = stack.at(-1)!;
    if (current.text.length < MAX_TEXT_LENGTH) {
      current.text += chunk.slice(0, MAX_TEXT_LENGTH - current.text.length);
    }
  };

  while (index < len) {
    const lt = xml.indexOf('<', index);
    if (lt === -1) {
      appendText(xml.slice(index));
      break;
    }
    if (lt > index) appendText(xml.slice(index, lt));

    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end === -1) throw new FeedParseError('Unterminated XML comment.');
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end === -1) throw new FeedParseError('Unterminated CDATA section.');
      appendText(xml.slice(lt + 9, end));
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end === -1) throw new FeedParseError('Unterminated processing instruction.');
      index = end + 2;
      continue;
    }
    if (xml.startsWith('<!', lt)) {
      const declSlice = xml.slice(lt, Math.min(len, lt + 32)).toUpperCase();
      if (declSlice.startsWith('<!ENTITY'))
        throw new FeedParseError('XML entity declarations are not allowed.');
      if (declSlice.startsWith('<!DOCTYPE')) {
        const gt = xml.indexOf('>', lt + 9);
        if (gt === -1) throw new FeedParseError('Unterminated DOCTYPE declaration.');
        const doctypeBody = xml.slice(lt, gt + 1);
        if (/\[|\bSYSTEM\b|\bPUBLIC\b|<!ENTITY/i.test(doctypeBody))
          throw new FeedParseError('External or internal DTD subsets are not allowed.');
        index = gt + 1;
        continue;
      }
      throw new FeedParseError('Unsupported XML declaration.');
    }

    const gt = xml.indexOf('>', lt + 1);
    if (gt === -1) throw new FeedParseError('Unterminated XML tag.');
    const rawTag = xml.slice(lt + 1, gt).trim();
    index = gt + 1;
    if (!rawTag) throw new FeedParseError('Empty XML tag.');

    if (rawTag.startsWith('/')) {
      const closeName = localTagName(rawTag.slice(1).trim());
      if (stack.length <= 1) throw new FeedParseError('Unexpected closing XML tag.');
      const top = stack.at(-1)!;
      if (top.name === closeName) {
        stack.pop();
      } else {
        // Recover gracefully if an unclosed optional tag was skipped, as long as an ancestor matches.
        let matchIdx = -1;
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i]!.name === closeName) {
            matchIdx = i;
            break;
          }
        }
        if (matchIdx === -1) throw new FeedParseError('Mismatched closing XML tag.');
        stack.length = matchIdx;
      }
      continue;
    }

    const selfClosing = rawTag.endsWith('/');
    const tagContent = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const spaceIdx = tagContent.search(/\s/);
    const rawName = spaceIdx === -1 ? tagContent : tagContent.slice(0, spaceIdx);
    const attrString = spaceIdx === -1 ? '' : tagContent.slice(spaceIdx + 1);
    const name = localTagName(rawName);
    if (!name) throw new FeedParseError('Invalid XML tag name.');

    elementCount++;
    if (elementCount > MAX_XML_ELEMENTS)
      throw new FeedParseError('Feed exceeds maximum element count.');
    if (stack.length >= MAX_XML_DEPTH)
      throw new FeedParseError('Feed exceeds maximum nesting depth.');

    const node: XmlNode = {
      name,
      attrs: attrString ? parseAttributes(attrString) : {},
      children: [],
      text: '',
    };
    stack.at(-1)!.children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root;
}

function childText(node: XmlNode, name: string): string {
  const child = node.children.find((c) => c.name === name);
  if (!child) return '';
  if (child.text) return child.text;
  return collectText(child);
}

function collectText(node: XmlNode): string {
  if (node.children.length === 0) return node.text;
  let out = node.text;
  for (const child of node.children) {
    out += ` ${collectText(child)}`;
  }
  return out;
}

function parseTimestamp(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const parsed = Date.parse(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRssChannel(channel: XmlNode): ParsedFeed {
  const rawTitle = stripMarkupToPlainText(childText(channel, 'title'), MAX_FEED_TITLE_LENGTH);
  const feedTitle = rawTitle || null;
  const entries: ParsedFeedEntry[] = [];
  const items = channel.children.filter((c) => c.name === 'item');
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const title = stripMarkupToPlainText(childText(item, 'title'));
    const rawLink = childText(item, 'link');
    const guidNode = item.children.find((c) => c.name === 'guid');
    const guidLink =
      guidNode && guidNode.attrs.ispermalink !== 'false' ? collectText(guidNode) : '';
    const link = sanitizeFeedLink(rawLink) ?? sanitizeFeedLink(guidLink);
    if (!title && !link) continue;
    const pubDate = childText(item, 'pubdate') || childText(item, 'dc:date');
    const publishedAt = parseTimestamp(pubDate);
    const guid = guidNode ? stripMarkupToPlainText(collectText(guidNode), 200) : '';
    entries.push({
      id: guid || link || `rss-${i}-${title.slice(0, 32)}`,
      title: title || link || '',
      link,
      publishedAt,
    });
  }
  return { feedTitle, entries };
}

function parseAtomFeed(feed: XmlNode): ParsedFeed {
  const rawTitle = stripMarkupToPlainText(childText(feed, 'title'), MAX_FEED_TITLE_LENGTH);
  const feedTitle = rawTitle || null;
  const entries: ParsedFeedEntry[] = [];
  const atomEntries = feed.children.filter((c) => c.name === 'entry');
  for (let i = 0; i < atomEntries.length; i++) {
    const entry = atomEntries[i]!;
    const title = stripMarkupToPlainText(childText(entry, 'title'));
    const linkNodes = entry.children.filter((c) => c.name === 'link');
    const alternateLink = linkNodes.find(
      (l) => !l.attrs.rel || l.attrs.rel.toLowerCase() === 'alternate',
    );
    const link =
      sanitizeFeedLink(alternateLink?.attrs.href) ??
      linkNodes.map((l) => sanitizeFeedLink(l.attrs.href)).find((l) => l !== null) ??
      null;
    if (!title && !link) continue;
    const publishedRaw = childText(entry, 'published') || childText(entry, 'updated');
    const publishedAt = parseTimestamp(publishedRaw);
    const idText = stripMarkupToPlainText(childText(entry, 'id'), 200);
    entries.push({
      id: idText || link || `atom-${i}-${title.slice(0, 32)}`,
      title: title || link || '',
      link,
      publishedAt,
    });
  }
  return { feedTitle, entries };
}

/** Parse RSS 2.0 or Atom 1.0 XML into sanitized, newest-first entries. */
export function parseFeedXml(xml: string, limit = 10): ParsedFeed {
  const root = parseBoundedXml(xml);
  const top = root.children[0];
  if (!top) throw new FeedParseError('Missing root XML element.');

  let parsed: ParsedFeed;
  if (top.name === 'rss') {
    const channel = top.children.find((c) => c.name === 'channel');
    if (!channel) throw new FeedParseError('RSS feed is missing <channel>.');
    parsed = parseRssChannel(channel);
  } else if (top.name === 'feed') {
    parsed = parseAtomFeed(top);
  } else {
    throw new FeedParseError('Unsupported feed format. Expected RSS 2.0 or Atom 1.0.');
  }

  const cappedLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
  const sorted = parsed.entries
    .map((entry, idx) => ({ entry, idx }))
    .sort((a, b) => {
      const ta = a.entry.publishedAt;
      const tb = b.entry.publishedAt;
      if (ta !== null && tb !== null) return tb - ta || a.idx - b.idx;
      if (ta !== null) return -1;
      if (tb !== null) return 1;
      return a.idx - b.idx;
    })
    .slice(0, cappedLimit)
    .map(({ entry }) => entry);

  return {
    feedTitle: parsed.feedTitle,
    entries: sorted,
  };
}
