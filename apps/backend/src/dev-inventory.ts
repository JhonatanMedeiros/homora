/** Name of the demo Proxmox connection the development database ships with. */
export const DEMO_PROXMOX = 'Demo Proxmox (mock)';

/** Nodes and guests of the demo cluster, so the Home rail and Map have hosts to show in dev. */
export function developmentMockInventory(connection: { type: string; name: string }) {
  if (connection.type !== 'proxmox' || connection.name !== DEMO_PROXMOX) return null;
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
