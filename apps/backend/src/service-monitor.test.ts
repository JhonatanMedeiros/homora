import { describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { getAuthorizedResponse } from './network-request.js';
import { authorizeDestination } from './network-policy.js';
import {
  checkService,
  classify,
  createServiceMonitor,
  PingUnavailableError,
} from './service-monitor.js';
import type { Service } from '@homora/shared';

vi.mock('./network-request.js', () => ({
  getAuthorizedResponse: vi.fn(),
}));
vi.mock('./network-policy.js', () => ({ authorizeDestination: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

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
    expect(check).toHaveBeenNthCalledWith(1, 'http://192.168.1.2', false, 'http');
    expect(check).toHaveBeenNthCalledWith(2, 'http://[fd00::1]', true, 'http');
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

  it('verifica todos os serviços, sem limite fixo de quantidade', async () => {
    const services = Array.from({ length: 60 }, (_, index) =>
      service(index + 1, `https://service-${index + 1}.example`),
    );
    const check = vi.fn(async () => ok);
    const monitor = createServiceMonitor(async () => services, check);
    await monitor.run(true);
    expect(check).toHaveBeenCalledTimes(60);
    expect(Object.values(monitor.snapshot()).every((s) => s.reason === 'responding')).toBe(true);
  });

  it('para de iniciar verificações ao esgotar o orçamento e começa pelos mais antigos no ciclo seguinte', async () => {
    let time = 1_800_000_000_000;
    const services = Array.from({ length: 12 }, (_, index) =>
      service(index + 1, `https://service-${index + 1}.example`),
    );
    // Cada verificação "consome" 10 s do relógio, então o orçamento do ciclo se esgota
    // depois da primeira leva de cinco em paralelo.
    const checked: string[] = [];
    const check = vi.fn(async (url: string) => {
      checked.push(url);
      time += 10_000;
      return ok;
    });
    const monitor = createServiceMonitor(
      async () => services,
      check,
      () => time,
    );
    await monitor.run(true);
    const first = checked.length;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(12);
    const snapshot = monitor.snapshot();
    const unchecked = Object.entries(snapshot).filter(([, s]) => s.reason === 'unchecked');
    expect(unchecked.length).toBe(12 - first);
    const waiting = unchecked.map(([id]) => Number(id));
    checked.length = 0;
    time += 60_001;
    await monitor.run(true);
    // Os que ficaram sem verificar passam à frente dos já verificados.
    expect(checked.length).toBeGreaterThan(0);
    const waitingUrls = new Set(waiting.map((id) => `https://service-${id}.example`));
    expect(checked.every((url) => waitingUrls.has(url))).toBe(true);
  });

  it('mantém o estado anterior de um serviço enquanto o ciclo seguinte ainda não o alcançou', async () => {
    let time = 1_800_000_000_000;
    let code = 200;
    const monitor = createServiceMonitor(
      async () => [service(1, 'https://a.example')],
      async () => ({ httpStatus: code, latencyMs: 3 }),
      () => time,
    );
    await monitor.run(true);
    expect(monitor.snapshot()[1]).toMatchObject({ reason: 'responding' });
    code = 500;
    time += 60_001;
    const run = monitor.run();
    expect(monitor.snapshot()[1]).toMatchObject({ reason: 'responding' });
    await run;
    expect(monitor.snapshot()[1]).toMatchObject({ reason: 'error-status' });
  });

  it('respeita o intervalo de cada serviço e usa 60 s quando não há um definido', async () => {
    let time = 1_800_000_000_000;
    const check = vi.fn(async (url: string) => (url ? ok : ok));
    const monitor = createServiceMonitor(
      async () => [
        { ...service(1, 'https://rapido.example'), checkInterval: 30 },
        service(2, 'https://padrao.example'),
        { ...service(3, 'https://lento.example'), checkInterval: 300 },
      ],
      check,
      () => time,
    );
    await monitor.run();
    expect(check).toHaveBeenCalledTimes(3);
    time += 30_000;
    await monitor.run();
    expect(check.mock.calls.slice(3).map(([url]) => url)).toEqual(['https://rapido.example']);
    time += 30_000;
    await monitor.run();
    expect(
      check.mock.calls
        .slice(4)
        .map(([url]) => url)
        .sort(),
    ).toEqual(['https://padrao.example', 'https://rapido.example']);
    time += 240_000;
    await monitor.run();
    expect(check.mock.calls.some(([url]) => url === 'https://lento.example')).toBe(true);
    expect(check.mock.calls.filter(([url]) => url === 'https://lento.example')).toHaveLength(2);
  });

  it('passa o tipo de verificação e trata ping respondido como disponível', async () => {
    const check = vi.fn(async (_url: string, _private?: boolean, type?: string) =>
      type === 'ping' ? { httpStatus: null, latencyMs: 4 } : ok,
    );
    const monitor = createServiceMonitor(
      async () => [{ ...service(1, 'http://192.168.1.9'), checkType: 'ping', allowPrivate: true }],
      check,
    );
    await monitor.run(true);
    expect(check).toHaveBeenCalledWith('http://192.168.1.9', true, 'ping');
    expect(monitor.snapshot()[1]).toMatchObject({
      status: 'available',
      reason: 'reachable',
      httpStatus: null,
      latencyMs: 4,
    });
  });

  it('ping sem resposta é indisponível; sem o binário ping o serviço fica sem verificação', async () => {
    let failure: Error = new Error('timeout');
    const monitor = createServiceMonitor(
      async () => [{ ...service(1, 'http://192.168.1.9'), checkType: 'ping' }],
      async () => {
        throw failure;
      },
    );
    await monitor.run(true);
    expect(monitor.snapshot()[1]).toMatchObject({ status: 'unavailable', reason: 'no-response' });
    failure = new PingUnavailableError();
    await monitor.run(true);
    expect(monitor.snapshot()[1]).toMatchObject({ status: 'unknown', reason: 'unchecked' });
  });

  it('executa o ping só no IP autorizado, sem shell, e lê a latência', async () => {
    vi.mocked(authorizeDestination).mockResolvedValue({
      url: new URL('http://nas.lan/'),
      address: { address: '192.168.1.7', family: 4 },
    });
    vi.mocked(execFile).mockImplementation(((
      _file: string,
      _args: string[],
      _opts: unknown,
      cb: (e: null, out: string) => void,
    ) => {
      cb(null, '64 bytes from 192.168.1.7: icmp_seq=1 ttl=64 time=3.42 ms');
    }) as never);
    await expect(checkService('http://nas.lan/', true, 'ping')).resolves.toEqual({
      httpStatus: null,
      latencyMs: 3,
    });
    expect(authorizeDestination).toHaveBeenCalledWith('http://nas.lan/', {
      origins: ['http://nas.lan'],
      allowPrivate: true,
    });
    expect(vi.mocked(execFile).mock.calls[0].slice(0, 2)).toEqual([
      'ping',
      ['-4', '-c', '1', '-W', '2', '-n', '192.168.1.7'],
    ]);
    vi.mocked(execFile).mockImplementation(((
      _f: string,
      _a: string[],
      _o: unknown,
      cb: (e: Error) => void,
    ) => {
      cb(Object.assign(new Error('x'), { code: 'ENOENT' }));
    }) as never);
    await expect(checkService('http://nas.lan/', true, 'ping')).rejects.toBeInstanceOf(
      PingUnavailableError,
    );
    vi.mocked(execFile).mockImplementation(((
      _f: string,
      _a: string[],
      _o: unknown,
      cb: (e: Error) => void,
    ) => {
      cb(Object.assign(new Error('x'), { code: 126 }));
    }) as never);
    await expect(checkService('http://nas.lan/', true, 'ping')).rejects.toBeInstanceOf(
      PingUnavailableError,
    );
    vi.mocked(authorizeDestination).mockRejectedValue(new Error('Destino não autorizado.'));
    await expect(checkService('http://nas.lan/', false, 'ping')).rejects.toThrow('autorizado');
  });
});
