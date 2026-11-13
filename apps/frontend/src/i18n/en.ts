import { en as frontendEnglish } from '@homora/i18n/frontend';
import { integrationEnglish } from '@homora/integrations/translations';

export const en = { ...frontendEnglish, ...integrationEnglish } as const;
export type MessageKey = keyof typeof en;
