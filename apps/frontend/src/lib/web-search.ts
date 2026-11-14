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

/**
 * Short prefixes for the optional web search: `!g text` searches Google, `!w text` Wikipedia. They
 * only work while web search is on, and send nothing but the text after the prefix. Same rules as
 * the engine templates: https only, and the text can never pick the host.
 */
export const BANGS = [
  { bang: 'g', label: 'Google', template: 'https://www.google.com/search?q=%s' },
  { bang: 'ddg', label: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
  { bang: 'b', label: 'Brave', template: 'https://search.brave.com/search?q=%s' },
  { bang: 'bing', label: 'Bing', template: 'https://www.bing.com/search?q=%s' },
  { bang: 'w', label: 'Wikipedia', template: 'https://en.wikipedia.org/w/index.php?search=%s' },
  { bang: 'gh', label: 'GitHub', template: 'https://github.com/search?q=%s' },
  { bang: 'yt', label: 'YouTube', template: 'https://www.youtube.com/results?search_query=%s' },
] as const;

/** `!g text` into its engine and text; null when the text does not start with a known bang and a query. */
export function parseBang(input: string): { label: string; template: string; text: string } | null {
  const match = /^!([a-z]+)\s+(\S[\s\S]*)$/i.exec(input.trim());
  if (!match) return null;
  const found = BANGS.find((item) => item.bang === match[1]!.toLowerCase());
  return found ? { label: found.label, template: found.template, text: match[2]!.trim() } : null;
}
