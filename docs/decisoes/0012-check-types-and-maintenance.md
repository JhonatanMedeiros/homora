# 0012 — More check types and scheduled maintenance

Status: accepted (2026-11-12)

## Context

Homora only probed HTTP and ICMP. Homelabs also need "is the port open", "does the name resolve",
"is the certificate about to expire" and "does the page still say what it should", and they need to
take a service out of the statistics while it is being worked on.

## Decision

**Check types.** `checkType` grows to `http | ping | tcp | dns | tls | keyword | json`. The address
stays an `http(s)` URL for every type, so a card always has something to open and validation does not
change. TCP uses the URL's host and port, DNS resolves its host, TLS reads the certificate at its host
and port. `keyword` and `json` are HTTP checks with a new column `check_match` (`services.check_match`,
at most 200 printable characters): a keyword is looked for case-insensitively in the first megabyte of a
2xx response, a JSON expectation is `path=value` with a dotted path (object keys and array indexes only,
no expression language, no inherited keys). Bare `path` means "exists and is not null or false".

Every type goes through `authorizeDestination`, the same pinned-DNS policy as before (loopback and
special ranges refused, private LAN only with the per-service opt-in). TLS connects to the authorized
IP with the host name as SNI and does not abort on an untrusted chain, so it can say _why_: `cert-expired`,
`cert-invalid` (unavailable) or `cert-expiring` (available, within 14 days). The expiry travels in the
observation as `certExpiresAt`. Nothing from a response body is stored: a content mismatch is only the
reason `content-mismatch`.

`check_match` joins the signature only when set, so existing services keep their signature and history.
Imports, exports, proposals and the agent API carry `checkMatch` like `checkPath`.

**Maintenance.** `service_maintenance(service_id, starts_at, ends_at, note)` holds windows of one service
(at most 30 days, no overlap for the same service). While a window is open the monitor does not probe the
service and records `unknown` with the reason `maintenance`. Reusing `unknown` means uptime, incidents,
rollups and alerts already ignore it without a special case. Entering or leaving a window takes effect at
the next monitor pass, not the next interval. Windows are scheduled by the signed-in user only, never by
imports or agents, and are audited.

## Consequences

- An open incident when maintenance starts stays open until the first success afterwards.
- Heartbeat (push) checks, recurring windows and windows for a whole group are not part of this change.
- The status page and notifications do not yet show maintenance as its own state.
