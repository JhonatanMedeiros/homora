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

The application imports the legacy configuration transactionally on first connection access,
reusing the bridge row where present. It retains the legacy file as a sensitive backup and
records a marker so deleting a migrated connection cannot recreate it. Existing installations
retain private network permission for this connection; new connections require opt-in. After
migration, legacy Proxmox HTTP routes return 410 so they cannot modify stale credentials. The
shared network policy may block destinations the previous transport allowed. The legacy MCP
inventory tool returns aggregate data for a single configured Proxmox connection; with several,
clients must select a connection via the integration tools.

Alternatives considered: preserve the special single-connection implementation, or delete the
legacy file during migration. The first does not meet the multiple-cluster requirement; the
second risks losing the only recoverable copy if backup or migration assumptions are wrong.
Keeping the file means it remains sensitive even after the connection is removed or its token
rotated, and must be protected with other backups.
