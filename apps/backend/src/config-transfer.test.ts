import { describe, expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import { parseTransfer, planImport, serializeConfiguration } from './config-transfer.js';

const service = (patch: Partial<Service>): Service => ({
  id: 1,
  name: 'Jellyfin',
  url: 'http://localhost:8096/',
  category: 'Mídia',
  description: '',
  icon: '',
  position: 0,
  allowPrivate: false,
  ...patch,
});
const none = { groups: [], services: [] };

describe('exportação', () => {
  it('mantém a ordem dos grupos e dos cards e omite valores vazios', () => {
    const text = serializeConfiguration(
      [{ name: 'Casa' }, { name: 'Mídia' }],
      [
        service({ id: 2, name: 'Plex', position: 1, icon: 'lucide:film' }),
        service({ id: 1, name: 'Jellyfin', position: 0, allowPrivate: true }),
      ],
      'yaml',
    );
    const parsed = parseTransfer(text);
    expect(parsed.issues).toEqual([]);
    expect(parsed.document.groups.map((g) => g.name)).toEqual(['Casa', 'Mídia']);
    expect(parsed.document.groups[1].services.map((s) => s.name)).toEqual(['Jellyfin', 'Plex']);
    expect(text).not.toContain('description');
    expect(text).not.toContain('id:');
  });

  it('gera JSON equivalente ao YAML e reimporta sem perdas', () => {
    const services = [service({ icon: 'https://exemplo.test/a.svg', description: 'Filmes' })];
    const yaml = parseTransfer(serializeConfiguration([{ name: 'Mídia' }], services, 'yaml'));
    const json = parseTransfer(serializeConfiguration([{ name: 'Mídia' }], services, 'json'));
    expect(json.document).toEqual(yaml.document);
    expect(json.document.groups[0].services[0]).toEqual({
      name: 'Jellyfin',
      url: 'http://localhost:8096/',
      description: 'Filmes',
      icon: 'https://exemplo.test/a.svg',
      allowPrivate: false,
    });
  });

  it('inclui grupos vazios', () => {
    const parsed = parseTransfer(serializeConfiguration([{ name: 'Vazio' }], [], 'json'));
    expect(parsed.document.groups).toEqual([{ name: 'Vazio', services: [] }]);
  });
});

describe('leitura', () => {
  it.each([
    ['sintaxe inválida', 'groups: [unclosed', 'invalid-syntax'],
    ['documento sem grupos', 'version: 1\n', 'invalid-document'],
    ['raiz que não é objeto', '- a\n- b', 'invalid-document'],
    ['versão não suportada', 'version: 2\ngroups: []', 'unsupported-version'],
  ])('rejeita %s', (_name, content, code) => {
    const parsed = parseTransfer(content);
    expect(parsed.issues).toEqual([{ path: '', code, severity: 'error' }]);
    expect(parsed.document.groups).toEqual([]);
  });

  it('ignora itens inválidos e informa o caminho de cada um', () => {
    const parsed = parseTransfer(`
version: 1
groups:
  - name: Casa
    services:
      - { name: Bom, url: "http://localhost/" }
      - { name: "", url: "http://localhost/" }
      - { name: Sem URL, url: "nada" }
      - { name: Perigoso, url: "javascript:alert(1)" }
      - { name: Credenciais, url: "http://u:p@localhost/" }
      - "texto"
  - name: ""
    services: []
`);
    expect(parsed.document.groups).toHaveLength(1);
    expect(parsed.document.groups[0].services.map((s) => s.name)).toEqual(['Bom']);
    expect(parsed.issues.map((i) => [i.path, i.code])).toEqual([
      ['groups[0].services[1]', 'invalid-name'],
      ['groups[0].services[2]', 'invalid-url'],
      ['groups[0].services[3]', 'invalid-url'],
      ['groups[0].services[4]', 'invalid-url'],
      ['groups[0].services[5]', 'invalid-service'],
      ['groups[1]', 'invalid-group'],
    ]);
  });

  it('importa o serviço e avisa quando o ícone é descartado', () => {
    const parsed = parseTransfer(
      'version: 1\ngroups:\n  - name: A\n    services:\n      - { name: S, url: "http://x.test", icon: "lucide:Inválido" }',
    );
    expect(parsed.document.groups[0].services[0].icon).toBe('');
    expect(parsed.issues).toEqual([
      { path: 'groups[0].services[0]', code: 'icon-ignored', severity: 'warning' },
    ]);
  });

  it('limita aliases e tamanho do arquivo', () => {
    const bomb = `version: 1\nx: &a [1,1,1,1,1,1,1,1,1,1]\ngroups: [${Array(20).fill('*a').join(',')}]`;
    expect(parseTransfer(bomb).issues[0].severity).toBe('error');
    expect(parseTransfer('x'.repeat(1_000_001)).issues[0].code).toBe('invalid-document');
  });

  it('recusa arquivos com cards demais', () => {
    const services = Array.from(
      { length: 1001 },
      (_, i) => `{name: S${i}, url: "http://x.test/${i}"}`,
    );
    const parsed = parseTransfer(
      `version: 1\ngroups:\n  - name: A\n    services: [${services.join(',')}]`,
    );
    expect(parsed.issues.map((i) => i.code)).toEqual(['too-many-services']);
  });
});

describe('plano', () => {
  const file = parseTransfer(`
version: 1
groups:
  - name: Mídia
    services:
      - { name: Jellyfin, url: "http://localhost:8096/" }
      - { name: Plex, url: "http://localhost:32400/" }
      - { name: Plex 2, url: "http://localhost:32400/" }
  - name: Novo
    services: []
`);

  it('marca duplicados já existentes e repetidos no arquivo', () => {
    const plan = planImport(file, {
      groups: ['Mídia'],
      services: [{ category: 'Mídia', url: 'http://localhost:8096/' }],
    });
    expect(plan.services.map((s) => s.status)).toEqual(['duplicate', 'new', 'duplicate']);
    expect(plan.groups).toEqual([
      { name: 'Mídia', status: 'existing' },
      { name: 'Novo', status: 'new' },
    ]);
    expect(plan.summary).toMatchObject({
      newGroups: 1,
      newServices: 1,
      duplicates: 2,
      warnings: 1,
    });
  });

  it('a mesma URL em outro grupo não é duplicada', () => {
    const plan = planImport(file, {
      groups: [],
      services: [{ category: 'Outro', url: 'http://localhost:8096/' }],
    });
    expect(plan.summary.duplicates).toBe(1);
    expect(plan.services[0].status).toBe('new');
  });

  it('com configuração vazia tudo é novo', () => {
    expect(planImport(file, none).summary.newServices).toBe(2);
  });
});
