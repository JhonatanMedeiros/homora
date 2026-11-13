/** Normalized read-only host inventory shared by integrations and product workflows. */
export type GuestType = 'qemu' | 'lxc';
export type HostNodeState = 'online' | 'offline' | 'unknown';
export type HostNode = { name: string; status: HostNodeState };
export type HostGuest = {
  vmid: number;
  name: string;
  type: GuestType;
  node: string;
  status: string;
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
