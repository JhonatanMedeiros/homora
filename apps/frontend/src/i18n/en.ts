import { en as frontendEnglish } from '@homora/i18n/frontend';
import { widgetEnglish } from '@homora/widgets/translations';
import { integrationEnglish } from '@homora/integrations/translations';

export const en = { ...frontendEnglish, ...integrationEnglish, ...widgetEnglish } as const;
export type MessageKey = keyof typeof en;
