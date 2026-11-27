import {
  MAX_TRANSFER_CHARS,
  type ImportIssue,
  type ImportPlan,
  type IssueCode,
  type Appearance,
  type CheckType,
  type LinkColor,
  type OpenTarget,
  type SummaryBlock,
} from '@homora/shared';

export { MAX_TRANSFER_CHARS, type ImportIssue, type ImportPlan, type IssueCode };

/**
 * Homora export format version. Version 2 added pages (`pages` and a `page` on each group);
 * version 3 adds page widgets; version 4 adds the extra addresses of a service (`links`, each with
 * its type by name and color); version 5 adds service aliases; version 7 adds the customized
 * Summary of each page (`summaryLayouts`). Older versions remain readable;
 * version 1 groups go to the first page.
 */
export const TRANSFER_VERSION = 7;
export const READABLE_TRANSFER_VERSIONS: readonly unknown[] = [1, 2, 3, 4, 5, 6, 7];
export const MAX_GROUPS = 200;
export const MAX_SERVICES = 1000;
/**
 * Flow collections (`[` and `{`) a document may open. Deeply nested garbage makes the YAML parser
 * spend hundreds of milliseconds on the only thread; real exports use a small fraction of this.
 */
export const MAX_FLOW_OPENERS = 20_000;
/** An extra address in a file. Its type travels by name and color, never by id. */
export type ImportedLink = {
  url: string;
  name: string;
  openTarget?: OpenTarget;
  type?: { name: string; color: LinkColor };
};
export type ImportedService = {
  alias?: string;
  name: string;
  url: string;
  description: string;
  icon: string;
  allowPrivate: boolean;
  openTarget?: OpenTarget;
  checkType?: CheckType;
  checkInterval?: number;
  expectedStatus?: string;
  checkPath?: string;
  checkUrl?: string;
  checkMatch?: string;
  links?: ImportedLink[];
  pinned?: true;
};
export type ImportedGroup = {
  name: string;
  columns?: number;
  /** Name of the page the group belongs to in the file (Homora files only). */
  page?: string;
  services: ImportedService[];
};
export type PortableWidget = {
  size?: 'normal' | 'wide';
  page: string;
  type: string;
  name: string;
  config: unknown;
  source?: { type: string; name: string };
};
/** A Summary entry in a file: a built-in block, or a widget by its place in `widgets`. */
export type PortableSummaryItem = ({ block: SummaryBlock } | { widget: number }) & {
  hidden: boolean;
  width?: number;
  height?: number;
};
export type PortableSummaryLayout = {
  page: string;
  desktop?: PortableSummaryItem[];
  phone?: PortableSummaryItem[];
};
export type ImportDocument = {
  groups: ImportedGroup[];
  pages?: string[];
  widgets?: PortableWidget[];
  summaryLayouts?: PortableSummaryLayout[];
  /** For each of `widgets`, its place in the file; kept when layouts need to find it. */
  widgetRefs?: number[];
};

export type ParsedImport = { document: ImportDocument; issues: ImportIssue[] };

/** Instance look and feel that travels in an export. The background picture does not. */
export type ExportedSettings = {
  appearance?: Appearance;
  customCss?: { enabled: boolean; css: string };
};
