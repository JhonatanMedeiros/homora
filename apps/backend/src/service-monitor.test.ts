import { describe, expect, it, vi } from 'vitest';
import { getAuthorizedResponse } from './network-request.js';
import { checkService, classify, createServiceMonitor } from './service-monitor.js';
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

const ok = { httpStatus: 200, latencyMs: 12 };

describe('monitoramento de serviços', () => {
  it('classifica o código HTTP sem tratar login ou redirecionamento como queda', () => {
    expect(classify(200)).toEqual({ status: 'available', reason: 'responding' });
    expect(classify(204)).toEqual({ status: 'available', reason: 'responding' });
    expect(classify(302)).toEqual({ status: 'available', reason: 'redirect' });
    expect(classify(401)).toEqual({ status: 'available', reason: 'login-required' });
    expect(classify(403)).toEqual({ status: 'available', reason: 'login-required' });
    expect(classify(404)).toEqual({ status: 'unavailable', reason: 'not-found' });
    expect(classify(418)).toEqual({ status: 'unavailable', reason: 'error-status' });
    expect(classify(503)).toEqual({ status: 'unavailable', reason: 'error-status' });
  });

  it('guarda o código HTTP e a latência de cada verificação', async () => {
    const codes = [302, 401, 404, 500];
    const monitor = createServiceMonitor(
      async () => codes.map((_, index) => service(index + 1, `https://s${index}.example`)),
      async (url) => ({ httpStatus: codes[Number(url.match(/s(\d)/)?.[1])], latencyMs: 7 }),
    );
    await monitor.run(true);
    const snapshot = monitor.snapshot();
    expect(snapshot[1]).toMatchObject({ reason: 'redirect', httpStatus: 302, latencyMs: 7 });
    expect(snapshot[2]).toMatchObject({ status: 'available', reason: 'login-required' });
    expect(snapshot[3]).toMatchObject({ status: 'unavailable', reason: 'not-found' });
    expect(snapshot[4]).toMatchObject({ status: 'unavailable', reason: 'error-status' });
  });

  it('nega por padrão e permite explicitamente privado mantendo a política comum', async () => {
    vi.mocked(getAuthorizedResponse).mockResolvedValue({ status: 204, body: '' });
    expect(await checkService('https://public.example/status')).toMatchObject({ httpStatus: 204 });
    expect(getAuthorizedResponse).toHaveBeenCalledWith(
      'https://public.example/status',
      {
        origins: ['https://public.example'],
        allowPrivate: false,
      },
      { timeoutMs: 8000, reportRedirect: true },
    );
    expect(await checkService('http://192.168.1.20:8096/health', true)).toMatchObject({
      httpStatus: 204,
    });
    expect(getAuthorizedResponse).toHaveBeenLastCalledWith(
      'http://192.168.1.20:8096/health',
      { origins: ['http://192.168.1.20:8096'], allowPrivate: true },
      { timeoutMs: 8000, reportRedirect: true },
    );
  });

  it('passa o opt-in individual ao verificador e mantém falso para serviços antigos', async () => {
    const check = vi.fn(async () => ok);
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
      return ok;
    });
    const monitor = createServiceMonitor(
      async () => [service(1, 'https://ok.example'), service(2, 'https://falha.example')],
      check,
      () => time,
    );
    expect(monitor.snapshot()).toEqual({});
    await monitor.run();
    const attempt = new Date(time).toISOString();
    expect(monitor.snapshot()).toEqual({
      1: {
        status: 'available',
        lastAttempt: attempt,
        reason: 'responding',
        httpStatus: 200,
        latencyMs: 12,
      },
      2: {
        status: 'unavailable',
        lastAttempt: attempt,
        reason: 'no-response',
        httpStatus: null,
        latencyMs: null,
      },
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
      async () => ok,
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
    const check = vi.fn(async () => ok);
    const monitor = createServiceMonitor(async () => services, check);
    await monitor.run(true);
    expect(check).toHaveBeenCalledTimes(25);
    expect(monitor.snapshot()[25]).toMatchObject({ status: 'available' });
    const notChecked = {
      status: 'unknown',
      lastAttempt: null,
      reason: 'unchecked',
      httpStatus: null,
      latencyMs: null,
    };
    expect(monitor.snapshot()[26]).toEqual(notChecked);
    expect(monitor.snapshot()[27]).toEqual(notChecked);
  });
});
