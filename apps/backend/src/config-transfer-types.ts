import type { Appearance, CheckType } from '@homora/shared';

/**
 * Homora export format version. Version 2 added pages (`pages` and a `page` on each group);
 * version 1 files are still read, and their groups go to the first page.
 */
export const TRANSFER_VERSION = 2;
export const READABLE_TRANSFER_VERSIONS: readonly unknown[] = [1, 2];
export const MAX_TRANSFER_CHARS = 1_000_000;
export const MAX_GROUPS = 200;
export const MAX_GROUP_COLUMNS = 6;
export const MAX_SERVICES = 1000;
/**
 * Flow collections (`[` and `{`) a document may open. Deeply nested garbage makes the YAML parser
 * spend hundreds of milliseconds on the only thread; real exports use a small fraction of this.
 */
export const MAX_FLOW_OPENERS = 20_000;
export type ImportedService = {
  name: string;
  url: string;
  description: string;
  icon: string;
  allowPrivate: boolean;
  checkType?: CheckType;
  checkInterval?: number;
  expectedStatus?: string;
  checkPath?: string;
  checkMatch?: string;
};
export type ImportedGroup = {
  name: string;
  columns?: number;
  /** Name of the page the group belongs to in the file (Homora files only). */
  page?: string;
  services: ImportedService[];
};
export type ImportDocument = { groups: ImportedGroup[]; pages?: string[] };

/** Stable codes: the UI translates them; the server returns no language-specific text. */
export type IssueCode =
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
  | 'check-ignored'
  | 'widget-ignored'
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
  services: { group: string; name: string; url: string; status: 'new' | 'duplicate' }[];
  issues: ImportIssue[];
  summary: {
    newGroups: number;
    newPages: number;
    newServices: number;
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
