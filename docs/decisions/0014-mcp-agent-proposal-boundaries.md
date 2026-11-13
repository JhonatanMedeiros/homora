# ADR 0014: MCP, agent identity and proposal boundaries

**Status:** Accepted

## Context

`createMcp` serves both stdio (separate process, direct SQLite and vault access) and stateless HTTP (`/mcp` in the backend). Agent tokens are authenticated separately from the web session. Proposals are created by agents but reviewed by humans through the web API, so they are not an MCP-only concern. This ADR is about code organization only; R4 validation remains tracked in issue #124 and is not claimed complete here.

## Dependency map

Direction is always downward; a static import scan of `apps/backend/src` found no cycles after the changes below.

| Layer                | Modules                                                                                                                                   | Owns                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Transports           | `server.ts`/`mcp-server.ts` (stdio), `mcp-http.ts`                                                                                        | Token source, host/origin checks, rate limit. Create one `createMcp` per connection or request.                |
| MCP composition      | `mcp.ts`, `mcp-tool-context.ts`                                                                                                           | Builds the context and registers tools.                                                                        |
| MCP boundary helpers | `mcp-identity.ts`, `mcp-responses.ts`, `mcp-proposal-schemas.ts`, `mcp-discovery-schema.ts`                                               | Scope enforcement bound to a token, response filtering (`publicUrl`, generic errors), advertised tool schemas. |
| Tools                | `mcp-*-tools.ts`, `mcp-integration-extensions.ts`                                                                                         | Tool names, inputs and scope per tool. They never import each other.                                           |
| Agent identity       | `agent-scopes.ts`, `agent-identities.ts`, `agent-changes.ts`                                                                              | Scopes, issue/authenticate/rotate/revoke, reviewable identity changes.                                         |
| Proposal domain      | `proposals.ts`, `managed-proposal-creator.ts`, `managed-proposals.ts`, `proposal-review.ts`, `proposal-batches.ts`, `proposal-queries.ts` | Creation, expiry, review, batches, audit. Shared by the web routes and MCP.                                    |
| Domain services      | `service-configuration.ts`, `integration-connections.ts`, `docker-push.ts`                                                                | Versioned configuration and connections.                                                                       |

Boundaries:

- Transport authentication (Bearer token, host, origin, limits) stays in the transport; the web session never authenticates an agent. Human review (approve/reject/recreate) is only exposed through authenticated web routes, never as an MCP tool.
- Scope checks go through `createMcpIdentity`, so the token is re-checked on every call and revocation or rotation applies to an already connected client.
- Agents only create proposals. Approval applies the exact reviewed diff inside one SQLite transaction with expiry, version conflict, batch atomicity and audit. No MCP tool receives credentials or writes to an external integration.

## Changes

- `mcp.ts` is composition only: response helpers moved to `mcp-responses.ts`, token/scope binding and the list of proposal scopes to `mcp-identity.ts`.
- Discovery schemas moved to `mcp-proposal-schemas.ts`, removing the import from `mcp-integration-tools.ts` into `mcp-proposal-tools.ts`.
- `agentChangeSchema` moved to `agent-changes.ts`, removing the `proposals.ts` ↔ `proposal-review.ts` cycle. `proposals.ts` still re-exports it. Tool names, schemas, scopes and behavior are unchanged.

## Decision on a separate package

Deferred. Consumers are the backend routes, both MCP transports and the stdio entry point, all inside `apps/backend`. Proposals depend on `service-configuration`, the vault and the audit module, which are not packages, so extracting them would drag those along or invert the dependency direction. Extracting proposals as MCP-only would also be wrong because the web review flow uses them. Revisit if a second application needs the proposal domain or identities.

## Consequences

Module names now mark the boundary, but it is enforced by convention, not by package visibility. New tools should depend only on the context and the boundary helpers.
