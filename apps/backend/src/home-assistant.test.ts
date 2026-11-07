import { expect, it, vi } from 'vitest';
import { createHomeAssistantAdapter } from './home-assistant.js';
const config = {
  url: 'https://ha.example:8123',
  token: 'fake-token',
  entityId: 'sensor.temperature',
};
it('consulta apenas a entidade escolhida e retorna somente campos necessários', async () => {
  const transport = vi.fn(async () => ({
    status: 200,
    body: {
      entity_id: config.entityId,
      state: '23',
      last_updated: '2026-01-01T00:00:00Z',
      attributes: { private: 'ignore' },
    },
  }));
  const adapter = createHomeAssistantAdapter(transport);
  expect(await adapter.collect(config)).toEqual({
    entityId: config.entityId,
    state: '23',
    lastUpdated: '2026-01-01T00:00:00Z',
  });
  expect(transport).toHaveBeenCalledWith({
    origin: config.url,
    path: '/api/states/sensor.temperature',
    authorization: 'Bearer fake-token',
  });
});
it('rejeita destinos e entidades inválidos antes de enviar credenciais', async () => {
  const transport = vi.fn();
  const adapter = createHomeAssistantAdapter(transport);
  for (const overrides of [
    { url: 'http://ha.example' },
    { url: 'https://user:pass@ha.example' },
    { entityId: '../secret' },
    { token: 'secret\r\nInjected' },
  ])
    await expect(adapter.collect({ ...config, ...overrides })).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});
it('não inclui erros ou corpo do servidor em falhas', async () => {
  const adapter = createHomeAssistantAdapter(async () => {
    throw new Error('fake-token');
  });
  await expect(adapter.collect(config)).rejects.toThrow('Não foi possível conectar');
  const failed = createHomeAssistantAdapter(async () => ({ status: 401, body: 'fake-token' }));
  await expect(failed.collect(config)).rejects.toThrow('autenticação');
  const malformed = createHomeAssistantAdapter(async () => ({
    status: 200,
    body: { entity_id: 'other.entity', state: 'ok' },
  }));
  await expect(malformed.collect(config)).rejects.toThrow('Resposta inválida');
});
