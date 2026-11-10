import { describe, expect, it, vi } from 'vitest';
import { getAuthorizedResponse } from './network-request.js';
import { checkService, createServiceMonitor } from './service-monitor.js';
import type { Service } from '@homora/shared';

vi.mock('./network-request.js', () => ({
  getAuthorizedResponse: vi.fn(),
}));

const service = (id: number, url: string): Service => ({
  id,
  name: `Serviço ${id}`,
  url,
  category: 'Teste',
  description: '',
});

describe('monitoramento de serviços', () => {
  it('nega por padrão e permite explicitamente privado mantendo a política comum', async () => {
    vi.mocked(getAuthorizedResponse).mockResolvedValue({ status: 204, body: '' });
    expect(await checkService('https://public.example/status')).toBe(true);
    expect(getAuthorizedResponse).toHaveBeenCalledWith(
      'https://public.example/status',
      {
        origins: ['https://public.example'],
        allowPrivate: false,
      },
      { timeoutMs: 8000 },
    );
    expect(await checkService('http://192.168.1.20:8096/health', true)).toBe(true);
    expect(getAuthorizedResponse).toHaveBeenLastCalledWith(
      'http://192.168.1.20:8096/health',
      { origins: ['http://192.168.1.20:8096'], allowPrivate: true },
      { timeoutMs: 8000 },
    );
  });

  it('passa o opt-in individual ao verificador e mantém falso para serviços antigos', async () => {
    const check = vi.fn(async () => true);
    const monitor = createServiceMonitor(
      async () => [
        service(1, 'http://192.168.1.2'),
        { ...service(2, 'http://[fd00::1]'), allowPrivate: true },
      ],
      check,
    );
    await monitor.run(true);
    expect(check).toHaveBeenNthCalledWith(1, 'http://192.168.1.2', false);
    expect(check).toHaveBeenNthCalledWith(2, 'http://[fd00::1]', true);
  });

  it('retorna estado desconhecido antes da execução e armazena tentativas com cache', async () => {
    let time = 1_800_000_000_000;
    const check = vi.fn(async (url: string) => {
      if (url.includes('falha')) throw new Error('conexão recusada');
      return true;
    });
    const monitor = createServiceMonitor(
      async () => [service(1, 'https://ok.example'), service(2, 'https://falha.example')],
      check,
      () => time,
    );
    expect(monitor.snapshot()).toEqual({});
    await monitor.run();
    expect(monitor.snapshot()).toEqual({
      1: { status: 'available', lastAttempt: new Date(time).toISOString() },
      2: { status: 'unavailable', lastAttempt: new Date(time).toISOString() },
    });
    await monitor.run();
    expect(check).toHaveBeenCalledTimes(2);
    time += 60_001;
    await monitor.run();
    expect(check).toHaveBeenCalledTimes(4);
    await monitor.invalidate();
    expect(check).toHaveBeenCalledTimes(6);
    expect(monitor.snapshot()[1].lastAttempt).toBe(new Date(time).toISOString());
  });

  it('isola falhas do repositório e remove estado de serviços excluídos', async () => {
    let list = [service(1, 'https://ok.example')];
    const monitor = createServiceMonitor(
      async () => list,
      async () => true,
    );
    await monitor.run();
    list = [];
    await monitor.run(true);
    expect(monitor.snapshot()).toEqual({});
    const unavailable = createServiceMonitor(async () => {
      throw new Error('database unavailable');
    });
    await expect(unavailable.run(true)).resolves.toBeUndefined();
    expect(unavailable.snapshot()).toEqual({});
  });

  it('limita cada ciclo a 25 serviços e deixa o restante desconhecido', async () => {
    const services = Array.from({ length: 27 }, (_, index) =>
      service(index + 1, `https://service-${index + 1}.example`),
    );
    const check = vi.fn(async () => true);
    const monitor = createServiceMonitor(async () => services, check);
    await monitor.run(true);
    expect(check).toHaveBeenCalledTimes(25);
    expect(monitor.snapshot()[25]).toMatchObject({ status: 'available' });
    expect(monitor.snapshot()[26]).toEqual({ status: 'unknown', lastAttempt: null });
    expect(monitor.snapshot()[27]).toEqual({ status: 'unknown', lastAttempt: null });
  });
});
