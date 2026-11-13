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
    ['si-docker', 'brand:docker', false],
    ['mdi-docker', '', true],
    ['mdi-server-outline', 'lucide:server', false],
    ['router.png', 'lucide:router', false],
    ['fas fa-database', 'lucide:database', false],
    ['sonarr.png', 'brand:sonarr', false],
    ['hl-plex', 'brand:plex', false],
    ['sh-proxmox', 'brand:proxmox', false],
    ['brand:plex', 'brand:plex', false],
    ['brand:inexistente', '', true],
    ['speedtest-tracker.png', '', true],
    ['javascript:alert(1)', '', true],
  ])('%s -> %s', (raw, icon, unsupported) => {
    expect(mapIcon(raw)).toEqual({ icon, unsupported });
  });
  it('ignores non-string values', () => {
    expect(mapIcon(42)).toEqual({ icon: '', unsupported: false });
    expect(mapIcon(null)).toEqual({ icon: '', unsupported: false });
  });
});

describe('Homepage', () => {
  it('reads services.yaml with groups, nested groups and widgets', () => {
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
        icon: speedtest-tracker.png
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

  it('reads bookmarks.yaml', () => {
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

  it('reports entries without valid URL and entries outside a group', () => {
    const parsed = parseHomepage(`
- Home:
    - No href:
        description: x
    - Variable:
        href: "{{HOMEPAGE_VAR_URL}}"
    - Ok:
        href: http://x.test
- Dangling:
    href: http://x.test
- 42
`);
    expect(names(parsed)).toEqual([['Home', ['Ok']]]);
    expect(codes(parsed)).toEqual([
      'root[0].Home[0]:invalid-url',
      'root[0].Home[1]:invalid-url',
      'root[1]:invalid-group',
      'root[2]:invalid-group',
    ]);
  });

  it.each([
    ['invalid syntax', '- a: [unclosed', 'invalid-syntax'],
    ['root that is not a list', 'a: 1', 'invalid-document'],
    ['empty file', '', 'invalid-document'],
  ])('rejects %s', (_n, content, code) => {
    expect(parseHomepage(content).issues).toEqual([{ path: '', code, severity: 'error' }]);
  });

  it('warns when group name is shortened', () => {
    const long = 'G'.repeat(50);
    const parsed = parseHomepage(`- ${long}:\n    - S:\n        href: http://x.test`);
    expect(parsed.document.groups[0].name).toHaveLength(40);
    expect(parsed.issues.map((i) => i.code)).toEqual(['group-renamed']);
  });
});

describe('Dashy', () => {
  it('reads sections, items, subitems and warns about pages and widgets', () => {
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
      - title: No URL
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
    ['invalid syntax', 'sections: [', 'invalid-syntax'],
    ['without sections', 'pageInfo:\n  title: x', 'invalid-document'],
  ])('rejects %s', (_n, content, code) => {
    expect(parseDashy(content).issues).toEqual([{ path: '', code, severity: 'error' }]);
  });

  it('reports invalid sections and items', () => {
    const parsed = parseDashy(`
sections:
  - items: []
  - name: A
    items:
      - "text"
      - { title: B, url: "http://x.test" }
`);
    expect(names(parsed)).toEqual([['A', ['B']]]);
    expect(codes(parsed)).toEqual([
      'sections[0]:invalid-group',
      'sections[1].items[0]:invalid-service',
    ]);
  });

  it('rejects files with too many cards', () => {
    const items = Array.from(
      { length: 1001 },
      (_, i) => `{title: S${i}, url: "http://x.test/${i}"}`,
    );
    const parsed = parseDashy(`sections:\n  - name: A\n    items: [${items.join(',')}]`);
    expect(parsed.issues.map((i) => i.code)).toEqual(['too-many-services']);
  });
});

describe('parseBySource', () => {
  it('selects parser by source', () => {
    expect(
      parseBySource('homepage', '- A:\n    - S:\n        href: http://x.test').document.groups,
    ).toHaveLength(1);
    expect(parseBySource('dashy', 'sections: []').issues).toEqual([]);
    expect(parseBySource('homora', 'version: 1\ngroups: []').issues).toEqual([]);
  });
});

describe('parse budget', () => {
  it('rejects documents with an absurd number of nested collections without parsing them', () => {
    const started = performance.now();
    const junk = 'a: ['.repeat(160_000).slice(0, 900_000);
    for (const source of ['homora', 'homepage', 'dashy'] as const)
      expect(parseBySource(source, junk).issues.some((i) => i.severity === 'error')).toBe(true);
    expect(performance.now() - started).toBeLessThan(400);
  });

  it('still accepts a full-size export', () => {
    const groups = [
      {
        name: 'G',
        services: Array.from({ length: 1000 }, (_, i) => ({
          name: `S${i}`,
          url: `https://s${i}.test`,
        })),
      },
    ];
    const parsed = parseBySource('homora', JSON.stringify({ version: 1, groups }));
    expect(parsed.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(parsed.document.groups[0]?.services).toHaveLength(1000);
  });
});
