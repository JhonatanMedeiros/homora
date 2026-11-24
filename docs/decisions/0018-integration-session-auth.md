# 0018 — Session authentication for integrations

**Status:** Implemented for the built-in Pi-hole v6 adapter; partially validated by user report.
Extended by [ADR 0028](0028-session-auth-client-credentials.md) (fixed login query, success code,
enumerated authorization format) for the Omada client-credentials login.

## Context

Pi-hole v6 requires a password exchange at `POST /api/auth` for authenticated API
access. It returns a temporary session identifier, which can be sent in `X-FTL-SID`.
The existing integration transport only exposes GET; the notification transport's POST
does not provide a suitable integration authorization boundary. A generic arbitrary POST
would allow integrations to mutate external services and contradict ADR 0011.

## Boundary

- Add a host-owned authentication capability, explicitly declared by built-in integration
  registration. A declaration identifies a fixed login path, request shape and permitted
  session header; it does not grant arbitrary POST, paths, headers or request bodies.
- Send credentials only over HTTPS, using the existing destination authorization, DNS pinning,
  TLS verification, timeouts, response limits and no-redirect policy. Never put a password or
  session identifier in a URL, logs, browser responses, audit events or MCP responses.
- Keep session identifiers in backend memory, scoped to the connection and credential version.
  Deduplicate concurrent login attempts; bound session lifetime using the server's expiry and a
  24-hour maximum, refreshed on successful reads. Invalidate on connection edits, deletion and authentication failure.
  Retry an expired session at most once; apply bounded backoff to failed authentication.
- Keep remote operations read-only except the declared authentication exchange. Validate the
  response schema and bounds and return generic errors, never remote response content.
- Implement Pi-hole v6 as a built-in code adapter with an application password, fixed summary
  reads and no DNS management operations. Document the actual privileges and supported version
  only after verification. Do not require disabling Pi-hole authentication.

## Verification and limitations

The built-in registration declares a bounded login profile: a fixed path; flat JSON fields sourced
from the secret, token ID or named public configuration; fixed paths to the token, optional validity
flag and lifetime; token format; sliding or fixed expiry; and a Bearer or explicitly whitelisted
header. The host validates these declarations and keeps authentication and its session lifecycle
inside the restricted transport. Pi-hole owns its particular mapping. A second, synthetic login
contract is tested with a username and Bearer token; it is not a real service compatibility claim.
Nested request bodies, cookies, form encoding, challenge flows, arbitrary headers and arbitrary
methods remain unsupported and need a separate design and review. There is no
remote logout: discarded sessions expire on Pi-hole, which limits concurrent sessions. Integration
contract, transport, connection and network tests cover the implementation. A user reported a
successful live test; a detailed validation record remains pending. See the integration reference for the current validation record.

Sources: [Pi-hole API authentication](https://docs.pi-hole.net/api/auth/),
[ADR 0009](0009-declarative-integration-adapters.md), and
[ADR 0011](0011-integration-sdk.md).
