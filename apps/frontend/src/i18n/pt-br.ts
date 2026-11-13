import { ptBR as frontendPortuguese } from '@homora/i18n/frontend';
import { integrationPortuguese } from '@homora/integrations/translations';
import type { MessageKey } from './en';

export const ptBR: Record<MessageKey, string> = { ...frontendPortuguese, ...integrationPortuguese };
