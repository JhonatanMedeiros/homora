# ADR 0002: Governed agent identity proposals

**Status:** Accepted

## Context

Agents need to suggest changes to other agent identities without gaining authority to issue credentials or approve their own work. Tokens can grant access to local homelab information and must not be stored in a proposal or returned to its author.

## Decision

A separately granted `agents:propose` scope allows proposals to create identities, change scopes, revoke or rotate tokens. Requested scopes must be a subset of the author's scopes when the proposal is created. Proposals contain the requested change and relevant public identity state, never a token or token hash. An authenticated human reviews the exact change; concurrent changes to the target invalidate it. Creation and rotation generate a token in the same transaction as approval and auditing, returning it only in the no-store HTTP response. The human can rotate an active identity if the token is lost. Revocation and rotation take effect at the next authentication and do not cancel other identities' pending proposals.

## Alternatives

Direct agent administration or token delivery to the proposer would make a compromised agent able to issue credentials without human oversight. Automatic approval policies would require a separate authorization model and are excluded.

## Consequences

Review is slower and a lost response requires human rotation. Existing tokens do not receive the new scope. Identity proposals and ordinary proposals share expiry, withdrawal and audit behavior. Review must present the target, operation and scopes before approval. Identity mutations and their review events are committed together.
