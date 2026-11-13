import type { WidgetStat } from '@homora/widgets';
export type { WidgetStat } from '@homora/widgets';
import type { ManifestDisplay } from './integration-manifest.js';

/** Compatibility exports for existing integrations and consumers. */
export { definePresentation } from '@homora/widgets';
export type { WidgetPresentation as IntegrationPresentation } from '@homora/widgets';

export type Translate = (
  key: string | undefined,
  fallback: string,
  params?: Record<string, string>,
) => string;

/** A value the display may show: bounded text, a boolean or a non-negative finite number. */
function displayable(value: unknown): value is string | number | boolean {
  if (typeof value === 'string') return value.length <= 1024;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0;
  return typeof value === 'boolean';
}

/** Renders a manifest display over validated output; null when the data is not displayable. */
export function renderManifestDisplay(
  display: ManifestDisplay,
  value: unknown,
  translate: Translate,
): { summary: string; stats: WidgetStat[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const names = new Map<string, string>();
  const read = (name: string) => {
    const spec = display.values?.[name];
    const raw = data[spec?.from ?? name];
    if (!displayable(raw)) return null;
    if (spec?.map) {
      const entry = spec.map[String(raw)];
      return entry ? translate(entry.key, entry.text) : null;
    }
    return String(raw);
  };
  const fill = (template: string) => {
    let missing = false;
    const text = template.replace(/\{(\w+)\}/g, (_match, name: string) => {
      if (!names.has(name)) {
        const resolved = read(name);
        if (resolved === null) missing = true;
        names.set(name, resolved ?? '');
      }
      return names.get(name)!;
    });
    return missing ? null : text;
  };
  const params: Record<string, string> = {};
  for (const match of display.summary.text.matchAll(/\{(\w+)\}/g)) {
    const resolved = read(match[1]!);
    if (resolved === null) return null;
    params[match[1]!] = resolved;
  }
  const summary = translate(display.summary.key, display.summary.text, params);
  const stats: WidgetStat[] = [];
  for (const stat of display.stats) {
    if (stat.hideWhenZero !== undefined && data[stat.hideWhenZero] === 0) continue;
    const text = fill(stat.value);
    if (text === null) return null;
    stats.push({ label: translate(stat.labelKey, stat.label), value: text });
  }
  return { summary, stats };
}
