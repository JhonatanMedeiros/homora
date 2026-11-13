# Translation catalogs

This package contains Homora's application messages and server notification text. It has no runtime dependency on React, i18next or the integration SDK.

- `src/messages/` groups frontend and API error messages by feature. Add each key and its interpolation placeholders to every language in the same file.
- `src/frontend-en.ts` and `src/frontend-pt-br.ts` assemble those catalogs. English defines the key type; Portuguese must provide the same keys.
- `src/notifications.ts` contains the text sent to human-facing notification channels. The English reason codes intentionally remain stable.
- `src/index.ts` defines supported language identifiers and labels.

Integration-specific translations remain with each integration under `packages/integrations/src/integrations/<type>/messages.ts`. The frontend combines those catalogs with this package at initialization.

To add a language, add every application and notification translation, update the catalog exports and language metadata, and configure both frontend and backend i18next resources and frontend detection. Add translations to integration catalogs, then extend the locale and behavior tests. Review plural categories, formatting and text direction for that language; the current setup supports English and Brazilian Portuguese only.
