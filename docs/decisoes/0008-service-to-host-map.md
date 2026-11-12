# 0008 — Service-to-host map

**Status:** Accepted (phases 1 to 3 implemented; phases 4 and 5 planned in issue #96)

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

### Evidence-based suggestions (phase 3)

- `host-suggestions.ts` ranks candidates with a pure function. Signals are independent kinds of evidence: the card address is set in the guest configuration (`config-address`: LXC `netN ip=`, VM cloud-init `ipconfigN ip=`), reported by the QEMU guest agent (`guest-agent`), or reported by a Docker discovery source the user tied to the guest (`docker-source`). **Strong** needs two or more different kinds, **Medium** one, and without evidence only manual linking is offered. Names are never evidence. If several guests tie for the best signal count the card is flagged ambiguous and a tied Strong is reduced to Medium.
- The card address is the IP literal in its URL, or the single address its hostname resolves to through `authorizeDestination` with the card's own `allowPrivate`. A hostname resolving to a private address without that authorization, or a failed lookup, yields no signal. A lookup performs DNS only; nothing connects to the card.
- Guest addresses come from read-only `GET .../{lxc|qemu}/{vmid}/config` and, for running VMs, `GET .../agent/network-get-interfaces`, with at most 4 concurrent requests, 200 guests and a 5-minute cache. A refused or failing call just means no address from that source.
- Dismissals are stored per card and guest (`host_suggestion_dismissals`, migration `0021`, cascade on card or connection delete). Accept is the ordinary link write; Undo unlinks or clears the dismissal.
- Agents get two MCP scopes, `hosts:read` (suggestions, which include guest names) and `hosts:propose`. `propose_host_link` recomputes the evidence on the server (the agent cannot supply it), refuses a pair without evidence, and creates a `host-link` proposal through the existing managed-proposal flow (same diff, approval, expiry, staleness hash and audit entries). `managedSnapshot` now includes the host columns, so a pending proposal of any kind becomes stale if a link changes first.

### Open decisions (defaults taken)

1. DNS resolution as evidence: **implemented as above**, reusing the outbound policy; blocked means absent.
2. Guest-agent addresses: **implemented opportunistically**: the call is attempted with the existing token and the signal is simply absent if Proxmox refuses it. No token privilege is requested or required.
3. Docker discovery cross-reference: the engine supports the signal, but **no source-to-guest association exists in the product yet**, so it is not wired and never contributes. Strong therefore currently means config address plus guest agent on a VM.
4. Last-known state: derive from the live inventory and the monitor, show "unknown" when unreachable (phase 2); no state is stored.

## Alternatives and consequences

Storing guest names was rejected: it goes stale on rename and widens what a database
leak or export reveals. A separate links table was rejected for phase 1 because the
relation is one-to-one with a card and the columns keep reads trivial; the dependency
table in phase 5 is a separate table because it is many-to-many. Configuration
export/import does not carry the link, because connection ids are instance-specific.
