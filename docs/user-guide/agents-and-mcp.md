---
description: 'Let AI agents propose changes through MCP with scoped tokens, while you review and approve every proposal.'
---

# AI agents and MCP

Homora can be driven by AI agents through the Model Context Protocol (MCP), with one hard rule: **agents only
propose**. Every change an agent suggests waits for your approval in the interface, expires if you do nothing and is
recorded in the activity log. Agents never receive credentials and cannot write to external infrastructure.

New to this? [A ten-minute walkthrough](../agent-demo.md) uses synthetic data, and the
[capability inventory](../agent-capabilities.md) lists what each tool does.

## How it works

![The Agents page with a proposal waiting for review](../screenshots/agents.png)

1. **Create an agent** on **Manage → Agents** and choose its scopes. Its token is shown **once**.
2. **Connect** your client (see [Connect a client](#connect-a-client)) with that token.
3. The agent reads what its scopes allow and **proposes** changes.
4. You **review** the exact diff and approve or reject it. Approved changes apply immediately; rejected ones store
   nothing.
5. Everything is recorded in **Activity**. Revoking or rotating the token stops the agent's very next call.

![Reviewing a proposal](../screenshots/proposal-review.png)

## Review proposals

Waiting proposals form a queue on the left with the selected one in full on the right (one at a time on a phone). Changed
fields show the old value struck through and the new one highlighted; unchanged fields fold into a count.

Every proposal carries a risk:

| Risk                | Covers                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| **Low risk**        | Ordinary card edits.                                                                  |
| **Needs attention** | Private-network monitoring, skipped TLS validation, maintenance, widgets, host links. |
| **Access**          | Agent identities and connection setup suggestions.                                    |
| **Destructive**     | Removals and revocations.                                                             |

- **Hold to approve:** access and destructive changes need holding the button for about a second (without a hold, for
  example with a screen reader, a dialog asks instead).
- **Approve low risk:** when two or more routine proposals wait, one button approves them in order after a confirmation;
  a failure stops the rest. Batches and riskier proposals are never included.
- **Keyboard:** `J` and `K` move through the queue, `A` approves (hold for risky changes) and `R` rejects, except while
  typing or in a dialog.

### Expiry

The Agents page shows the time each proposal has left. The review period defaults to 15 minutes and can be set to 1–120
minutes for new proposals. Expired proposals stay visible and an administrator can recreate them (batches together);
recreating checks the original diff against the current configuration, may fail, and never applies a change.

## Connect a client

Homora supports local stdio and stateless Streamable HTTP, with the same tokens, scopes and approval rules. After creating
an agent, **Connect** shows ready-to-copy setup for Claude Code, Codex, Claude Desktop, Cursor, VS Code and generic JSON.
Protect the token like a password.

### HTTP

Point a compatible client at `http://localhost:8080/mcp` (in development, `http://localhost:5173/mcp`) with the header
`Authorization: Bearer <agent-token>`.

- Every request is authenticated, so revocation and rotation take effect immediately.
- The endpoint accepts the origins in `HOMORA_ALLOWED_ORIGINS` and limits requests per client.
- For another machine, use the private-network HTTPS reverse proxy. Do not expose Homora publicly.

### stdio

After `bun run build`, configure a trusted MCP client to run `bun /absolute/path/to/homora/apps/backend/dist/mcp-server.js`
over stdio, and pass the one-time token as `HOMORA_AGENT_TOKEN`.

- Set `HOMORA_DATABASE_PATH` to the **same absolute path** Homora uses (`data/homora-dev.sqlite` in `bun run dev`, otherwise
  `data/homora.sqlite`). A different database is a different instance; with Docker, use the same volume.
- The process needs the matching `.key` file.
- Start the backend at least once before relying on stdio for Proxmox data, so a legacy configuration is migrated.

The stdio process reads the local database and vault directly. Neither transport uses the web session, so use a trusted
client and system user and grant minimum scopes. There are no infrastructure actions or integration writes.

## Scopes and tools

| Scope                                      | Tools                                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services:read`                            | Services, pages, groups, favorites, status overview, trust metadata, tags, link types, public status, history and dependencies                                                     |
| `probes:read`, `probes:propose`            | Read standalone probes; propose probe changes for review                                                                                                                           |
| `incidents:read`, `incidents:propose`      | Read incidents; propose acknowledgements or mutes for review                                                                                                                       |
| `organization:propose`                     | Propose pages, card tags, favorites and resource links                                                                                                                             |
| `notifications:read`                       | Read notification channel metadata without credentials                                                                                                                             |
| `agents:read`, `audit:read`                | Agent identities and paginated audit events, respectively                                                                                                                          |
| `agents:propose`                           | Propose agent creation, scope changes, revocation or token rotation                                                                                                                |
| `maintenance:propose`                      | List maintenance windows and propose scheduling or cancellation for human review                                                                                                   |
| `public-status:propose`                    | Propose showing or hiding a card or probe on the public status page; publishing is high risk and held for confirmation                                                             |
| `proxmox:read`                             | `list_proxmox_resources`                                                                                                                                                           |
| `proposals:create`                         | `propose_service_card`, `propose_card_order`                                                                                                                                       |
| `groups:propose`                           | `propose_group_change`                                                                                                                                                             |
| `widgets:read`, `widgets:propose`          | `list_widgets`, `list_page_widgets`, `propose_widget_change` respectively                                                                                                          |
| `integrations:read`, `connections:propose` | `list_integrations`, `get_integration_status`, `test_connection`; `propose_connection_setup` respectively                                                                          |
| `discovery:read`                           | `list_discovery_suggestions`, `list_docker_push_sources`, `list_docker_push_suggestions`; `propose_discovered_card` and `propose_docker_push_card` also require `proposals:create` |
| `hosts:read`, `hosts:propose`              | `list_host_suggestions`, `propose_host_link` respectively (guest names are sensitive)                                                                                              |

Existing tokens do not gain new scopes automatically.

- `get_homora_capabilities` reports the token's scopes and available tools.
- Any proposal scope permits `list_proposals` and `get_proposal` for the identity's own proposals, and `withdraw_proposal`
  for its own unexpired pending ones (audited).
- `get_group`, `list_group_services` and `get_service_status` require `services:read`.
- `agents:read` lists identities without tokens or hashes. `audit:read` gives paginated history without IP addresses or
  event details.
- `list_proxmox_resources` returns aggregate data when exactly one Proxmox connection exists; with several, pick one via
  `list_integrations` and `get_integration_status` (`integrations:read`), which make read-only requests under the
  destination policy.
- Docker discovery is off by default; see [Docker discovery](docker-discovery.md).

## Proposals in detail

Every proposal (cards, groups, order, widgets, host links, connection setup suggestions and agent identity changes)
needs authenticated human approval, expires after the review period, and is rejected if the relevant configuration
changed.

- **Connection setup:** approving a suggestion **does not create a connection**. Open its form from the approved proposal
  and enter credentials, private-network permission and any CA yourself.
- **Batches:** `propose_batch` creates 1–20 proposals atomically under a shared batch ID, approved or rejected as one
  decision. Approval can make other proposals stale, requiring a new one. A batch is all-or-nothing: every item
  is validated in order against the state left by the items before it, so mixed batches work, for example moving groups
  to a page together with the widgets that belong there (`page` `assign-group` and `widget` `move`). If an item is
  invalid, the whole batch is rejected, nothing is stored or changed, and the error names the item
  (`batch-item-invalid: items[1] (widget): invalid-widget-position`). Every change kind may be combined in one batch.
- **Limit:** each identity can have 100 unexpired pending proposals.
- **Agent identities:** with `agents:propose`, an agent may suggest creating an identity or changing another agent's
  scopes, revocation or rotation; proposed scopes must be a subset of the proposer's. A new token is shown once in the
  approval response (if lost, use **Generate new token**). Revocation and rotation do not cancel other agents' pending
  proposals.

## Data the agent sees

- The web monitor shares its last observations with MCP through SQLite. Changed service settings invalidate old results,
  reported as unknown with `stale: true`.
- `list_status_history` queries a service's persisted observations in a Unix-millisecond window; records are kept for 30
  days, and deleting a service removes its history.
- URL queries and fragments are omitted from service and discovery results and proposals. Connection URLs and
  maintenance notes are omitted from MCP responses.
- Names, labels and external data are untrusted, not instructions.
