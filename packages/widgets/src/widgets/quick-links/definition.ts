import { defineWidget } from '../../index.js';

export const MAX_LINKS = 12;
export type QuickLinksConfig = { title: string; links: { label: string; url: string }[] };
export const defaultQuickLinksConfig: QuickLinksConfig = { title: '', links: [] };

export function isSafeLinkUrl(value: string): boolean {
  if (
    !/^https?:\/\//i.test(value) ||
    /[\s\\]/.test(value) ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      !/^https?:\/\/[^/]*@/i.test(value)
    );
  } catch {
    return false;
  }
}

export const widgetQuickLinksWidget = defineWidget<QuickLinksConfig>({
  type: 'quick-links',
  version: 1,
  locations: ['page'],
  source: null,
  portable: true,
  sizes: ['normal', 'wide'],
  defaultConfig: defaultQuickLinksConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (
      Object.keys(config).some((key) => !['title', 'links'].includes(key)) ||
      typeof config.title !== 'string' ||
      config.title.length > 100 ||
      !Array.isArray(config.links) ||
      config.links.length > MAX_LINKS
    )
      return null;
    const links: QuickLinksConfig['links'] = [];
    for (const value of config.links) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const link = value as Record<string, unknown>;
      if (
        Object.keys(link).some((key) => !['label', 'url'].includes(key)) ||
        typeof link.label !== 'string' ||
        !link.label.trim() ||
        link.label.length > 100 ||
        typeof link.url !== 'string' ||
        link.url.length > 2048 ||
        !isSafeLinkUrl(link.url)
      )
        return null;
      links.push({ label: link.label.trim(), url: link.url });
    }
    return { title: config.title.trim(), links };
  },
});
