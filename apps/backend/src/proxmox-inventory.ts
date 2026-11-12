import { isNodeName, isVmid, type GuestType } from '@homora/shared';

export type ProxmoxNodeState = 'online' | 'offline' | 'unknown';
export type ProxmoxNode = { name: string; status: ProxmoxNodeState };
export type ProxmoxGuest = {
  vmid: number;
  name: string;
  type: GuestType;
  node: string;
  /** Raw Proxmox status (`running`, `stopped`, `paused`...); `unknown` when absent. */
  status: string;
};
export type ProxmoxInventory = { nodes: ProxmoxNode[]; guests: ProxmoxGuest[] };

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;

/**
 * Lists nodes and guests from the cluster resources payload. Unlike `summarizeProxmox`, this
 * carries names and ids, so it must only reach authenticated sessions and never the public
 * status page, logs or unscoped MCP tools. Templates and malformed items are ignored.
 */
export function inventoryProxmox(resources: unknown): ProxmoxInventory {
  const inventory: ProxmoxInventory = { nodes: [], guests: [] };
  if (!Array.isArray(resources)) return inventory;
  const seen = new Set<string>();
  for (const item of resources) {
    if (!item || typeof item !== 'object') continue;
    const resource = item as Record<string, unknown>;
    if (resource.type === 'node') {
      const name = text(resource.node, 63);
      if (!name || !isNodeName(name) || seen.has(`n:${name}`)) continue;
      seen.add(`n:${name}`);
      inventory.nodes.push({
        name,
        status:
          resource.status === 'online'
            ? 'online'
            : resource.status === 'offline'
              ? 'offline'
              : 'unknown',
      });
    } else if (resource.type === 'qemu' || resource.type === 'lxc') {
      if (resource.template === 1) continue;
      const node = text(resource.node, 63);
      const name = text(resource.name, 128) ?? '';
      if (!node || !isNodeName(node) || !isVmid(resource.vmid)) continue;
      const key = `g:${resource.type}:${node}:${resource.vmid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      inventory.guests.push({
        vmid: resource.vmid,
        name,
        type: resource.type,
        node,
        status: text(resource.status, 32) ?? 'unknown',
      });
    }
  }
  inventory.nodes.sort((a, b) => a.name.localeCompare(b.name));
  inventory.guests.sort((a, b) => a.node.localeCompare(b.node) || a.vmid - b.vmid);
  return inventory;
}
