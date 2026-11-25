import type { DatabaseSync } from 'node:sqlite';

/** Add demo integration rows to the isolated dev database without touching user data. */
export function seedDevelopmentMock(sqlite: DatabaseSync) {
  const demo = sqlite
    .prepare(
      "SELECT id FROM integration_instances WHERE type = 'proxmox' AND public_config LIKE '%proxmox.mock.invalid%' LIMIT 1",
    )
    .get() as { id: number } | undefined;
  if (demo) return;

  const service = sqlite
    .prepare("SELECT id FROM service_cards WHERE name = 'Proxmox' ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;
  if (!service) return;

  sqlite.exec('BEGIN');
  try {
    const integration = sqlite
      .prepare(
        "INSERT INTO integration_instances(type,name,public_config) VALUES('proxmox','Demo Proxmox (mock)',?)",
      )
      .run(JSON.stringify({ url: 'https://proxmox.mock.invalid:8006', allowPrivate: false }));
    sqlite
      .prepare(
        "INSERT INTO integration_widgets(integration_id,type,name,public_config,service_id) VALUES(?,'proxmox','Cluster de demonstração','{}',?)",
      )
      .run(Number(integration.lastInsertRowid), service.id);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

export function developmentMockData(connection: { type: string; name: string }) {
  if (connection.type !== 'proxmox' || connection.name !== 'Demo Proxmox (mock)') return null;
  return {
    data: {
      vms: { running: 3, total: 5 },
      containers: { running: 8, total: 11 },
      cpu: 23,
      memory: 61,
      disk: 37,
    },
    checkedAt: new Date().toISOString(),
  };
}

const GB = 1024 ** 3;
const load = (cpu: number, usedGb: number, totalGb: number) => ({
  cpu,
  memory: { used: Math.round(usedGb * GB), total: totalGb * GB },
});

/** Nodes and guests of the demo cluster, so the Home rail and Map have hosts to show in dev. */
export function developmentMockInventory(connection: { type: string; name: string }) {
  if (connection.type !== 'proxmox' || connection.name !== 'Demo Proxmox (mock)') return null;
  return {
    data: {
      nodes: [
        {
          name: 'pve1',
          status: 'online',
          metrics: { ...load(0.12, 26, 64), disk: { used: 280 * GB, total: 1000 * GB } },
        },
        {
          name: 'pve2',
          status: 'online',
          metrics: { ...load(0.31, 18, 32), disk: { used: 410 * GB, total: 500 * GB } },
        },
        { name: 'pve3', status: 'offline' },
      ],
      guests: [
        {
          vmid: 101,
          name: 'nextcloud',
          type: 'lxc',
          node: 'pve1',
          status: 'running',
          metrics: load(0.04, 1.2, 4),
        },
        {
          vmid: 102,
          name: 'vaultwarden',
          type: 'lxc',
          node: 'pve1',
          status: 'running',
          metrics: load(0.01, 0.2, 1),
        },
        {
          vmid: 103,
          name: 'adguard',
          type: 'lxc',
          node: 'pve1',
          status: 'running',
          metrics: load(0.02, 0.3, 1),
        },
        {
          vmid: 110,
          name: 'media-vm',
          type: 'qemu',
          node: 'pve1',
          status: 'running',
          metrics: load(0.22, 5.8, 8),
        },
        {
          vmid: 120,
          name: 'monitoring',
          type: 'lxc',
          node: 'pve1',
          status: 'running',
          metrics: load(0.07, 1.1, 2),
        },
        {
          vmid: 201,
          name: 'radarr',
          type: 'lxc',
          node: 'pve2',
          status: 'running',
          metrics: load(0.03, 0.4, 2),
        },
        {
          vmid: 202,
          name: 'sonarr',
          type: 'lxc',
          node: 'pve2',
          status: 'running',
          metrics: load(0.03, 0.5, 2),
        },
        { vmid: 203, name: 'prowlarr', type: 'lxc', node: 'pve2', status: 'stopped' },
        {
          vmid: 210,
          name: 'docker-host',
          type: 'qemu',
          node: 'pve2',
          status: 'running',
          metrics: load(0.18, 7.4, 12),
        },
        { vmid: 301, name: 'plex', type: 'qemu', node: 'pve3', status: 'stopped' },
        { vmid: 302, name: 'immich', type: 'lxc', node: 'pve3', status: 'stopped' },
        { vmid: 303, name: 'paperless', type: 'lxc', node: 'pve3', status: 'stopped' },
      ],
    },
    checkedAt: new Date().toISOString(),
  };
}

type DemoGuest = { node: string; vmid: number; type: 'qemu' | 'lxc'; name: string; status: string };
const DEMO_GUESTS: Record<string, DemoGuest> = {
  'docker-host': { node: 'pve2', vmid: 210, type: 'qemu', name: 'docker-host', status: 'running' },
  'media-vm': { node: 'pve1', vmid: 110, type: 'qemu', name: 'media-vm', status: 'running' },
};
type DemoEvidence = { kind: 'config-address' | 'guest-agent' | 'docker-source'; address?: string };
/** Fixed demo answers by card name: two strong matches, one possible, the rest without evidence. */
const DEMO_MATCHES: Record<string, { guest: string; evidence: DemoEvidence[] }> = {
  Caddy: {
    guest: 'docker-host',
    evidence: [
      { kind: 'config-address', address: '10.255.255.40' },
      { kind: 'guest-agent', address: '10.255.255.40' },
    ],
  },
  qBittorrent: {
    guest: 'media-vm',
    evidence: [
      { kind: 'config-address', address: '10.255.255.41' },
      { kind: 'guest-agent', address: '10.255.255.41' },
    ],
  },
  'Home Assistant': { guest: 'docker-host', evidence: [{ kind: 'docker-source' }] },
};

/**
 * Suggested hosts for the demo cluster's cards. The demo has no guest configuration to read, so the
 * answers are fixed. Used only by the development server (`HOMORA_DEV_MOCKS`).
 */
export function developmentHostSuggestions(
  connection: { id: number; type: string; name: string },
  services: { id: number; name: string }[],
  linked: ReadonlySet<number>,
) {
  if (connection.type !== 'proxmox' || connection.name !== 'Demo Proxmox (mock)') return null;
  const suggestions = services
    .filter((service) => !linked.has(service.id))
    .map((service) => {
      const match = DEMO_MATCHES[service.name];
      const guest = match && DEMO_GUESTS[match.guest];
      if (!match || !guest) return { serviceId: service.id, candidates: [] };
      return {
        serviceId: service.id,
        candidates: [
          {
            host: {
              connectionId: connection.id,
              node: guest.node,
              vmid: guest.vmid,
              type: guest.type,
            },
            name: guest.name,
            status: guest.status,
            strength: match.evidence.length >= 2 ? 'strong' : 'medium',
            evidence: match.evidence,
            ambiguous: false,
          },
        ],
      };
    });
  return { suggestions, unavailableConnections: [] as number[] };
}
