import type { DatabaseSync } from 'node:sqlite';

/** Sample local data; no private destinations are authorized for monitoring. */
export function seedDevelopmentDatabase(sqlite: DatabaseSync) {
  const groups = [
    {
      name: 'Essentials',
      services: [
        ['Nextcloud', 'Files and documents'],
        ['Home Assistant', 'Your connected home'],
        ['Vaultwarden', 'Passwords and secrets'],
      ],
    },
    {
      name: 'Entertainment',
      services: [
        ['Jellyfin', 'Movies and shows'],
        ['Audiobookshelf', 'Audiobooks and podcasts'],
      ],
    },
    {
      name: 'Infrastructure',
      services: [
        ['Proxmox', 'Virtual machines and containers'],
        ['AdGuard Home', 'DNS and network protection'],
        ['Uptime Kuma', 'Service monitoring'],
      ],
    },
  ];
  sqlite.exec('BEGIN');
  try {
    const insertGroup = sqlite.prepare(
      'INSERT INTO service_groups(name, position, page_id) VALUES (?, ?, (SELECT id FROM pages ORDER BY position,id LIMIT 1))',
    );
    const insertService = sqlite.prepare(
      'INSERT INTO services(name, url, category, description, icon, position, allow_private) VALUES (?, ?, ?, ?, ?, ?, 0)',
    );
    groups.forEach((group, groupPosition) => {
      insertGroup.run(group.name, groupPosition);
      group.services.forEach(([name, description], position) => {
        insertService.run(
          name,
          `http://127.0.0.1:${18000 + groupPosition * 100 + position}/`,
          group.name,
          description,
          `brand:${name.toLowerCase().replaceAll(' ', '-')}`,
          position,
        );
      });
    });
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}

/** Add demo integration rows to the isolated dev database without touching user data. */
export function seedDevelopmentIntegrationMocks(sqlite: DatabaseSync) {
  const demo = sqlite
    .prepare(
      "SELECT id FROM integration_instances WHERE type = 'proxmox' AND public_config LIKE '%proxmox.mock.invalid%' LIMIT 1",
    )
    .get() as { id: number } | undefined;
  if (demo) return;

  const service = sqlite
    .prepare("SELECT id FROM services WHERE name = 'Proxmox' ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;
  if (!service) return;

  sqlite.exec('BEGIN');
  try {
    const integration = sqlite
      .prepare(
        "INSERT INTO integration_instances(type,name,public_config) VALUES('proxmox','Demo Proxmox (mock)',?)",
      )
      .run(JSON.stringify({ url: 'https://proxmox.mock.invalid:8006', allowPrivate: false }));
    sqlite
      .prepare(
        "INSERT INTO integration_widgets(integration_id,type,name,public_config,service_id) VALUES(?,'proxmox','Cluster de demonstração','{}',?)",
      )
      .run(Number(integration.lastInsertRowid), service.id);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}
