import { expect, it, vi } from 'vitest';
import { createProxmoxConnectionAdapter } from './testing.js';

const config = { url: 'https://pve.example:8006', tokenId: 'user@pve!test', secret: 'test' };

it('uses the authorized transport and returns only aggregated data', async () => {
  const transport = vi.fn(async () => ({
    status: 200,
    body: { data: [{ type: 'qemu', status: 'running', name: 'private' }] },
  }));
  const result = await createProxmoxConnectionAdapter(transport).collect(config);
  expect(result.vms).toEqual({ running: 1, total: 1 });
  expect(JSON.stringify(result)).not.toContain('private');
  expect(transport).toHaveBeenCalledWith({
    origin: config.url,
    path: '/api2/json/cluster/resources',
    authorization: 'PVEAPIToken=user@pve!test=test',
    maxBodyBytes: 2_000_000,
  });
});

it('rejects unsafe configuration and invalid responses', async () => {
  const adapter = createProxmoxConnectionAdapter(async () => ({ status: 200, body: {} }));
  expect(() => adapter.validate({ ...config, url: 'http://pve.example' })).toThrow();
  await expect(adapter.collect(config)).rejects.toThrow('Invalid Proxmox response');
});
