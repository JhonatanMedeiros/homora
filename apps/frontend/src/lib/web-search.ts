/** Built-in engines. `%s` marks where the typed text goes. Add an entry to offer another engine. */
export const SEARCH_ENGINES = [
  { id: 'duckduckgo', label: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
  { id: 'google', label: 'Google', template: 'https://www.google.com/search?q=%s' },
  { id: 'brave', label: 'Brave', template: 'https://search.brave.com/search?q=%s' },
  { id: 'bing', label: 'Bing', template: 'https://www.bing.com/search?q=%s' },
] as const;

export const CUSTOM_ENGINE = 'custom';
export type EngineChoice = (typeof SEARCH_ENGINES)[number]['id'] | typeof CUSTOM_ENGINE;
export const DEFAULT_ENGINE: EngineChoice = 'duckduckgo';

export const isEngineChoice = (value: unknown): value is EngineChoice =>
  value === CUSTOM_ENGINE || SEARCH_ENGINES.some((engine) => engine.id === value);

export type TemplateProblem = 'placeholder' | 'invalid' | 'protocol';

/** Why a URL template cannot be used, or null when it is a safe `https:` template with `%s`. */
export function templateProblem(template: string): TemplateProblem | null {
  if (!template.includes('%s')) return 'placeholder';
  const probe = (text: string) => {
    try {
      return new URL(template.replaceAll('%s', () => text));
    } catch {
      return null;
    }
  };
  const first = probe('a');
  const second = probe('b');
  if (!first || !second) return 'invalid';
  if (first.protocol !== 'https:') return 'protocol';
  // The typed text may only land in the path, query or fragment, never pick the host or credentials.
  if (first.host !== second.host || first.username || first.password) return 'invalid';
  return null;
}

/**
 * The result-page URL for exactly the text the person typed, or null when the template is not
 * usable. Checked again here, not only on save, because the stored value is editable.
 */
export function buildSearchUrl(template: string, text: string): string | null {
  const query = text.trim();
  if (!query || templateProblem(template)) return null;
  const encoded = encodeURIComponent(query);
  return template.replaceAll('%s', () => encoded);
}

/** Template of the chosen engine, or null when the choice has no usable template. */
export function engineTemplate(engine: EngineChoice, customUrl: string): string | null {
  if (engine === CUSTOM_ENGINE) return templateProblem(customUrl) ? null : customUrl;
  return SEARCH_ENGINES.find((item) => item.id === engine)?.template ?? null;
}
