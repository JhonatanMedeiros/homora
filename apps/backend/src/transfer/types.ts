import type { CountdownConfig } from '@homora/widgets/countdown';
import type { ClockConfig } from '@homora/widgets/clock';
import type { Appearance, CheckType, LinkColor, OpenTarget } from '@homora/shared';

/**
 * Homora export format version. Version 2 added pages (`pages` and a `page` on each group);
 * version 3 adds page widgets; version 4 adds the extra addresses of a service (`links`, each with
 * its type by name and color); version 5 adds service aliases. Versions 1 to 4 remain readable;
 * version 1 groups go to the first page.
 */
export const TRANSFER_VERSION = 6;
export const READABLE_TRANSFER_VERSIONS: readonly unknown[] = [1, 2, 3, 4, 5, 6];
export const MAX_TRANSFER_CHARS = 1_000_000;
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
  page: string;
  type: string;
  name: string;
  config: ClockConfig | CountdownConfig | Record<string, never>;
  source?: { type: string; name: string };
};
export type ImportDocument = {
  groups: ImportedGroup[];
  pages?: string[];
  widgets?: PortableWidget[];
};

/** Stable codes: the UI translates them; the server returns no language-specific text. */
export type IssueCode =
  | 'alias-ignored'
  | 'alias-conflict'
  | 'invalid-syntax'
  | 'invalid-document'
  | 'unsupported-version'
  | 'too-many-groups'
  | 'too-many-services'
  | 'invalid-group'
  | 'invalid-service'
  | 'invalid-name'
  | 'invalid-url'
  | 'icon-ignored'
  | 'duplicate-in-file'
  | 'icon-unsupported'
  | 'columns-ignored'
  | 'open-target-ignored'
  | 'link-ignored'
  | 'link-limit'
  | 'check-ignored'
  | 'widget-ignored'
  | 'widget-source-unavailable'
  | 'widget-invalid'
  | 'widget-limit'
  | 'pages-ignored'
  | 'page-invalid'
  | 'page-limit'
  | 'group-renamed';
export type ImportIssue = { path: string; code: IssueCode; severity: 'error' | 'warning' };
export type ParsedImport = { document: ImportDocument; issues: ImportIssue[] };

export type ImportPlan = {
  groups: { name: string; status: 'new' | 'existing'; page?: string }[];
  /** Pages the file asks for, and whether they exist already. */
  pages: { name: string; status: 'new' | 'existing' }[];
  services: {
    group: string;
    name: string;
    url: string;
    alias?: string;
    status: 'new' | 'duplicate';
  }[];
  widgets: { page: string; name: string; type: string; status: 'new' | 'skipped' }[];
  issues: ImportIssue[];
  summary: {
    newGroups: number;
    newPages: number;
    newServices: number;
    newWidgets: number;
    duplicates: number;
    errors: number;
    warnings: number;
  };
};

/** Instance look and feel that travels in an export. The background picture does not. */
export type ExportedSettings = {
  appearance?: Appearance;
  customCss?: { enabled: boolean; css: string };
};
