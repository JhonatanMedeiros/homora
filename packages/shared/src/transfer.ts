/** Columns a group may span on the Home. */
export const MAX_GROUP_COLUMNS = 6;
export const MAX_TRANSFER_CHARS = 1_000_000;

export type TransferSource = 'homora' | 'homepage' | 'dashy';
export const TRANSFER_SOURCES: readonly TransferSource[] = ['homora', 'homepage', 'dashy'];

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
  | 'summary-layout-invalid'
  | 'pages-ignored'
  | 'page-invalid'
  | 'page-limit'
  | 'group-renamed';

export type ImportIssue = { path: string; code: IssueCode; severity: 'error' | 'warning' };

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
