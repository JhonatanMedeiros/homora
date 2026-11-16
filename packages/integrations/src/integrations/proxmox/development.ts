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

/** Nodes and guests of the demo cluster, so the Home rail and Map have hosts to show in dev. */
export function developmentMockInventory(connection: { type: string; name: string }) {
  if (connection.type !== 'proxmox' || connection.name !== 'Demo Proxmox (mock)') return null;
  return {
    data: {
      nodes: [
        { name: 'pve1', status: 'online' },
        { name: 'pve2', status: 'online' },
        { name: 'pve3', status: 'offline' },
      ],
      guests: [
        { vmid: 101, name: 'nextcloud', type: 'lxc', node: 'pve1', status: 'running' },
        { vmid: 102, name: 'vaultwarden', type: 'lxc', node: 'pve1', status: 'running' },
        { vmid: 103, name: 'adguard', type: 'lxc', node: 'pve1', status: 'running' },
        { vmid: 110, name: 'media-vm', type: 'qemu', node: 'pve1', status: 'running' },
        { vmid: 120, name: 'monitoring', type: 'lxc', node: 'pve1', status: 'running' },
        { vmid: 201, name: 'radarr', type: 'lxc', node: 'pve2', status: 'running' },
        { vmid: 202, name: 'sonarr', type: 'lxc', node: 'pve2', status: 'running' },
        { vmid: 203, name: 'prowlarr', type: 'lxc', node: 'pve2', status: 'stopped' },
        { vmid: 210, name: 'docker-host', type: 'qemu', node: 'pve2', status: 'running' },
        { vmid: 301, name: 'plex', type: 'qemu', node: 'pve3', status: 'stopped' },
        { vmid: 302, name: 'immich', type: 'lxc', node: 'pve3', status: 'stopped' },
        { vmid: 303, name: 'paperless', type: 'lxc', node: 'pve3', status: 'stopped' },
      ],
    },
    checkedAt: new Date().toISOString(),
  };
}
