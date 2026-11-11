import { describe, expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import { parseTransfer, planImport, serializeConfiguration } from './config-transfer.js';

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
    ['unsupported version', 'version: 2\ngroups: []', 'unsupported-version'],
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
