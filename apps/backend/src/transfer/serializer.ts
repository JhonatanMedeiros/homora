import { stringify } from 'yaml';
import type { Service } from '@homora/shared';
import { TRANSFER_VERSION, type PortableWidget, type ExportedSettings } from './types.js';

/**
 * Serializes groups and cards in current order. Never includes secrets, connections or IDs.
 * Appearance and custom CSS are included when given; the background picture is not (it is part of
 * the database backup, see `pnpm backup`).
 */
export function serializeConfiguration(
  groups: { name: string; columns?: number | null; page?: string }[],
  services: Service[],
  format: 'yaml' | 'json',
  settings: ExportedSettings & { pages?: string[]; widgets?: PortableWidget[] } = {},
): string {
  const names = [...new Set([...groups.map((g) => g.name), ...services.map((s) => s.category)])];
  const document = {
    version: TRANSFER_VERSION,
    ...(settings.appearance ? { appearance: { ...settings.appearance, image: null } } : {}),
    ...(settings.customCss && settings.customCss.css.trim() !== ''
      ? { customCss: settings.customCss }
      : {}),
    ...(settings.pages && settings.pages.length > 0 ? { pages: settings.pages } : {}),
    ...(settings.widgets?.length ? { widgets: settings.widgets } : {}),
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
          ...(service.openTarget === 'same-tab' ? { openTarget: 'same-tab' } : {}),
          ...(service.pinned ? { pinned: true } : {}),
          ...(service.checkType && service.checkType !== 'http'
            ? { check: service.checkType }
            : {}),
          ...(service.expectedStatus ? { expectedStatus: service.expectedStatus } : {}),
          ...(service.checkPath ? { checkPath: service.checkPath } : {}),
          ...(service.checkMatch ? { checkMatch: service.checkMatch } : {}),
          ...(service.checkInterval ? { interval: service.checkInterval } : {}),
          ...(service.links?.length
            ? {
                links: service.links.map((link) => ({
                  url: link.url,
                  ...(link.name ? { name: link.name } : {}),
                  ...(link.openTarget ? { openTarget: link.openTarget } : {}),
                  ...(link.type ? { type: { name: link.type.name, color: link.type.color } } : {}),
                })),
              }
            : {}),
        })),
    })),
  };
  return format === 'json' ? `${JSON.stringify(document, null, 2)}\n` : stringify(document);
}
