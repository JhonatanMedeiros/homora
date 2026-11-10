import { describe, expect, it } from 'vitest';
import { normalizeIcon, validateService } from './index.js';
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

describe('normalizeIcon', () => {
  it('mantém emoji e texto curto, truncando em oito caracteres', () => {
    expect(normalizeIcon(' 🎬 ')).toBe('🎬');
    expect(normalizeIcon('abcdefghij')).toBe('abcdefgh');
    expect(normalizeIcon(undefined)).toBe('');
  });
  it('aceita ícones embutidos por nome', () => {
    expect(normalizeIcon('lucide:server')).toBe('lucide:server');
    expect(normalizeIcon('lucide:hard-drive')).toBe('lucide:hard-drive');
  });
  it.each(['lucide:', 'lucide:Server', 'lucide:a b', 'lucide:../x', 'lucide:a--b'])(
    'descarta nome de ícone inválido: %s',
    (value) => expect(normalizeIcon(value)).toBe(''),
  );
  it('aceita URL http(s) sem credenciais e normaliza', () => {
    expect(normalizeIcon('https://exemplo.test/icons/a.png')).toBe(
      'https://exemplo.test/icons/a.png',
    );
    expect(normalizeIcon('http://192.168.1.2/a.svg')).toBe('http://192.168.1.2/a.svg');
  });
  it.each([
    'https://user:pass@exemplo.test/a.png',
    'https://',
    `https://exemplo.test/${'a'.repeat(600)}`,
  ])('descarta URL inválida, com credenciais ou longa demais: %.40s', (value) =>
    expect(normalizeIcon(value)).toBe(''),
  );
  it('não aceita esquemas perigosos como URL', () => {
    expect(normalizeIcon('javascript:alert(1)')).toBe('javascri');
    expect(normalizeIcon('data:image/svg+xml,<svg/>')).toBe('data:ima');
  });
});
