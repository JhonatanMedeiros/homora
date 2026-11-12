# 0008 — Service-to-host map

**Status:** Accepted (phase 1 implemented; phases 2 to 5 planned in issue #96)

## Context

Homora shows Proxmox only as aggregate numbers. Issue #96 asks to show where each
service runs and what is affected when that machine stops, in five phases (link and
Host view, impact, evidence-based suggestions, read-only Map, Map editing and
dependencies). The map manages only Homora's own data and never writes to Proxmox.

## Decision

- **Link model.** A card has an optional link to a guest: `host_connection_id`
  (an `integration_instances` row of type `proxmox`, `ON DELETE SET NULL`), `host_node`,
  `host_vmid`, `host_type` (`qemu` | `lxc`). The four columns are nullable and added by
  migration `0020`. Only ids are stored; guest names are resolved at read time from the
  inventory, so renames follow. A guest that no longer exists shows "Host not found"; an
  unreadable inventory shows "Host unavailable", never "offline".
- **No name-only inference.** A link is created only by an explicit user action. Later
  suggestions (phase 3) require at least two independent signals for "Strong" and one
  for "Medium"; a name match never counts and only offers manual linking.
- **Inventory privacy.** `GET /api/connections/:id/guests` returns node and guest names
  and ids. It lives under `/api/`, so it requires a web session; it is not part of the
  public status page, is not logged, and is not exposed through MCP in phase 1 (no MCP
  scope covers inventory names; the card read/write tools keep returning the card
  without the link, and agent proposals reject a `host` field, so only a human links).
  The existing aggregate summary (`proxmox-summary.ts`) is unchanged; the detailed read
  is a sibling module (`proxmox-inventory.ts`) over the same read-only
  `/cluster/resources` call, cached 30 s per connection like the summary.
- **Read-only.** No new Proxmox endpoint is called and no write is added.
- **Audit.** Linking and unlinking through the dedicated endpoint are audited
  (`service-host-link`, `service-host-unlink`) with only the card id as detail.

### Open decisions (defaults taken)

1. DNS resolution as evidence: reuse the existing outbound policy; a blocked lookup means the signal is absent (phase 3).
2. Guest-agent addresses: only what the read-only token returns (phase 3).
3. Docker discovery cross-reference: only for sources explicitly associated with a guest (phase 3).
4. Last-known state: derive from the live inventory and the monitor, show "unknown" when unreachable (phase 2).

## Alternatives and consequences

Storing guest names was rejected: it goes stale on rename and widens what a database
leak or export reveals. A separate links table was rejected for phase 1 because the
relation is one-to-one with a card and the columns keep reads trivial; the dependency
table in phase 5 is a separate table because it is many-to-many. Configuration
export/import does not carry the link, because connection ids are instance-specific.
