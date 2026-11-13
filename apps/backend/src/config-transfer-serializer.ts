import { stringify } from 'yaml';
import type { Service } from '@homora/shared';
import { TRANSFER_VERSION, type ExportedSettings } from './config-transfer-types.js';

/**
 * Serializes groups and cards in current order. Never includes secrets, connections or IDs.
 * Appearance and custom CSS are included when given; the background picture is not (it is part of
 * the database backup, see `pnpm backup`).
 */
export function serializeConfiguration(
  groups: { name: string; columns?: number | null; page?: string }[],
  services: Service[],
  format: 'yaml' | 'json',
  settings: ExportedSettings & { pages?: string[] } = {},
): string {
  const names = [...new Set([...groups.map((g) => g.name), ...services.map((s) => s.category)])];
  const document = {
    version: TRANSFER_VERSION,
    ...(settings.appearance ? { appearance: { ...settings.appearance, image: null } } : {}),
    ...(settings.customCss && settings.customCss.css.trim() !== ''
      ? { customCss: settings.customCss }
      : {}),
    ...(settings.pages && settings.pages.length > 0 ? { pages: settings.pages } : {}),
    groups: names.map((name) => ({
      name,
      ...(groups.find((group) => group.name === name)?.columns
        ? { columns: groups.find((group) => group.name === name)?.columns }
        : {}),
      ...(groups.find((group) => group.name === name)?.page
        ? { page: groups.find((group) => group.name === name)?.page }
        : {}),
      services: services
        .filter((service) => service.category === name)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))
        .map((service) => ({
          name: service.name,
          url: service.url,
          ...(service.description ? { description: service.description } : {}),
          ...(service.icon ? { icon: service.icon } : {}),
          ...(service.allowPrivate ? { allowPrivate: true } : {}),
          ...(service.checkType === 'ping' ? { check: 'ping' } : {}),
          ...(service.expectedStatus ? { expectedStatus: service.expectedStatus } : {}),
          ...(service.checkPath ? { checkPath: service.checkPath } : {}),
          ...(service.checkInterval ? { interval: service.checkInterval } : {}),
        })),
    })),
  };
  return format === 'json' ? `${JSON.stringify(document, null, 2)}\n` : stringify(document);
}
