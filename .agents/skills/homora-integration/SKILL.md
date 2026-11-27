---
name: homora-integration
description: Create, change or review a Homora service integration or its widgets under packages/integrations. Use for adapters, manifests, descriptors, fixtures and contract tests.
---

# Homora integration

Read before changing anything:

- [integration SDK guide](../../../docs/adapters.md): the source of truth for files, security rules,
  fixtures and the contract test
- [integration reference](../../../docs/integrations.md)
- [ADR 0011](../../../docs/decisions/0011-integration-sdk.md)
- the closest existing integration under `packages/integrations/src/integrations/`, with its tests

## Stop and ask first

The request needs a separate design and review if it requires a write call to the service, a new
header, transport method, permission, scope or destination rule, a login flow outside
[ADR 0018](../../../docs/decisions/0018-integration-session-auth.md), or runtime code loading.

## Steps

1. Confirm the service API from its official documentation: endpoints, authentication and the least
   privileged read-only credential. If you cannot, say so; do not invent response shapes.
2. Choose a manifest when its vocabulary covers the API
   ([ADR 0009](../../../docs/decisions/0009-declarative-integration-adapters.md)), otherwise a code
   adapter.
3. New integration: `pnpm integration:create <type> <manifest|code>`. Replace every placeholder.
   In the generated test template, import the test helpers from
   `packages/integrations/test-support` as existing integrations do; integration code must not
   import from the applications.
4. Add sourced, sanitized fixtures and the contract test. State whether each fixture is recorded,
   documented or hand-written.
5. Rename `integration.json.example` to `integration.json`, set a unique `order`, and run
   `pnpm integration:catalog`. Review the generated diff; never edit generated files.
6. Keep service-specific behavior, widgets and translations (English and Portuguese) in the
   integration directory; brand assets go in `packages/icons`. Add no per-service branch to `apps/`.
7. Preserve type IDs, stored fields and existing behavior unless a tested migration is part of the
   request.
8. Update the integration reference, with required permissions, and mark a new integration
   **implemented, unvalidated**.

## Validate

```sh
pnpm exec vitest run packages/integrations/src/integrations/<type>
pnpm check
pnpm build
```

Mocked fixtures show contract behavior, not compatibility with a real service. Do not connect to
real infrastructure without authorization, and report live validation as pending unless it was
performed (template in the SDK guide).

Finish with the pull request checklist in the SDK guide.
