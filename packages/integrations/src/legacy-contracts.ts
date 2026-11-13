/** Compatibility source identifiers already accepted by the public API. */
export const LEGACY_WIDGET_SOURCES = ['proxmox'] as const;
export type LegacyWidgetSource = (typeof LEGACY_WIDGET_SOURCES)[number];

export const legacyApiErrorMessages = {
  'proxmox-not-configured': 'Proxmox is not configured.',
} as const;

const unavailableCodes: Record<LegacyWidgetSource, 'proxmox-not-configured'> = {
  proxmox: 'proxmox-not-configured',
};
const unavailableMessages: Record<LegacyWidgetSource, string> = {
  proxmox: 'Proxmox not configured',
};

export const legacyUnavailableCode = (source: LegacyWidgetSource) => unavailableCodes[source];
export const legacyUnavailableMessage = (source: LegacyWidgetSource) => unavailableMessages[source];
export const isLegacyUnavailableCode = (code: string) =>
  Object.values(unavailableCodes).some((value) => value === code);

/** Compatibility fields retained for existing MCP clients. */
export function legacyConnectionCapabilities(connections: readonly { type: string }[] | null) {
  return Object.fromEntries(
    LEGACY_WIDGET_SOURCES.map((source) => [
      `${source}Configured`,
      connections?.some((connection) => connection.type === source) ?? false,
    ]),
  );
}

export const isLegacyConnectionType = (type: string) =>
  (LEGACY_WIDGET_SOURCES as readonly string[]).includes(type);
