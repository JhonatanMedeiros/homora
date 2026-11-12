# 0001 — Named Proxmox connections

Status: accepted.

The legacy Proxmox configuration represented only one endpoint and used a separate encrypted
file and an otherwise hidden database row to attach widgets. This prevented multiple independent
clusters and left the telemetry source implicit.

Proxmox is now a named connection using the same encrypted credential store, destination
policy, caching, and widget associations as the other adapters. A single connection queries one
endpoint and returns aggregate cluster inventory; individual node selection remains future work.
Settings can select a connection for the top bar; the automatic setting retains the former first
widget behavior.

The application imports the legacy configuration transactionally at backend startup,
reusing the bridge row where present. It retains the legacy file as a sensitive backup and
records a marker so deleting a migrated connection cannot recreate it. Existing installations
retain private network permission for this connection; new connections require opt-in. After
migration, the shared network policy may block destinations the previous transport allowed. The MCP
inventory tool returns aggregate data for a single configured Proxmox connection; with several,
clients must select a connection via the integration tools.

Alternatives considered: preserve the special single-connection implementation, or delete the
legacy file during migration. The first does not meet the multiple-cluster requirement; the
second risks losing the only recoverable copy if backup or migration assumptions are wrong.
Keeping the file means it remains sensitive even after the connection is removed or its token
rotated, and must be protected with other backups.

## Update (2026-11-12)

The migration now also runs once at backend startup, and a missing key or unreadable legacy file
is logged without secrets and does not stop the server (the file stays untouched and is retried on
the next start). Because every installation then has a migration marker or no legacy file, the
legacy HTTP routes (`/api/proxmox/*`), the single-endpoint transport and every fallback that read
the `.proxmox` file outside the migrator were removed. A Proxmox widget proposal and the MCP
`list_proxmox_resources` tool work only through connections. The migrator, `validateProxmoxConfig`
and the legacy file handling remain until the maintainer confirms no unmigrated installation is
left (tracked in `docs/evolucao.md`).
