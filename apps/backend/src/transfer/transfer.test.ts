import { describe, expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import { parseTransfer, planImport, serializeConfiguration } from './index.js';

const service = (patch: Partial<Service>): Service => ({
  id: 1,
  name: 'Jellyfin',
  url: 'http://localhost:8096/',
  category: 'Media',
  description: '',
  icon: '',
  position: 0,
  allowPrivate: false,
  ...patch,
});
const none = { groups: [], services: [] };

describe('export', () => {
  it('maintains order of groups and cards and omits empty values', () => {
    const text = serializeConfiguration(
      [{ name: 'Home' }, { name: 'Media' }],
      [
        service({ id: 2, name: 'Plex', position: 1, icon: 'lucide:film' }),
        service({ id: 1, name: 'Jellyfin', position: 0, allowPrivate: true }),
      ],
      'yaml',
    );
    const parsed = parseTransfer(text);
    expect(parsed.issues).toEqual([]);
    expect(parsed.document.groups.map((g) => g.name)).toEqual(['Home', 'Media']);
    expect(parsed.document.groups[1].services.map((s) => s.name)).toEqual(['Jellyfin', 'Plex']);
    expect(text).not.toContain('description');
    expect(text).not.toContain('id:');
  });

  it('generates JSON equivalent to YAML and reimports without loss', () => {
    const services = [service({ icon: 'https://example.test/a.svg', description: 'Movies' })];
    const yaml = parseTransfer(serializeConfiguration([{ name: 'Media' }], services, 'yaml'));
    const json = parseTransfer(serializeConfiguration([{ name: 'Media' }], services, 'json'));
    expect(json.document).toEqual(yaml.document);
    expect(json.document.groups[0].services[0]).toEqual({
      name: 'Jellyfin',
      url: 'http://localhost:8096/',
      description: 'Movies',
      icon: 'https://example.test/a.svg',
      allowPrivate: false,
    });
  });

  it('includes empty groups', () => {
    const parsed = parseTransfer(serializeConfiguration([{ name: 'Empty' }], [], 'json'));
    expect(parsed.document.groups).toEqual([{ name: 'Empty', services: [] }]);
  });
});

describe('parsing', () => {
  it.each([
    ['invalid syntax', 'groups: [unclosed', 'invalid-syntax'],
    ['document without groups', 'version: 1\n', 'invalid-document'],
    ['root that is not an object', '- a\n- b', 'invalid-document'],
    ['unsupported version', 'version: 7\ngroups: []', 'unsupported-version'],
  ])('rejects %s', (_name, content, code) => {
    const parsed = parseTransfer(content);
    expect(parsed.issues).toEqual([{ path: '', code, severity: 'error' }]);
    expect(parsed.document.groups).toEqual([]);
  });

  it('ignores invalid items and reports path for each', () => {
    const parsed = parseTransfer(`
version: 1
groups:
  - name: Home
    services:
      - { name: Good, url: "http://localhost/" }
      - { name: "", url: "http://localhost/" }
      - { name: No URL, url: "nothing" }
      - { name: Dangerous, url: "javascript:alert(1)" }
      - { name: Credentials, url: "http://u:p@localhost/" }
      - "text"
  - name: ""
    services: []
`);
    expect(parsed.document.groups).toHaveLength(1);
    expect(parsed.document.groups[0].services.map((s) => s.name)).toEqual(['Good']);
    expect(parsed.issues.map((i) => [i.path, i.code])).toEqual([
      ['groups[0].services[1]', 'invalid-name'],
      ['groups[0].services[2]', 'invalid-url'],
      ['groups[0].services[3]', 'invalid-url'],
      ['groups[0].services[4]', 'invalid-url'],
      ['groups[0].services[5]', 'invalid-service'],
      ['groups[1]', 'invalid-group'],
    ]);
  });

  it('imports service and warns when icon is discarded', () => {
    const parsed = parseTransfer(
      'version: 1\ngroups:\n  - name: A\n    services:\n      - { name: S, url: "http://x.test", icon: "lucide:Invalid" }',
    );
    expect(parsed.document.groups[0].services[0].icon).toBe('');
    expect(parsed.issues).toEqual([
      { path: 'groups[0].services[0]', code: 'icon-ignored', severity: 'warning' },
    ]);
  });

  it('limits aliases and file size', () => {
    const bomb = `version: 1\nx: &a [1,1,1,1,1,1,1,1,1,1]\ngroups: [${Array(20).fill('*a').join(',')}]`;
    expect(parseTransfer(bomb).issues[0].severity).toBe('error');
    expect(parseTransfer('x'.repeat(1_000_001)).issues[0].code).toBe('invalid-document');
  });

  it('rejects files with too many cards', () => {
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

describe('plan', () => {
  const file = parseTransfer(`
version: 1
groups:
  - name: Media
    services:
      - { name: Jellyfin, url: "http://localhost:8096/" }
      - { name: Plex, url: "http://localhost:32400/" }
      - { name: Plex 2, url: "http://localhost:32400/" }
  - name: New
    services: []
`);

  it('marks duplicates already existing and repeated in file', () => {
    const plan = planImport(file, {
      groups: ['Media'],
      services: [{ category: 'Media', url: 'http://localhost:8096/' }],
    });
    expect(plan.services.map((s) => s.status)).toEqual(['duplicate', 'new', 'duplicate']);
    expect(plan.groups).toEqual([
      { name: 'Media', status: 'existing' },
      { name: 'New', status: 'new' },
    ]);
    expect(plan.summary).toMatchObject({
      newGroups: 1,
      newServices: 1,
      duplicates: 2,
      warnings: 1,
    });
  });

  it('same URL in another group is not considered duplicate', () => {
    const plan = planImport(file, {
      groups: [],
      services: [{ category: 'Other', url: 'http://localhost:8096/' }],
    });
    expect(plan.summary.duplicates).toBe(1);
    expect(plan.services[0].status).toBe('new');
  });

  it('with empty configuration everything is new', () => {
    expect(planImport(file, none).summary.newServices).toBe(2);
  });
});

describe('appearance and custom CSS in the export', () => {
  const appearance = {
    version: 2 as const,
    accent: 'moss' as const,
    customAccent: null,
    background: 'dusk' as const,
    cardOpacity: 80,
    blur: true,
    image: {
      name: 'a'.repeat(32) + '.webp',
      dim: 40,
      position: 'fill' as const,
      average: '#808080',
      width: 10,
      height: 10,
      bytes: 100,
      originalBytes: 200,
    },
  };

  it('includes both, without the background picture', () => {
    const text = serializeConfiguration([], [], 'json', {
      appearance,
      customCss: { enabled: true, css: 'a { color: red }' },
    });
    const document = JSON.parse(text);
    expect(document.appearance).toMatchObject({ accent: 'moss', cardOpacity: 80, image: null });
    expect(text).not.toContain('a'.repeat(32));
    expect(document.customCss).toEqual({ enabled: true, css: 'a { color: red }' });
  });

  it('leaves them out when empty or not asked for', () => {
    expect(serializeConfiguration([], [], 'json')).not.toContain('appearance');
    const empty = serializeConfiguration([], [], 'json', {
      customCss: { enabled: false, css: '  ' },
    });
    expect(empty).not.toContain('customCss');
  });

  it('leaves them unread on import: import only adds cards and groups', () => {
    const text = serializeConfiguration([{ name: 'Media' }], [], 'yaml', {
      appearance,
      customCss: { enabled: true, css: 'a { color: red }' },
    });
    const parsed = parseTransfer(text);
    expect(parsed.issues).toEqual([]);
    expect(parsed.document).toEqual({ groups: [{ name: 'Media', services: [] }] });
  });
});

it('round trips portable clocks and flags connected widgets without binding a local id', () => {
  const config = { hourFormat: '24h' as const, timeZone: 'UTC', seconds: true, date: true };
  const text = serializeConfiguration([], [], 'json', {
    pages: ['Home'],
    widgets: [
      { page: 'Home', type: 'clock', name: 'Office', config },
      {
        page: 'Home',
        type: 'proxmox',
        name: 'Lab',
        config: {},
        source: { type: 'proxmox', name: 'Cluster' },
      },
    ],
  });
  expect(text).not.toContain('connectionId');
  const parsed = parseTransfer(text);
  expect(parsed.document.widgets).toHaveLength(2);
  const plan = planImport(parsed, { groups: [], services: [], pages: ['Home'] });
  expect(plan.widgets.map((widget) => widget.status)).toEqual(['new', 'skipped']);
  expect(plan.issues).toContainEqual({
    path: 'widgets[1]',
    code: 'widget-source-unavailable',
    severity: 'warning',
  });
  expect(plan.summary.newWidgets).toBe(1);
});

it('shows clocks beyond the page widget limit as skipped before applying', () => {
  const content = JSON.stringify({
    version: 3,
    groups: [],
    pages: ['Home'],
    widgets: [
      {
        page: 'Home',
        type: 'clock',
        name: 'One',
        config: { hourFormat: 'auto', timeZone: '', seconds: false, date: true },
      },
      {
        page: 'Home',
        type: 'clock',
        name: 'Two',
        config: { hourFormat: 'auto', timeZone: '', seconds: false, date: true },
      },
    ],
  });
  const plan = planImport(parseTransfer(content), {
    groups: [],
    services: [],
    pages: ['Home'],
    widgetCount: 199,
  });
  expect(plan.widgets.map((item) => item.status)).toEqual(['new', 'skipped']);
  expect(plan.issues).toContainEqual({
    path: 'widgets[1]',
    code: 'widget-limit',
    severity: 'warning',
  });
});

it('preserves valid aliases in exports and reports invalid or conflicting aliases in the preview', () => {
  const parsed = parseTransfer(
    JSON.stringify({
      version: 5,
      groups: [
        {
          name: 'Media',
          services: [
            { name: 'One', url: 'https://one.test', alias: 'taken' },
            { name: 'Two', url: 'https://two.test', alias: 'free' },
            { name: 'Three', url: 'https://three.test', alias: 'free' },
            { name: 'Four', url: 'https://four.test', alias: 'Bad Alias' },
          ],
        },
      ],
    }),
  );
  const plan = planImport(parsed, {
    groups: [],
    services: [{ category: 'Other', url: 'https://old.test/', alias: 'taken' }],
  });
  expect(plan.services.map((service) => service.alias)).toEqual([
    undefined,
    'free',
    undefined,
    undefined,
  ]);
  expect(plan.issues.map((issue) => issue.code)).toEqual([
    'alias-ignored',
    'alias-conflict',
    'alias-conflict',
  ]);
  const exported = serializeConfiguration(
    [{ name: 'Media' }],
    [
      {
        id: 1,
        name: 'One',
        url: 'https://one.test/',
        category: 'Media',
        description: '',
        alias: 'free',
      },
    ],
    'json',
  );
  expect(parseTransfer(exported).document.groups[0].services[0].alias).toBe('free');
});

it('round trips a separate check URL and ignores invalid imported targets', () => {
  const target = 'http://192.168.1.5:8080/health';
  const text = serializeConfiguration([{ name: 'Media' }], [service({ checkUrl: target })], 'json');
  expect(parseTransfer(text).document.groups[0].services[0].checkUrl).toBe(target);
  const parsed = parseTransfer(
    'version: 5\ngroups:\n  - name: Media\n    services:\n      - { name: App, url: "https://app.example", checkUrl: "http://user:pass@example.com/" }',
  );
  expect(parsed.document.groups[0].services[0].checkUrl).toBeUndefined();
  expect(parsed.issues).toContainEqual(expect.objectContaining({ code: 'check-ignored' }));
});

it('rejects invalid or oversized notes during import', () => {
  const content = JSON.stringify({
    version: 6,
    groups: [],
    widgets: [
      { page: 'Home', type: 'note', name: '', config: { text: 'x'.repeat(4001) } },
      { page: 'Home', type: 'note', name: '', config: { text: 10 } },
      { page: 'Home', type: 'note', name: '', config: { text: 'ok', extra: true } },
    ],
  });
  const parsed = parseTransfer(content);
  expect(parsed.document.widgets).toEqual([]);
  expect(
    parsed.issues.filter((issue) => issue.code === 'widget-invalid').map((issue) => issue.path),
  ).toEqual(['widgets[0]', 'widgets[1]', 'widgets[2]']);
});
