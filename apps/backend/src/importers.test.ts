import { describe, expect, it } from 'vitest';
import { mapIcon, parseBySource, parseDashy, parseHomepage } from './importers.js';

const names = (parsed: ReturnType<typeof parseHomepage>) =>
  parsed.document.groups.map((g) => [g.name, g.services.map((s) => s.name)]);
const codes = (parsed: ReturnType<typeof parseHomepage>) =>
  parsed.issues.map((i) => `${i.path}:${i.code}`);

describe('mapIcon', () => {
  it.each([
    ['', '', false],
    ['favicon', '', false],
    ['https://exemplo.test/a.svg', 'https://exemplo.test/a.svg', false],
    ['🎬', '🎬', false],
    ['mdi-server', 'lucide:server', false],
    ['si-docker', '', true],
    ['mdi-server-outline', 'lucide:server', false],
    ['router.png', 'lucide:router', false],
    ['fas fa-database', 'lucide:database', false],
    ['sonarr.png', '', true],
    ['hl-plex', '', true],
    ['javascript:alert(1)', '', true],
  ])('%s -> %s', (raw, icon, unsupported) => {
    expect(mapIcon(raw)).toEqual({ icon, unsupported });
  });
  it('ignora valores que não são texto', () => {
    expect(mapIcon(42)).toEqual({ icon: '', unsupported: false });
    expect(mapIcon(null)).toEqual({ icon: '', unsupported: false });
  });
});

describe('Homepage', () => {
  it('lê services.yaml com grupos, grupos aninhados e widgets', () => {
    const parsed = parseHomepage(`
- Media:
    - Jellyfin:
        icon: mdi-server
        href: http://192.168.1.10:8096
        description: Movies & TV
        siteMonitor: http://192.168.1.10:8096
        widget:
          type: jellyfin
          key: segredo
    - Sonarr:
        icon: sonarr.png
        href: http://192.168.1.10:8989
- Infra:
    - Docker:
        - Portainer:
            href: https://portainer.test
`);
    expect(names(parsed)).toEqual([
      ['Media', ['Jellyfin', 'Sonarr']],
      ['Infra / Docker', ['Portainer']],
    ]);
    const jellyfin = parsed.document.groups[0].services[0];
    expect(jellyfin).toMatchObject({
      url: 'http://192.168.1.10:8096/',
      description: 'Movies & TV',
      icon: 'lucide:server',
      allowPrivate: false,
    });
    expect(JSON.stringify(parsed)).not.toContain('segredo');
    expect(codes(parsed)).toEqual([
      'root[0].Media[0]:widget-ignored',
      'root[0].Media[1]:icon-unsupported',
    ]);
  });

  it('lê bookmarks.yaml', () => {
    const parsed = parseHomepage(`
- Developer:
    - Github:
        - abbr: GH
          href: https://github.com/
- Social:
    - Reddit:
        - icon: reddit.png
          href: https://reddit.com/
          description: Front page
`);
    expect(names(parsed)).toEqual([
      ['Developer', ['Github']],
      ['Social', ['Reddit']],
    ]);
    expect(parsed.document.groups[1].services[0].description).toBe('Front page');
    expect(codes(parsed)).toEqual(['root[1].Social[0]:icon-unsupported']);
  });

  it('relata entradas sem URL válida e entradas fora de um grupo', () => {
    const parsed = parseHomepage(`
- Casa:
    - Sem href:
        description: x
    - Variável:
        href: "{{HOMEPAGE_VAR_URL}}"
    - Ok:
        href: http://x.test
- Solto:
    href: http://x.test
- 42
`);
    expect(names(parsed)).toEqual([['Casa', ['Ok']]]);
    expect(codes(parsed)).toEqual([
      'root[0].Casa[0]:invalid-url',
      'root[0].Casa[1]:invalid-url',
      'root[1]:invalid-group',
      'root[2]:invalid-group',
    ]);
  });

  it.each([
    ['sintaxe inválida', '- a: [unclosed', 'invalid-syntax'],
    ['raiz que não é lista', 'a: 1', 'invalid-document'],
    ['arquivo vazio', '', 'invalid-document'],
  ])('rejeita %s', (_n, content, code) => {
    expect(parseHomepage(content).issues).toEqual([{ path: '', code, severity: 'error' }]);
  });

  it('avisa quando o nome do grupo é encurtado', () => {
    const long = 'G'.repeat(50);
    const parsed = parseHomepage(`- ${long}:\n    - S:\n        href: http://x.test`);
    expect(parsed.document.groups[0].name).toHaveLength(40);
    expect(parsed.issues.map((i) => i.code)).toEqual(['group-renamed']);
  });
});

describe('Dashy', () => {
  it('lê seções, itens, subitens e avisa sobre páginas e widgets', () => {
    const parsed = parseDashy(`
pageInfo:
  title: Home Lab
appConfig:
  theme: colorful
pages:
  - name: Media
    path: media.yml
sections:
  - name: Dev Tools
    icon: fas fa-code
    items:
      - title: GitHub
        description: Source code
        url: https://github.com
        icon: fab fa-github
        subItems:
          - title: Issues
            url: https://github.com/issues
            icon: fas fa-database
  - name: Local
    widgets:
      - type: clock
    items:
      - title: Firewall
        url: http://192.168.1.1/
        icon: favicon
      - title: Sem URL
`);
    expect(names(parsed)).toEqual([
      ['Dev Tools', ['GitHub', 'GitHub / Issues']],
      ['Local', ['Firewall']],
    ]);
    expect(parsed.document.groups[0].services[1].icon).toBe('lucide:database');
    expect(codes(parsed)).toEqual([
      'pages:pages-ignored',
      'sections[0].items[0]:icon-unsupported',
      'sections[1]:widget-ignored',
      'sections[1].items[1]:invalid-url',
    ]);
  });

  it.each([
    ['sintaxe inválida', 'sections: [', 'invalid-syntax'],
    ['sem seções', 'pageInfo:\n  title: x', 'invalid-document'],
  ])('rejeita %s', (_n, content, code) => {
    expect(parseDashy(content).issues).toEqual([{ path: '', code, severity: 'error' }]);
  });

  it('relata seções e itens inválidos', () => {
    const parsed = parseDashy(`
sections:
  - items: []
  - name: A
    items:
      - "texto"
      - { title: B, url: "http://x.test" }
`);
    expect(names(parsed)).toEqual([['A', ['B']]]);
    expect(codes(parsed)).toEqual([
      'sections[0]:invalid-group',
      'sections[1].items[0]:invalid-service',
    ]);
  });

  it('recusa arquivos com cards demais', () => {
    const items = Array.from(
      { length: 1001 },
      (_, i) => `{title: S${i}, url: "http://x.test/${i}"}`,
    );
    const parsed = parseDashy(`sections:\n  - name: A\n    items: [${items.join(',')}]`);
    expect(parsed.issues.map((i) => i.code)).toEqual(['too-many-services']);
  });
});

describe('parseBySource', () => {
  it('escolhe o leitor pela origem', () => {
    expect(
      parseBySource('homepage', '- A:\n    - S:\n        href: http://x.test').document.groups,
    ).toHaveLength(1);
    expect(parseBySource('dashy', 'sections: []').issues).toEqual([]);
    expect(parseBySource('homora', 'version: 1\ngroups: []').issues).toEqual([]);
  });
});
