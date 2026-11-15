const RELEASES_URL = '/api/release-notes';
const MAX_BYTES = 2_000_000;
const MAX_NOTES = 30_000;

export type Release = {
  tag: string;
  title: string;
  date: string;
  body: string;
  truncated?: boolean;
};

type ParsedVersion = { numbers: bigint[]; pre: string[] | null };
export function parseVersion(value: string): ParsedVersion | null {
  const m =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      value,
    );
  if (!m || value.length > 100) return null;
  const pre = m[4] ? m[4].split('.') : null;
  if (pre?.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0')))
    return null;
  return { numbers: [BigInt(m[1]), BigInt(m[2]), BigInt(m[3])], pre };
}
export function compareVersions(a: string, b: string): number | null {
  const x = parseVersion(a),
    y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++)
    if (x.numbers[i] !== y.numbers[i]) return x.numbers[i] > y.numbers[i] ? 1 : -1;
  if (!x.pre || !y.pre) return x.pre === y.pre ? 0 : x.pre ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const left = x.pre[i],
      right = y.pre[i];
    if (left === undefined || right === undefined)
      return left === right ? 0 : left === undefined ? -1 : 1;
    if (left === right) continue;
    const ln = /^\d+$/.test(left),
      rn = /^\d+$/.test(right);
    if (ln && rn) return BigInt(left) > BigInt(right) ? 1 : -1;
    if (ln !== rn) return ln ? -1 : 1;
    return left > right ? 1 : -1;
  }
  return 0;
}

export function hasUpdate(currentTag: string | null, releases: Release[]): boolean {
  return (
    currentTag !== null &&
    releases.some((release) => compareVersions(release.tag, currentTag) === 1)
  );
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, entity: string) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? original;
    const number =
      entity[1]?.toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number)
      : original;
  });
}

/** Convert untrusted release HTML to plain text and Markdown links, without inserting it into the DOM. */
function plainNotes(html: string): string {
  return decodeEntities(
    html
      .replace(
        /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi,
        (_match, url: string, text: string) =>
          `[${text.replace(/<[^>]*>/g, '')}](${decodeEntities(url)})`,
      )
      .replace(/<h[1-6]\b[^>]*>/gi, '\n### ')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<br\s*\/?>|<\/(?:p|h[1-6]|li|ul|ol)>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  );
}

export function parseReleases(xml: string): Release[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid release feed');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'feed')
    throw new Error('Invalid release feed');
  return Array.from(document.getElementsByTagName('entry'))
    .slice(0, 20)
    .flatMap((entry) => {
      const link = entry.querySelector('link[rel="alternate"]')?.getAttribute('href');
      if (!link) return [];
      let tag: string;
      try {
        const url = new URL(link);
        const prefix = '/JhonatanMedeiros/homora/releases/tag/';
        if (
          url.origin !== 'https://github.com' ||
          !url.pathname.startsWith(prefix) ||
          url.search ||
          url.hash
        )
          return [];
        tag = decodeURIComponent(url.pathname.slice(prefix.length));
      } catch {
        return [];
      }
      const version = parseVersion(tag);
      const date = entry.getElementsByTagName('updated')[0]?.textContent ?? '';
      if (!version || version.pre || Number.isNaN(Date.parse(date))) return [];
      const html = entry.getElementsByTagName('content')[0]?.textContent ?? '';
      const body = plainNotes(html);
      const title = entry.getElementsByTagName('title')[0]?.textContent?.slice(0, 160) || tag;
      return [
        {
          tag,
          title,
          date,
          body: body.slice(0, MAX_NOTES),
          ...(body.length > MAX_NOTES || body.split('\n', 401).length > 400
            ? { truncated: true }
            : {}),
        },
      ];
    });
}

/** Read the same-origin feed; the backend owns the fixed outbound destination. */
export async function fetchReleases(
  signal: AbortSignal,
): Promise<{ releases: Release[]; demo: boolean }> {
  const response = await fetch(RELEASES_URL, {
    signal,
    redirect: 'error',
  });
  if (!response.ok || !response.body) throw new Error('Release list unavailable');
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_BYTES) throw new Error('Release list too large');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '',
    bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('Release list too large');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  const payload: unknown = JSON.parse(text);
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('feed' in payload) ||
    typeof payload.feed !== 'string' ||
    payload.feed.length > 512_000
  )
    throw new Error('Invalid release feed');
  return {
    releases: parseReleases(payload.feed),
    demo: 'demo' in payload && payload.demo === true,
  };
}
