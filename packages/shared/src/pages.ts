import { hasControlChars } from '@homora/utils';

/** Pages are the tabs of the Home. Every group lives on exactly one page. */
export const MAX_PAGES = 12;
export const PAGE_NAME_MAX = 40;
/** Widgets one page can hold; the Home keeps them in a single panel, so it stays readable. */
export const MAX_WIDGETS_PER_PAGE = 40;
/** Across all pages. */
export const MAX_PAGE_WIDGETS = 500;

export type Page = { id: number; name: string; position: number };

/** A trimmed page name of 1 to 40 characters without control characters, or `null`. */
export function normalizePageName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length === 0 || name.length > PAGE_NAME_MAX || hasControlChars(name)) return null;
  return name;
}

/** Page names are unique ignoring case. */
export const samePageName = (a: string, b: string) =>
  a.toLocaleLowerCase() === b.toLocaleLowerCase();
