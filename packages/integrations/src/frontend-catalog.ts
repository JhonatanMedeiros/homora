import type { IntegrationPresentation } from './frontend.js';
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
