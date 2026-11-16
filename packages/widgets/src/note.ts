import { defineWidget } from './index.js';

export const MAX_NOTE_LENGTH = 4000;
export type NoteConfig = { text: string };
export const defaultNoteConfig: NoteConfig = { text: '' };

export const noteWidget = defineWidget<NoteConfig>({
  type: 'note',
  version: 1,
  locations: ['page'],
  source: null,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (
      Object.keys(config).some((key) => key !== 'text') ||
      typeof config.text !== 'string' ||
      config.text.length > MAX_NOTE_LENGTH
    )
      return null;
    return { text: config.text };
  },
});
