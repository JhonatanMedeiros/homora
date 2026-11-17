import {
  MAX_TRANSFER_CHARS,
  TRANSFER_SOURCES,
  type ImportIssue,
  type ImportPlan,
  type IssueCode,
  type TransferSource,
} from '@homora/shared';

export type { IssueCode, ImportIssue as Issue, TransferSource as Source };
export type Plan = Omit<ImportPlan, 'pages' | 'widgets' | 'summary'> & {
  pages?: ImportPlan['pages'];
  widgets?: ImportPlan['widgets'];
  summary: Omit<ImportPlan['summary'], 'newPages' | 'newWidgets'> & {
    newPages?: number;
    newWidgets?: number;
  };
};
export type Preview = { version: number; plan: Plan };

export const MAX_FILE_BYTES = MAX_TRANSFER_CHARS;
export const SOURCES: TransferSource[] = [...TRANSFER_SOURCES];
