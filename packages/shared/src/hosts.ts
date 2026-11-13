/** Guest kinds that Proxmox reports in its cluster inventory. */
export type GuestType = 'qemu' | 'lxc';

/** Optional "runs on" link from a card to a Proxmox guest. Stores ids only, never guest names. */
export type HostLink = { connectionId: number; node: string; vmid: number; type: GuestType };

/** Proxmox node names are DNS-like labels. */
export const isNodeName = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})$/.test(value);

export const isVmid = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 100 && Number(value) <= 999_999_999;

/** Returns a normalized link, or null when the value is not a well-formed link. */
export function parseHostLink(value: unknown): HostLink | null {
  if (!value || typeof value !== 'object') return null;
  const { connectionId, node, vmid, type, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length) return null;
  if (!Number.isSafeInteger(connectionId) || Number(connectionId) <= 0) return null;
  if (!isNodeName(node) || !isVmid(vmid) || (type !== 'qemu' && type !== 'lxc')) return null;
  return { connectionId: Number(connectionId), node, vmid, type };
}
