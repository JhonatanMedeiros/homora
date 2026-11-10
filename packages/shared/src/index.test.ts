import { describe, expect, it } from 'vitest';
import { validateService } from './index.js';
describe('validateService', () => {
  it('normaliza um serviço válido', () => {
    expect(
      validateService({
        name: ' Jellyfin ',
        category: ' Mídia ',
        url: 'http://localhost:8096',
        description: ' Filmes ',
      }),
    ).toEqual({
      name: 'Jellyfin',
      category: 'Mídia',
      url: 'http://localhost:8096/',
      description: 'Filmes',
      icon: '',
      position: 0,
      allowPrivate: false,
    });
  });
  it.each(['javascript:alert(1)', 'http://user:pass@localhost', 'inválida'])(
    'rejeita URL inválida: %s',
    (url) => {
      expect(() => validateService({ name: 'Teste', category: 'Casa', url })).toThrow();
    },
  );
  it('rejeita campos obrigatórios ausentes', () => {
    expect(() =>
      validateService({ name: '', category: 'Casa', url: 'http://localhost' }),
    ).toThrow();
  });
});
