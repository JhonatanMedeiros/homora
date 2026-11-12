# 0003 — Docker discovery from remote agents

Status: accepted; cross-host validation remains pending.

## Context

The existing on-demand discovery reads one Docker daemon configured through
`HOMORA_DOCKER_HOST`. In a homelab with several Docker hosts, exposing each
Docker API or socket proxy to Homora expands the network attack surface. An
agent can instead read its local Docker API and send a restricted inventory to
Homora. The socket remains privileged even when mounted read-only. The agent
is not the existing MCP agent and its token must not grant MCP access.

## Decision

Keep the existing local discovery and add a separately authenticated push
source for remote hosts. Each source has a distinct stable identity and a
revocable, randomly generated token. Store only a token hash in Homora; show
new tokens once and do not expose tokens in logs or inventory responses. A
revoked source cannot publish or be imported. Define a controlled recovery and
rotation flow before exposing the feature.

The agent collects only container identifiers, names and the supported
`homora.*` and `homepage.*` discovery labels. It does not forward the full
Docker response, unrelated labels, environment variables, mounts, or files.
The server validates a strict bounded document and replaces each inventory
atomically. Bound the number of sources, containers and bytes, request rate,
retention, and freshness; reject oversized or invalid updates without changing
the previous inventory. Treat labels as untrusted data. Record receipt time on
the server; the interface must distinguish missing, stale and current data.

Agent ingestion has its own narrowly scoped authentication and does not bypass
web-origin or session protections for any other route. Require HTTPS with
certificate and hostname validation between hosts, on a private network or
trusted VPN. Do not claim that the current deployment is safe to expose publicly.
Restrict Docker access as far as practical, document the remaining privileged
access, and never publish an unauthenticated Docker proxy.

A suggestion identifies both its source and container. Preview and confirmation
must reference an immutable snapshot, including the selected data and source
status. Confirmation validates freshness, authorization, selected identity and
configuration version, and applies exactly the reviewed data. A concurrent
update, revocation or removal must not permit unreviewed changes to be applied.
Use a single transactional decision for applicable persisted state, including
checks and card creation. Source data cannot enable private monitoring on its
own. The HTTP UI and both MCP transports must enforce the same boundaries.

## Alternatives and consequences

Multiple centrally configured pull sources are simpler to distribute but need
network access to each protected Docker proxy and destination controls. Push
requires distributing and updating an agent on each host, an authenticated
reachable receiver, inventory expiry and a reviewable lifecycle. Neither removes
the agent's privileged local Docker access. Local-only installations retain the
existing discovery and need no agent.

## Validation required

- Migrations preserve existing databases, including upgrade and restart; all
  tests use temporary files.
- Positive and negative tests for per-source authentication, revocation,
  rotation, payload limits, malformed input and secret disclosure. The last valid arrival wins; the protocol does not implement replay or ordering protection beyond TLS and token authentication.
- Two sources, duplicate container IDs, unavailable and stale sources; no
  cross-source contamination or silent partial import.
- Deterministic races for inventory update and source revocation during review
  and confirmation, including separate database connections; only the reviewed
  snapshot may be applied.
- Existing local discovery and scoped MCP clients remain compatible. Verify
  both MCP transports and authorization, browser flows and translations.
- Test the packaged agent against simulated Docker and HTTPS, including rejected
  certificates and restart. Test a deployment across isolated hosts when an
  authorized environment exists; simulated loopback is not evidence of this.
