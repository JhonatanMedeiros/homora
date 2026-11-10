import type { DatabaseSync } from 'node:sqlite';

/** Dados ilustrativos locais; nenhum destino privado é autorizado para monitoramento. */
export function seedDevelopmentDatabase(sqlite: DatabaseSync) {
  const groups = [
    {
      name: 'Essenciais',
      services: [
        ['Nextcloud', 'Arquivos e documentos'],
        ['Home Assistant', 'Sua casa conectada'],
        ['Vaultwarden', 'Senhas e informações'],
      ],
    },
    {
      name: 'Entretenimento',
      services: [
        ['Jellyfin', 'Filmes e séries'],
        ['Audiobookshelf', 'Audiolivros e podcasts'],
      ],
    },
    {
      name: 'Infraestrutura',
      services: [
        ['Proxmox', 'Máquinas virtuais e containers'],
        ['AdGuard Home', 'DNS e proteção da rede'],
        ['Uptime Kuma', 'Monitoramento de serviços'],
      ],
    },
  ];
  sqlite.exec('BEGIN');
  try {
    const insertGroup = sqlite.prepare('INSERT INTO service_groups(name, position) VALUES (?, ?)');
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
          '',
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
