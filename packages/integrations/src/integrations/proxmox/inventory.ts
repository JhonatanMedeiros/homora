import { isIP } from 'node:net';
import { isNodeName, isVmid, type GuestType } from './contracts.js';
import type {
  HostMetrics,
  HostUsage,
  HostNodeState,
  HostNode,
  HostGuest,
  HostInventoryData,
  HostGuestAddresses,
} from '../../host-contracts.js';

export type ProxmoxNodeState = HostNodeState;
export type ProxmoxNode = HostNode;
export type ProxmoxGuest = HostGuest;
export type ProxmoxInventory = HostInventoryData;

const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;

const share = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.min(1, value)
    : undefined;

function usage(used: unknown, total: unknown): HostUsage | undefined {
  if (typeof used !== 'number' || typeof total !== 'number') return undefined;
  if (!Number.isFinite(used) || !Number.isFinite(total) || used < 0 || total <= 0) return undefined;
  return { used: Math.min(used, total), total };
}

/** Live load of one resource, only for a node that is online or a guest that is running. */
function metricsOf(resource: Record<string, unknown>, live: boolean, disk: boolean) {
  if (!live) return;
  const metrics: HostMetrics = {};
  const cpu = share(resource.cpu);
  if (cpu !== undefined) metrics.cpu = cpu;
  const memory = usage(resource.mem, resource.maxmem);
  if (memory) metrics.memory = memory;
  const storage = disk ? usage(resource.disk, resource.maxdisk) : undefined;
  if (storage) metrics.disk = storage;
  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

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
      const status: HostNodeState =
        resource.status === 'online'
          ? 'online'
          : resource.status === 'offline'
            ? 'offline'
            : 'unknown';
      const metrics = metricsOf(resource, status === 'online', true);
      inventory.nodes.push({ name, status, ...(metrics && { metrics }) });
    } else if (resource.type === 'qemu' || resource.type === 'lxc') {
      if (resource.template === 1) continue;
      const node = text(resource.node, 63);
      const name = text(resource.name, 128) ?? '';
      if (!node || !isNodeName(node) || !isVmid(resource.vmid)) continue;
      const key = `g:${resource.type}:${node}:${resource.vmid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const status = text(resource.status, 32) ?? 'unknown';
      const metrics = metricsOf(resource, status === 'running', false);
      inventory.guests.push({
        vmid: resource.vmid,
        name,
        type: resource.type,
        node,
        status,
        ...(metrics && { metrics }),
      });
    }
  }
  inventory.nodes.sort((a, b) => a.name.localeCompare(b.name));
  inventory.guests.sort((a, b) => a.node.localeCompare(b.node) || a.vmid - b.vmid);
  return inventory;
}

const MAX_ADDRESSES = 8;
const CONFIG_ADDRESS_KEYS = { lxc: /^net\d+$/, qemu: /^ipconfig\d+$/ } as const;

/** Normalizes an IP literal; loopback, link-local and unspecified addresses are not evidence. */
export function usableAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const address = value
    .trim()
    .replace(/\/\d{1,3}$/, '')
    .toLowerCase();
  const family = isIP(address);
  if (!family) return null;
  if (family === 4 && /^(127\.|0\.|169\.254\.|255\.)/.test(address)) return null;
  if (family === 6 && (address === '::' || address === '::1' || address.startsWith('fe80:')))
    return null;
  return address;
}

/**
 * Static addresses written in a guest configuration: `ip=` / `ip6=` of an LXC `netN` line or a
 * VM cloud-init `ipconfigN` line. `dhcp`, `auto` and `manual` carry no address.
 */
export function configAddresses(type: GuestType, config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const found = new Set<string>();
  for (const [key, line] of Object.entries(config as Record<string, unknown>)) {
    if (!CONFIG_ADDRESS_KEYS[type].test(key) || typeof line !== 'string') continue;
    for (const part of line.split(',')) {
      const [name, value] = part.split('=');
      if (name !== 'ip' && name !== 'ip6') continue;
      const address = usableAddress(value);
      if (address) found.add(address);
    }
  }
  return [...found].slice(0, MAX_ADDRESSES);
}

/** Addresses reported by the QEMU guest agent (`network-get-interfaces`). */
export function agentAddresses(data: unknown): string[] {
  const result = (data as { result?: unknown } | null)?.result;
  if (!Array.isArray(result)) return [];
  const found = new Set<string>();
  for (const iface of result) {
    const list = (iface as Record<string, unknown> | null)?.['ip-addresses'];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const address = usableAddress((entry as Record<string, unknown> | null)?.['ip-address']);
      if (address) found.add(address);
    }
  }
  return [...found].slice(0, MAX_ADDRESSES);
}

export type GuestAddresses = HostGuestAddresses;
