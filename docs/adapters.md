# Writing an integration adapter

This guide lets you add a read-only integration without asking questions. Status of every
integration today: **implemented, unvalidated** (see [live validation](#live-validation-template)).
Integrations are built in: they are registered in the repository, never loaded from the database,
the network or the user. Do not add runtime code loading.

## Two ways to add an integration

Most read-only integrations are a **manifest**: data in `packages/shared/src/integration-manifest.ts`
validated at startup and run by one interpreter (`apps/backend/src/manifest-adapter.ts`). Read
[ADR 0009](decisoes/0009-declarative-integration-adapters.md) for the vocabulary and what it does not
cover. Anything needing more than that (several requests with partial failure, CA pinning, large
payloads, POST, a login flow, a non-whitelisted header) stays a **code adapter**, and a service that
needs a write call or a new header is out of scope until a decision says otherwise.

### Files to touch for a manifest

| Purpose                 | File                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest                | `packages/shared/src/integration-manifest.ts`: export a manifest and add it to `integrationDefinitions`                                                          |
| Brand icon              | must already be in `packages/shared/src/brand-icons.ts` (`BRAND_ICON_NAMES`); add the logo there first if not                                                    |
| Fixtures                | `apps/backend/src/fixtures/<type>/*.json`                                                                                                                        |
| Contract and unit tests | a `runAdapterContract` call in `apps/backend/src/adapter-contract.test.ts` (use `createManifestAdapter`), and a data-mapping case in `manifest-adapters.test.ts` |
| Translations (optional) | `labelKey` and `key` values must exist in `apps/frontend/src/i18n/messages`; without them the English text shows                                                 |
| Docs                    | the integration entry in `docs/integracoes.md` with required permissions                                                                                         |

Type enums, stored fields, the connection form, widget text, the picker and the catalog endpoint derive
from the manifest. You do not edit `input-schemas.ts`, `managed-proposals.ts`,
`integration-connections.ts` or the frontend connection files.

### Files to touch for a code adapter

| Purpose      | File                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Adapter      | `apps/backend/src/<name>.ts`: `create<Name>Adapter(transport)` returning `{ type, label, capabilities, validate, collect }` |
| Metadata     | a `kind: 'code'` entry in `integrationDefinitions` (fields, mark, brand icon)                                               |
| Registration | `apps/backend/src/integration-registry.ts`                                                                                  |
| Display      | the frontend renders only manifest displays; a code adapter needs its own rendering in `connection-model.ts`                |
| Tests, docs  | as above                                                                                                                    |

## Security rules

- All traffic goes through the injected transport (`network-request.ts`): destination policy,
  DNS pinning, TLS, timeouts, response size limit, header whitelist (`authorization`, `x-api-key`,
  `accept`). Never use `fetch` or another client.
- GET only. No write calls to integrated services.
- `validate` rejects: non-string or oversized values (URL at most 2048 characters), non-http(s)
  schemes, credentials, query strings and fragments in URLs, and anything else the adapter does
  not need. Values that end up in a path (slug, entity id) must match a strict allow-list pattern.
- Credentials are used only inside the backend. They never appear in returned data, errors, logs,
  audit entries, `registry.list()` or MCP output.
- Treat the remote response as untrusted: check shape, types, string lengths, array sizes and numeric
  ranges; return only the fields you need. On failure throw a fixed, generic message; never echo the
  remote body, status text or transport error.
- Never pass a secret through a field the remote service can reflect back unchecked.

## Fixtures

Store a response sample under `apps/backend/src/fixtures/<type>/<name>.json`:

```json
{
  "_source": { "kind": "...", "docs": "<official doc URL>", "note": "<what was checked and when>" },
  "body": {}
}
```

Prefer a recorded response or one copied from the official documentation, and state which. If the
sample is hand-written, say so. Never claim a live check you did not perform. Remove tokens, hostnames
and personal data from recordings.

## Running the contract test

```ts
runAdapterContract({
  name: 'my-service',
  create: createMyAdapter,
  validConfig: { url: 'https://svc.example.test', token },
  secrets: [token],
  invalidConfigs: [{ label: 'credentials in URL', config: { url: 'https://u:p@svc.example.test', token } }],
  pathFields: ['slug'], // fields that reach the request path
  fixtures: { valid: { body, expected }, wrongShape: [...], oversized: [...], echoSecret },
});
```

Run `bun --bun vitest run apps/backend/src/adapter-contract.test.ts`, then `bun run check` and `bun run build`.
The harness checks, with a fake transport: input validation, request shape (only `origin`, `path`
and `authorization`; a safe path built from validated config; hostile values such as `../`, `?`, `#`,
`%2f`, whitespace and control characters rejected), secrets absent from data, errors and the registry
listing, every response class (valid, wrong shape, oversized, 401/403, 404, 429, 5xx, network error,
timeout, non-JSON), bounded output and the observation cache (success cached, failure not cached,
invalidation during a request). `sanitizesTransportErrors: false` is a documented opt-out for adapters
whose transport already throws fixed strings; justify it in the test.

## Live validation template

An integration stays **implemented, unvalidated** until the maintainer fills this in against a real
instance. Copy it into the PR or `docs/integracoes.md`.

```text
Integration: <name>      Service version: <x.y.z>      Date: <YYYY-MM-DD>
Validated by: <who>      Homora commit: <sha>
- [ ] Connection saved with a least-privilege, read-only credential
- [ ] Widget shows the expected values
- [ ] Wrong credential gives a generic error
- [ ] Unreachable host gives a generic error
- [ ] Private or public destination policy behaved as documented
- [ ] No credential visible in the UI, logs or API responses
Notes / deviations:
```

## Pull request checklist

- [ ] Every file in the relevant table above is updated
- [ ] Contract test passes and the type is covered
- [ ] Fixtures cite their source honestly
- [ ] Only GET through the shared transport; no new header, method or code loading
- [ ] Required permissions documented (read-only token where supported)
- [ ] Marked "implemented, unvalidated" in the docs
- [ ] `bun run check` and `bun run build` pass
