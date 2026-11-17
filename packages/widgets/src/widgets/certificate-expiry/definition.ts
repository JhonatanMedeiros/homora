import { defineWidget, monitoringSources } from '../../index.js';
export type CertificateConfig = { threshold: 7 | 14 | 30 | 60; pages: string[]; groups: string[] };
export const defaultCertificateConfig: CertificateConfig = { threshold: 30, pages: [], groups: [] };
const names = (input: unknown): input is string[] =>
  Array.isArray(input) &&
  input.length <= 100 &&
  input.every((n) => typeof n === 'string' && n.length > 0 && n.length <= 100 && n.trim() === n) &&
  new Set(input).size === input.length;
export const widgetCertificateExpiryWidget = defineWidget<CertificateConfig>({
  type: 'certificate-expiry',
  version: 1,
  locations: ['page'],
  portable: true,
  source: monitoringSources.certificates,
  sizes: ['normal', 'wide'],
  defaultConfig: defaultCertificateConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const c = value as Record<string, unknown>;
    if (
      Object.keys(c).some((key) => !['threshold', 'pages', 'groups'].includes(key)) ||
      (c.threshold !== 7 && c.threshold !== 14 && c.threshold !== 30 && c.threshold !== 60) ||
      !names(c.pages) ||
      !names(c.groups)
    )
      return null;
    return { threshold: c.threshold, pages: c.pages, groups: c.groups };
  },
});
export function expiryState(expiresAt: number | null, threshold: number, now: number) {
  if (expiresAt === null) return 'unknown';
  if (expiresAt <= now) return 'expired';
  return expiresAt - now <= threshold * 86_400_000 ? 'warning' : 'future';
}
