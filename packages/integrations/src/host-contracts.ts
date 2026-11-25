/** Normalized read-only host inventory shared by integrations and product workflows. */
export type GuestType = 'qemu' | 'lxc';
export type HostNodeState = 'online' | 'offline' | 'unknown';
/** Used and total amount of a resource (bytes). `total` is always greater than zero. */
export type HostUsage = { used: number; total: number };
/**
 * Optional live load of a node or a guest, read from the same inventory call. Every field is
 * omitted when it is unknown (offline node, stopped guest, missing or invalid value): a missing
 * metric is never reported as zero.
 */
export type HostMetrics = {
  /** Fraction of the CPU in use, from 0 to 1. */
  cpu?: number;
  memory?: HostUsage;
  /** Nodes only: the disk usage a guest reports is not meaningful for a running VM. */
  disk?: HostUsage;
};
export type HostNode = { name: string; status: HostNodeState; metrics?: HostMetrics };
export type HostGuest = {
  vmid: number;
  name: string;
  type: GuestType;
  node: string;
  status: string;
  metrics?: HostMetrics;
};
export type HostInventoryData = { nodes: HostNode[]; guests: HostGuest[] };
export type HostGuestAddresses = {
  node: string;
  vmid: number;
  type: GuestType;
  config: string[];
  agent: string[];
};

export const isNodeName = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})$/.test(value);
export const isVmid = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 100 && Number(value) <= 999_999_999;
