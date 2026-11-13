# Import, export and backup

Three different tools protect and move your data. **Export** produces a portable file of your cards and
layout. **Import** brings in cards from Homora, Homepage or Dashy. **Backup** copies the whole database,
including the account and encrypted connections.

![Export and import settings](../screenshots/settings-backup.png)

## Import and export

Open **Settings**. Download your groups, cards and their order as YAML or JSON (`GET /api/config/export`). The file never contains passwords, tokens, connections or IDs. It can contain page widget names and connection names, so review it before sharing. Extra addresses (Links) are exported with their type name and color (format version 4; older files still import). Clock widgets are imported; connected widgets appear as skipped in the preview and must be recreated with a chosen connection.

To import, pick the file format (Homora, Homepage or Dashy) and a file. Homora shows a preview of what will be added, what already exists and what was ignored, and writes nothing until you confirm. Import only adds: nothing is overwritten or removed. Imported cards are not allowed to monitor your private network unless you tick that option for a Homora file you trust.

Icons from other dashboards are kept only when Homora has an equivalent (an image URL, an emoji, a brand logo or one of the built-in icons); the others are left empty with a warning. Widgets, monitoring settings and Docker links from Homepage and Dashy are not imported. The formats were checked against those projects' documentation; real files may vary.

## Backup and restore

Create a consistent copy of the database (existing files are never overwritten):

```bash
pnpm backup data/homora.sqlite backups/homora.sqlite
```

The database holds your cards, the administrator account (and its sessions) and encrypted connection credentials, so a database backup already includes the account. The encryption key lives in a `.key` file next to the database, and the original Proxmox integration also uses `.proxmox`. Copy those separately into a protected backup and restore them with the same derived names. Without the key you must configure credentials again. A `.auth` file left by earlier versions is no longer read and can be deleted. To restore, stop Homora, keep the current database and use the backup as the source of a new file, for example `pnpm backup backups/homora.sqlite data/restored.sqlite`. Point `HOMORA_DATABASE_PATH` at it and restart.

With Docker Compose, use a new protected directory on the host (the commands do not overwrite backups):

```bash
mkdir -p backups/backup-2026-11-10
docker compose exec backend node scripts/backup.mjs /app/data/homora.sqlite /app/data/backup.sqlite
docker compose cp backend:/app/data/backup.sqlite backups/backup-2026-11-10/homora.sqlite
docker compose cp backend:/app/data/homora.sqlite.key backups/backup-2026-11-10/homora.sqlite.key
docker compose cp backend:/app/data/homora.sqlite.session-secret backups/backup-2026-11-10/homora.sqlite.session-secret
docker compose cp backend:/app/data/homora.sqlite.proxmox backups/backup-2026-11-10/homora.sqlite.proxmox
```

`.session-secret` exists unless you set `HOMORA_SESSION_SECRET` (keep that value in your backup instead); it is required to restore two-step verification. `.proxmox` and `.background` (the background image) may not exist on every installation; skip the copy if a file is missing. `pnpm backup` already copies `.background` next to the database copy. With Compose, copy `homora.sqlite.background` the same way. Keep the key as protected as the database, and do a test restore before relying on a backup.
