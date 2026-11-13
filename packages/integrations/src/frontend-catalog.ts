import { renderManifestDisplay, type IntegrationPresentation, type Translate } from './frontend.js';
import { integrationDefinition } from './integration-manifest.js';
import { frontendFactories } from './generated/frontend.js';

/** All built-in presentation wiring lives in the integration package, not in the host UI. */
export function createPresentationCatalog(translate: (key: string) => string) {
  const entries = new Map<string, IntegrationPresentation>(
    frontendFactories.map(({ type, definition, create }) => {
      if (definition.type !== type) throw new Error(`Invalid presentation registration: ${type}`);
      return [type, create(translate)];
    }),
  );
  return {
    get(type: string): IntegrationPresentation | undefined {
      return entries.get(type);
    },
    placeholderCount(type: string): number {
      const definition = integrationDefinition(type);
      if (definition?.kind === 'manifest') return definition.display.stats.length;
      return entries.get(type)?.placeholderCount ?? 5;
    },
  };
}

/** Resolve both manifest and code widgets using only the catalog and an injected translator. */
export function createWidgetRenderer(translate: Translate) {
  const catalog = createPresentationCatalog((key) => translate(key, key));
  function render(type: string, value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const presentation = catalog.get(type);
    if (presentation) {
      const stats = presentation.stats(value);
      return stats
        ? { stats, summary: stats.map((stat) => `${stat.label}: ${stat.value}`).join(' · ') }
        : null;
    }
    const definition = integrationDefinition(type);
    return definition?.kind === 'manifest'
      ? renderManifestDisplay(definition.display, value, translate)
      : null;
  }
  return {
    stats: (type: string, value: unknown) => render(type, value)?.stats ?? null,
    describe: (type: string, value: unknown) => render(type, value)?.summary ?? null,
  };
}
