import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer as createSecureServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { root } from './config.js';
import type { DatabaseSync } from 'node:sqlite';
import { DEMO_PROXMOX } from './dev-inventory.js';

/**
 * Loopback is never a monitorable destination, so the sample services live on this machine's
 * private address (the first 10.x, 172.16-31.x or 192.168.x one) instead.
 */
export function developmentHost() {
  const private4 = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
  for (const list of Object.values(networkInterfaces()))
    for (const entry of list ?? [])
      if (entry.family === 'IPv4' && private4.test(entry.address)) return entry.address;
  return '127.0.0.1';
}

type Behavior = 'ok' | 'slow' | 'error' | 'down';
type Card = {
  name: string;
  group: string;
  description: string;
  port: number;
  behavior: Behavior;
  host?: [node: string, vmid: number, type: 'lxc' | 'qemu'];
};

/** Behavior of the sample cards that `seedDevelopmentDatabase` creates (they own ports 18000+). */
const SAMPLE: Record<number, { behavior: Behavior; host?: Card['host'] }> = {
  18000: { behavior: 'ok', host: ['pve1', 101, 'lxc'] },
  18001: { behavior: 'ok' },
  18002: { behavior: 'ok', host: ['pve1', 102, 'lxc'] },
  18100: { behavior: 'slow', host: ['pve1', 110, 'qemu'] },
  18101: { behavior: 'ok' },
  18200: { behavior: 'ok' },
  18201: { behavior: 'error', host: ['pve1', 103, 'lxc'] },
  18202: { behavior: 'ok', host: ['pve1', 120, 'lxc'] },
};

const EXTRA: Card[] = [
  ['Radarr', 'Media', 'Movie collection', 'ok', ['pve2', 201, 'lxc']],
  ['Sonarr', 'Media', 'TV collection', 'ok', ['pve2', 202, 'lxc']],
  ['Prowlarr', 'Media', 'Indexers (guest stopped)', 'down', ['pve2', 203, 'lxc']],
  ['qBittorrent', 'Media', 'Downloads', 'ok', undefined],
  ['Plex', 'Media', 'Streaming (node offline)', 'down', ['pve3', 301, 'qemu']],
  ['Immich', 'Media', 'Photos (node offline)', 'down', ['pve3', 302, 'lxc']],
  ['Paperless', 'Essentials', 'Scanned documents (node offline)', 'down', ['pve3', 303, 'lxc']],
  ['Grafana', 'Monitoring', 'Dashboards', 'ok', ['pve1', 120, 'lxc']],
  ['Gitea', 'Monitoring', 'Git hosting', 'slow', undefined],
  ['Portainer', 'Monitoring', 'Containers', 'ok', ['pve2', 210, 'qemu']],
  ['Pi-hole', 'Monitoring', 'Second DNS', 'ok', undefined],
].map(([name, group, description, behavior, host], index) => ({
  name,
  group,
  description,
  behavior,
  host,
  port: 18400 + index,
})) as Card[];

/**
 * Turns the plain sample database into a busy one: more groups, cards linked to the demo
 * Proxmox, and a mix of healthy, slow, erroring and stopped services. Runs once, in dev only.
 */
export function seedDevelopmentScenario(sqlite: DatabaseSync) {
  const host = developmentHost();
  // The address can change between runs (another network); keep the cards pointing at this one.
  sqlite
    .prepare(
      "UPDATE services SET url = 'http://' || ? || substr(url, instr(substr(url, 8), ':') + 7) WHERE url LIKE 'http://%:18%'",
    )
    .run(host);
  if (sqlite.prepare("SELECT 1 FROM service_cards WHERE name = 'Radarr'").get()) return;
  const connection = sqlite
    .prepare("SELECT id FROM integration_instances WHERE type = 'proxmox' AND name = ?")
    .get(DEMO_PROXMOX) as { id: number } | undefined;
  sqlite.exec('BEGIN');
  try {
    // Loopback services only get measured when private destinations are allowed.
    sqlite.exec('UPDATE monitors SET allow_private = 1');
    const link = sqlite.prepare(
      'UPDATE services SET host_connection_id=?, host_node=?, host_vmid=?, host_type=? WHERE url = ?',
    );
    const threshold = sqlite.prepare(
      'INSERT OR REPLACE INTO service_monitor_settings(service_id, failure_threshold, recovery_threshold, degraded_latency_ms) SELECT id, 1, 1, 800 FROM services WHERE url = ?',
    );
    for (const [port, sample] of Object.entries(SAMPLE)) {
      const url = `http://${host}:${port}/`;
      if (connection && sample.host) link.run(connection.id, ...sample.host, url);
      threshold.run(url);
    }
    const groups = new Map(
      (
        sqlite.prepare('SELECT id, name, position FROM service_groups').all() as {
          name: string;
          position: number;
        }[]
      ).map((row) => [row.name, row.position]),
    );
    const insertGroup = sqlite.prepare(
      'INSERT INTO service_groups(name, position, page_id) VALUES (?, ?, (SELECT id FROM pages ORDER BY position,id LIMIT 1))',
    );
    const insertMonitor = sqlite.prepare('INSERT INTO monitors(name, allow_private) VALUES (?, 1)');
    const insertCard = sqlite.prepare(
      'INSERT INTO services(id, url, category, description, icon, position, host_connection_id, host_node, host_vmid, host_type) VALUES (?,?,?,?,?,?,?,?,?,?)',
    );
    EXTRA.forEach((card, index) => {
      if (!groups.has(card.group)) {
        const position = groups.size;
        groups.set(card.group, position);
        insertGroup.run(card.group, position);
      }
      const id = Number(insertMonitor.run(card.name).lastInsertRowid);
      const host = connection && card.host ? card.host : undefined;
      insertCard.run(
        id,
        `http://${host}:${card.port}/`,
        card.group,
        card.description,
        `brand:${card.name.toLowerCase().replaceAll(' ', '-')}`,
        100 + index,
        host ? connection!.id : null,
        host?.[0] ?? null,
        host?.[1] ?? null,
        host?.[2] ?? null,
      );
      threshold.run(`http://${host}:${card.port}/`);
    });
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

/** Small local servers the sample cards point at, so Homora measures real answers. */
export function startDevelopmentServices() {
  const behaviors = new Map<number, Behavior>([
    ...Object.entries(SAMPLE).map(([port, sample]) => [Number(port), sample.behavior] as const),
    ...EXTRA.map((card) => [card.port, card.behavior] as const),
  ]);
  for (const [port, behavior] of behaviors) {
    if (behavior === 'down') continue; // nothing listens: the connection is refused
    createServer((_request, response) => {
      const answer = () => {
        response.statusCode = behavior === 'error' ? 502 : 200;
        response.end(behavior === 'error' ? 'Bad gateway' : 'ok');
      };
      if (behavior === 'slow') setTimeout(answer, 1900);
      else answer();
    })
      .on('error', () => undefined)
      .listen(port, '0.0.0.0');
  }
}

const TLS_PORT = 18500;
const PROBE_OK_PORT = 18600;
const PROBE_UP_PORTS = [18600, 18601];

/** Looks a card up by name, since the ids depend on the order the sample data was made in. */
const idOf = (sqlite: DatabaseSync, name: string) =>
  (sqlite.prepare('SELECT id FROM monitors WHERE name = ?').get(name) as { id: number }).id;

/**
 * Everything on the Home that is not a plain card: widgets, favorites, tags, dependencies,
 * maintenance, a muted problem, probes, extra links, an expiring certificate and past alerts.
 * Runs once on top of `seedDevelopmentScenario`, in dev only.
 */
export function seedDevelopmentFeatures(sqlite: DatabaseSync) {
  if (sqlite.prepare("SELECT 1 FROM monitors WHERE name = 'Caddy'").get()) return;
  if (!sqlite.prepare("SELECT 1 FROM monitors WHERE name = 'Radarr'").get()) return;
  const host = developmentHost();
  const now = Date.now();
  const minute = 60_000;
  const hour = 60 * minute;
  const page = (
    sqlite.prepare('SELECT id FROM pages ORDER BY position,id LIMIT 1').get() as { id: number }
  ).id;
  const connection = sqlite
    .prepare("SELECT id FROM integration_instances WHERE type = 'proxmox' AND name = ?")
    .get(DEMO_PROXMOX) as { id: number } | undefined;
  const id = (name: string) => idOf(sqlite, name);
  sqlite.exec('BEGIN');
  try {
    // A card that watches a certificate (the sample one expires in 9 days: inside the warning).
    const caddy = Number(
      sqlite
        .prepare(
          "INSERT INTO monitors(name, allow_private, check_type, check_insecure) VALUES ('Caddy', 1, 'tls', 1)",
        )
        .run().lastInsertRowid,
    );
    const group = (
      sqlite.prepare("SELECT category FROM services WHERE url LIKE '%:18400/'").get() as {
        category: string;
      }
    ).category;
    sqlite
      .prepare(
        "INSERT INTO services(id, url, category, description, icon, position) VALUES (?, ?, ?, 'Reverse proxy (certificate)', 'brand:caddy', 200)",
      )
      .run(caddy, `https://${host}:${TLS_PORT}/`, group);

    // Page widgets: a clock and the Proxmox cluster summary.
    const widget = sqlite.prepare(
      'INSERT INTO page_widgets(page_id, type, name, config, version, connection_id, position) VALUES (?,?,?,?,1,?,?)',
    );
    widget.run(
      page,
      'clock',
      'Clock',
      JSON.stringify({
        hourFormat: '24h',
        timeZone: 'America/Sao_Paulo',
        seconds: false,
        date: true,
      }),
      null,
      0,
    );
    if (connection) widget.run(page, 'proxmox', 'Proxmox', '{}', connection.id, 1);

    // Favorites, tags and dependencies.
    const pin = sqlite.prepare('INSERT INTO service_pins(service_id, pinned_at) VALUES (?, ?)');
    ['Nextcloud', 'Grafana', 'Radarr', 'Plex'].forEach((name, index) =>
      pin.run(id(name), now - index * hour),
    );
    const tag = sqlite.prepare('INSERT INTO service_tags(service_id, tag) VALUES (?, ?)');
    for (const [name, tags] of Object.entries({
      Radarr: ['media', 'arr'],
      Sonarr: ['media', 'arr'],
      Prowlarr: ['media', 'arr'],
      Plex: ['media'],
      Grafana: ['ops'],
      Gitea: ['dev', 'ops'],
      Portainer: ['ops'],
    }))
      for (const value of tags) tag.run(id(name), value);
    const dependency = sqlite.prepare(
      'INSERT INTO service_dependencies(service_id, depends_on_id, created_at) VALUES (?,?,?)',
    );
    dependency.run(id('Radarr'), id('Prowlarr'), now);
    dependency.run(id('Sonarr'), id('Prowlarr'), now);
    dependency.run(id('Grafana'), id('Portainer'), now);

    // Maintenance: Gitea right now, Grafana tomorrow night.
    const maintenance = sqlite.prepare(
      'INSERT INTO service_maintenance(service_id, starts_at, ends_at, note) VALUES (?,?,?,?)',
    );
    maintenance.run(id('Gitea'), now - hour, now + 2 * hour, 'Disk upgrade');
    maintenance.run(id('Grafana'), now + 20 * hour, now + 22 * hour, 'Version upgrade');

    // A problem somebody already looked at: muted for an hour, so it sits in the quiet list.
    sqlite
      .prepare(
        'INSERT INTO service_acknowledgements(service_id, incident_id, acknowledged_at, muted_until) VALUES (?, NULL, ?, ?)',
      )
      .run(id('Paperless'), now - 5 * minute, now + hour);

    // Extra links on a few cards.
    const linkType = Number(
      sqlite
        .prepare("INSERT INTO link_types(name, color, position) VALUES ('Docs', 'blue', 0)")
        .run().lastInsertRowid,
    );
    const link = sqlite.prepare(
      'INSERT INTO service_links(service_id, type_id, name, url, position) VALUES (?,?,?,?,?)',
    );
    link.run(id('Grafana'), linkType, 'Dashboards', 'https://grafana.com/docs/', 0);
    link.run(
      id('Grafana'),
      linkType,
      'Alerting',
      'https://grafana.com/docs/grafana/latest/alerting/',
      1,
    );
    link.run(id('Radarr'), linkType, 'Wiki', 'https://wiki.servarr.com/radarr', 0);

    // Probes: things that are not cards but tell you whether the network is fine.
    const probe = sqlite.prepare(
      "INSERT INTO monitors(name, allow_private, check_type, check_url) VALUES (?, 1, 'http', ?)",
    );
    probe.run('Internet', `http://${host}:${PROBE_OK_PORT}/`);
    probe.run('Gateway', `http://${host}:${PROBE_UP_PORTS[1]}/`);
    probe.run('DNS resolver', `http://${host}:18602/`);

    // Alerts that already happened, so the bell has a history.
    const inbox = sqlite.prepare(
      'INSERT INTO inbox_notifications(service_id, kind, service_name, confirmed_at, started_at, ended_at, reason, http_status, read_at) VALUES (?,?,?,?,?,?,?,?,?)',
    );
    inbox.run(
      id('AdGuard Home'),
      'down',
      'AdGuard Home',
      now - 3 * minute,
      now - 4 * minute,
      null,
      'error-status',
      502,
      null,
    );
    inbox.run(
      id('Prowlarr'),
      'down',
      'Prowlarr',
      now - 40 * minute,
      now - 41 * minute,
      null,
      'no-response',
      null,
      null,
    );
    inbox.run(
      id('Jellyfin'),
      'down',
      'Jellyfin',
      now - 5 * hour,
      now - 5 * hour - 9 * minute,
      now - 5 * hour,
      'no-response',
      null,
      now - 4 * hour,
    );
    inbox.run(
      id('Jellyfin'),
      'up',
      'Jellyfin',
      now - 5 * hour,
      now - 5 * hour - 9 * minute,
      now - 5 * hour,
      null,
      null,
      now - 4 * hour,
    );
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

/** HTTPS listener with a certificate that expires in 9 days, made on first use. */
export function startDevelopmentTlsService() {
  const directory = join(root, 'data', 'dev-tls');
  const key = join(directory, 'key.pem');
  const cert = join(directory, 'cert.pem');
  try {
    if (!existsSync(cert)) {
      mkdirSync(directory, { recursive: true });
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-days',
          '9',
          '-subj',
          '/CN=caddy.dev',
          '-keyout',
          key,
          '-out',
          cert,
        ],
        { stdio: 'ignore' },
      );
    }
    createSecureServer({ key: readFileSync(key), cert: readFileSync(cert) }, (_request, response) =>
      response.end('ok'),
    )
      .on('error', () => undefined)
      .listen(TLS_PORT, '0.0.0.0');
  } catch {
    // Without openssl the card simply shows as unreachable.
  }
}

/** Answers for the probes: two up, the DNS resolver answers 503. */
export function startDevelopmentProbes() {
  for (const [port, status] of [
    [18600, 200],
    [18601, 200],
    [18602, 503],
  ] as const)
    createServer((_request, response) => {
      response.statusCode = status;
      response.end('probe');
    })
      .on('error', () => undefined)
      .listen(port, '0.0.0.0');
}
