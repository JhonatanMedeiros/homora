import { OPEN_TARGETS, type OpenTarget } from './services.js';

/**
 * Extra addresses of a service ("Links" menu): the same service reached another way, such as the
 * LAN IP when the domain is down. The main URL stays on the service itself; these are additional,
 * ordered, never monitored.
 */
export const SERVICE_LINKS_MAX = 10;
export const LINK_NAME_MAX = 80;
export const LINK_URL_MAX = 2048;

/** Link types are shared by every service and created by the user (name and color). */
export const LINK_TYPES_MAX = 20;
export const LINK_TYPE_NAME_MAX = 24;
/** No red: it is reserved for status. */
export const LINK_COLORS = [
  'neutral',
  'ember',
  'green',
  'blue',
  'violet',
  'pink',
  'teal',
  'yellow',
] as const;
export type LinkColor = (typeof LINK_COLORS)[number];
export const isLinkColor = (value: unknown): value is LinkColor =>
  typeof value === 'string' && (LINK_COLORS as readonly string[]).includes(value);

export type LinkType = { id: number; name: string; color: LinkColor };
/** A link type with how many addresses use it, for the editor. */
export type LinkTypeUsage = LinkType & { uses: number };

/** What the form sends for one extra address. `typeId` and `openTarget` null mean "none"/"service default". */
export type ServiceLinkInput = {
  url: string;
  name?: string;
  typeId?: number | null;
  openTarget?: OpenTarget | null;
};
/** An extra address as the API returns it. */
export type ServiceLink = {
  id: number;
  url: string;
  name: string;
  openTarget: OpenTarget | null;
  type: LinkType | null;
};

/** The suggested names offered before the user has created any type of their own. */
export const SUGGESTED_LINK_TYPES: readonly { key: string; color: LinkColor }[] = [
  { key: 'public', color: 'blue' },
  { key: 'lan', color: 'green' },
  { key: 'admin', color: 'ember' },
  { key: 'docs', color: 'neutral' },
];

/** A trimmed type name of 1 to 24 characters without control characters, or `null`. */
export function normalizeLinkTypeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  // eslint-disable-next-line no-control-regex
  if (name.length < 1 || name.length > LINK_TYPE_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name))
    return null;
  return name;
}

/** Type names are unique ignoring case. */
export const sameLinkTypeName = (a: string, b: string) =>
  a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** Same policy as the main URL: HTTP or HTTPS, no credentials. Returns the normalized URL or `null`. */
export function normalizeLinkUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > LINK_URL_MAX) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  return url.href.length > LINK_URL_MAX ? null : url.href;
}

/** A link name: trimmed, up to 80 characters, no control characters; `null` when invalid. */
export function normalizeLinkName(value: unknown): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const name = value.trim();
  // eslint-disable-next-line no-control-regex
  if (name.length > LINK_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export type ValidLinkInput = {
  url: string;
  name: string;
  typeId: number | null;
  openTarget: OpenTarget | null;
};

/**
 * Validates the extra addresses of one service. Returns `null` when any item is invalid or there
 * are too many, so nothing is saved partially. Duplicates are allowed on purpose.
 */
export function validateServiceLinks(input: unknown): ValidLinkInput[] | null {
  if (!Array.isArray(input) || input.length > SERVICE_LINKS_MAX) return null;
  const links: ValidLinkInput[] = [];
  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) return null;
    const item = raw as Record<string, unknown>;
    const url = normalizeLinkUrl(item.url);
    const name = normalizeLinkName(item.name);
    if (url === null || name === null) return null;
    const typeId = item.typeId ?? null;
    if (
      typeId !== null &&
      (typeof typeId !== 'number' || !Number.isSafeInteger(typeId) || typeId < 1)
    )
      return null;
    const openTarget = item.openTarget ?? null;
    if (openTarget !== null && !OPEN_TARGETS.some((target) => target === openTarget)) return null;
    links.push({ url, name, typeId, openTarget: openTarget as OpenTarget | null });
  }
  return links;
}

/** What an address is called in menus: its own name, else its type, else its host. */
export function linkLabel(link: Pick<ServiceLink, 'name' | 'url' | 'type'>): string {
  if (link.name) return link.name;
  if (link.type) return link.type.name;
  try {
    return new URL(link.url).host;
  } catch {
    return link.url;
  }
}

/** How a link opens: its own choice, else the service's, else a new tab. */
export const linkOpenTarget = (
  service: { openTarget?: OpenTarget },
  link: { openTarget: OpenTarget | null },
): OpenTarget => link.openTarget ?? service.openTarget ?? 'new-tab';
