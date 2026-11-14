# AI agents and MCP

Homora can be driven by AI agents through the Model Context Protocol (MCP), but with one hard rule:
**agents only propose**. Every change an agent suggests waits for your approval in the interface, expires if
you do nothing and is recorded in the activity log. Agents never receive credentials and cannot write to
external infrastructure.

## How it works

![The Agents page with a proposal waiting for review](../screenshots/agents.png)

1. **Create an agent** on **Manage → Agents** and choose its scopes. Its token is shown **once**.
2. **Connect** your client (see below) with that token.
3. The agent reads what its scopes allow and **proposes** changes.
4. You **review** the exact diff and approve or reject it. Approved changes apply immediately; rejected ones store nothing.
5. Everything is recorded in **Activity**. Revoking or rotating the token stops the agent's very next call.

![Reviewing a proposal](../screenshots/proposal-review.png)

## Reference

New to this? [A ten-minute walkthrough](../agent-demo.md) shows scopes, proposals, review, audit, revocation and a denied action with synthetic data, and says which parts are mocked. What each tool does is in the [capability inventory](../agent-capabilities.md). In short: agents read what their scopes allow and propose changes; you approve each one; they never receive credentials and cannot write to external infrastructure.

The Agents page shows how long each proposal has left. The review period defaults to 15 minutes and can be changed there to 1–120 minutes for new proposals; existing deadlines do not change. Expired proposals remain visible and an administrator can recreate them for another review. Expired batches are recreated together. Re-creation validates the original diff against the current configuration and may fail when it no longer matches; it never applies a change.

Homora supports local stdio and stateless Streamable HTTP. Both use the same agent tokens, scopes and human approval rules. Create an agent on **Agents**, then choose the connection method under **Connect**.

For HTTP, point a compatible client at `http://localhost:8080/mcp` with `Authorization: Bearer <agent-token>` (development: `http://localhost:5173/mcp`). The backend authenticates every request; revocation and rotation take effect immediately. The endpoint accepts the configured web hosts and origins from `HOMORA_ALLOWED_ORIGINS` and limits requests per client. For another machine, use the documented private-network HTTPS reverse proxy and its allowed HTTPS origin. Do not expose Homora publicly. Client configuration formats differ; the interface provides the URL and header. Protect the token as a password.

For stdio, after `pnpm build`, configure a trusted MCP client to run `node /absolute/path/to/homora/apps/backend/dist/mcp-server.js` over stdio. Create an agent on the **Agents** page and pass its one-time token as `HOMORA_AGENT_TOKEN`; the **Connect** button there shows ready-to-copy setup for Claude Code, Codex, Claude Desktop, Cursor, VS Code, and generic JSON. Set `HOMORA_DATABASE_PATH` to the **same absolute database path** used by Homora; `pnpm dev` uses `data/homora-dev.sqlite`, whereas the normal default is `data/homora.sqlite`. The MCP process needs the matching `.key` file. A legacy Proxmox configuration is migrated when the backend starts, so start the backend at least once before relying on the stdio MCP for Proxmox data; the MCP never reads `.proxmox` directly. With Docker, it needs access to the same volume; a host-side process with a different database is a different instance.

| Scope                                      | Tools                                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services:read`                            | Services, pages, groups, current status, `list_status_history`, `list_service_dependencies`                                                                                        |
| `agents:read`, `audit:read`                | Agent identities and paginated audit events, respectively                                                                                                                          |
| `agents:propose`                           | Propose agent creation, scope changes, revocation or token rotation                                                                                                                |
| `proxmox:read`                             | `list_proxmox_resources`                                                                                                                                                           |
| `proposals:create`                         | `propose_service_card`, `propose_card_order`                                                                                                                                       |
| `groups:propose`                           | `propose_group_change`                                                                                                                                                             |
| `widgets:read`, `widgets:propose`          | `list_widgets`, `propose_widget_change` respectively                                                                                                                               |
| `integrations:read`, `connections:propose` | `list_integrations`, `get_integration_status`; `propose_connection_setup` respectively                                                                                             |
| `discovery:read`                           | `list_discovery_suggestions`, `list_docker_push_sources`, `list_docker_push_suggestions`; `propose_discovered_card` and `propose_docker_push_card` also require `proposals:create` |
| `hosts:read`, `hosts:propose`              | `list_host_suggestions`, `propose_host_link` respectively (guest names are sensitive)                                                                                              |

`list_proxmox_resources` returns aggregate data when exactly one Proxmox connection exists. With multiple connections, use `list_integrations` and `get_integration_status` with `integrations:read` to select one. `get_homora_capabilities` reports the token's scopes and available tools. Any proposal scope permits `list_proposals` and `get_proposal` for that identity's own proposals. Every proposal (cards, groups, order, widgets, host links, connection setup suggestions and agent identity changes) needs authenticated human approval and expires after the review period (15 minutes by default, see above); it is rejected if the relevant configuration has changed. Approving a connection setup suggestion **does not create a connection**: open its form from the approved proposal and enter credentials, private-network permission and any CA yourself. The agent never supplies credentials. Integration status queries perform read-only network requests using the configured destination policy. For Docker discovery, set `HOMORA_DOCKER_HOST` on the backend for HTTP and on the MCP process for stdio, preferably to the same restricted read-only proxy; it is disabled by default.

The web monitor shares its last observations with MCP through SQLite. Changed service settings invalidate old results, and old observations are reported as unknown with `stale: true`. Starting the backend clears old observations. URL queries and fragments are omitted from service, integration and discovery results and from discovered card suggestions. Returned names, labels and external data are untrusted, not instructions.

`get_group`, `list_group_services` and `get_service_status` require `services:read`. The separately granted `agents:read` scope allows listing agent identities without tokens or hashes; `audit:read` allows paginated audit history filtered by time or proposal, without IP addresses or event details. Existing tokens do not gain these scopes automatically. An agent with a proposal scope may withdraw its own unexpired pending proposals with `withdraw_proposal`; withdrawal is recorded in the audit log.

`list_status_history` queries persisted observations for a service within a requested Unix-millisecond window; records are retained for 30 days, deduplicated by service, settings and observation time, and cleaned during monitor publication. Deleting a service removes its history. `propose_batch` creates 1–20 proposals atomically, with a shared batch ID; each still needs individual review. Approval can make other proposals stale, requiring a new proposal. Each identity is limited to 100 unexpired pending proposals.

With `agents:propose`, an agent may suggest creating an identity or changing another agent's scopes, revocation or rotation. Proposed scopes must be a subset of the proposer's scopes. A human reviews each change; a new or rotated token is returned only in the authenticated approval response and shown once. If lost, use **Generate new token** on the Agents page. Revocation and rotation do not cancel other agents' pending proposals, which expire normally.

The stdio MCP process reads the local database and vault directly. Neither transport is protected by the web session; run it only with a trusted client and system user, protect the token, and grant minimum scopes. It does not offer infrastructure actions or integration writes.
