/** Guest kinds and identifiers supported by Proxmox. */
export type GuestType = 'qemu' | 'lxc';
export const isNodeName = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})$/.test(value);
export const isVmid = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 100 && Number(value) <= 999_999_999;
export type ProxmoxConfig = { url: string; tokenId: string; secret: string; ca?: string };
