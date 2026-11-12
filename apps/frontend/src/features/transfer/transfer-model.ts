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
  | 'group-renamed'
  | 'page-invalid'
  | 'page-limit';
export type Issue = { path: string; code: IssueCode; severity: 'error' | 'warning' };
export type Plan = {
  pages?: { name: string; status: 'new' | 'existing' }[];
  groups: { name: string; status: 'new' | 'existing' }[];
  services: { group: string; name: string; url: string; status: 'new' | 'duplicate' }[];
  issues: Issue[];
  summary: {
    newGroups: number;
    newPages?: number;
    newServices: number;
    duplicates: number;
    errors: number;
    warnings: number;
  };
};
export type Preview = { version: number; plan: Plan };

export const MAX_FILE_BYTES = 1_000_000;

export type Source = 'homora' | 'homepage' | 'dashy';
export const SOURCES: Source[] = ['homora', 'homepage', 'dashy'];
