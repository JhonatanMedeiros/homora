import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import { afterEach, expect, it, vi } from 'vitest';
import { jellyfinAdapter } from './jellyfin.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('rejeita protocolos, credenciais e parâmetros na URL', () => {
  for (const url of [
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'http://example.com/?key=secret',
  ])
    expect(() => jellyfinAdapter.validate({ url })).toThrow();
});

it('consulta somente a API pública, retornando apenas nome e versão', async () => {
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const res = Object.assign(new EventEmitter(), { statusCode: 200, resume: vi.fn() });
  const spy = vi.spyOn(http, 'get').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => {
      (args[1] as (response: typeof res) => void)(res);
      res.emit(
        'data',
        Buffer.from(JSON.stringify({ ServerName: 'Servidor', Version: '10.10', Id: 'privado' })),
      );
      res.emit('end');
      req.emit('close');
    });
    return req as unknown as ReturnType<typeof http.get>;
  });
  await expect(jellyfinAdapter.collect({ url: 'http://example.test/jellyfin/' })).resolves.toEqual({
    name: 'Servidor',
    version: '10.10',
  });
  expect(spy.mock.calls[0][0]).toBe('http://example.test/jellyfin/System/Info/Public');
});

it('rejeita respostas HTTP inválidas e não segue redirecionamentos', async () => {
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const res = Object.assign(new EventEmitter(), { statusCode: 302, resume: vi.fn() });
  vi.spyOn(https, 'get').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => {
      (args[1] as (response: typeof res) => void)(res);
      req.emit('close');
    });
    return req as unknown as ReturnType<typeof https.get>;
  });
  await expect(jellyfinAdapter.collect({ url: 'https://example.test' })).rejects.toThrow(
    'HTTP 302',
  );
  expect(res.resume).toHaveBeenCalled();
});

it('rejeita resposta malformada sem divulgar dados brutos', async () => {
  const req = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  const res = Object.assign(new EventEmitter(), { statusCode: 200, resume: vi.fn() });
  vi.spyOn(http, 'get').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => {
      (args[1] as (response: typeof res) => void)(res);
      res.emit('data', Buffer.from('{"ServerName":42}'));
      res.emit('end');
      req.emit('close');
    });
    return req as unknown as ReturnType<typeof http.get>;
  });
  await expect(jellyfinAdapter.collect({ url: 'http://example.test' })).rejects.toThrow(
    'Resposta Jellyfin inválida',
  );
});

it('encerra consultas que ultrapassam o tempo limite', async () => {
  vi.useFakeTimers();
  const req = Object.assign(new EventEmitter(), {
    destroy: vi.fn(function (this: EventEmitter) {
      this.emit('error', new Error('timeout'));
      this.emit('close');
    }),
  });
  vi.spyOn(http, 'get').mockReturnValue(req as unknown as ReturnType<typeof http.get>);
  const result = jellyfinAdapter.collect({ url: 'http://example.test' });
  const assertion = expect(result).rejects.toThrow('Não foi possível consultar');
  await vi.advanceTimersByTimeAsync(8000);
  await assertion;
  expect(req.destroy).toHaveBeenCalled();
});

it('interrompe respostas maiores que o limite', async () => {
  const req = Object.assign(new EventEmitter(), {
    destroy: vi.fn(function (this: EventEmitter) {
      this.emit('error', new Error('limite'));
      this.emit('close');
    }),
  });
  const res = Object.assign(new EventEmitter(), { statusCode: 200, resume: vi.fn() });
  vi.spyOn(http, 'get').mockImplementation((...args: unknown[]) => {
    queueMicrotask(() => {
      (args[1] as (response: typeof res) => void)(res);
      res.emit('data', Buffer.alloc(262145));
    });
    return req as unknown as ReturnType<typeof http.get>;
  });
  await expect(jellyfinAdapter.collect({ url: 'http://example.test' })).rejects.toThrow();
  expect(req.destroy).toHaveBeenCalled();
});
