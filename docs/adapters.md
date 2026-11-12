# Writing an integration adapter

This guide lets you add a read-only integration without asking questions. Status of every
integration today: **implemented, unvalidated** (see [live validation](#live-validation-template)).
Integrations are built in: they are registered in the repository, never loaded from the database,
the network or the user. Do not add runtime code loading.

## Files to touch

| Purpose                 | File                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter                 | `apps/backend/src/<name>.ts`: `create<Name>Adapter(transport)` returning `{ type, label, capabilities, validate, collect }`                                               |
| Registration            | `apps/backend/src/integration-registry.ts`: add an entry with `prepare(context)`                                                                                          |
| Type enums              | `apps/backend/src/input-schemas.ts` and `managed-proposals.ts`                                                                                                            |
| Stored config           | `apps/backend/src/integration-connections.ts`: public config keys (`url`, `allowPrivate`, `entityId`, `username`, `slug`), credential mapping (`secret`, `tokenId`, `ca`) |
| Connection form         | `apps/frontend/src/features/connections/connection-model.ts`, `connection-form.tsx` and the i18n messages (English and pt-BR)                                             |
| Brand icon              | `packages/shared/src/brand-icons.ts`                                                                                                                                      |
| Fixtures                | `apps/backend/src/fixtures/<type>/*.json`                                                                                                                                 |
| Contract and unit tests | a `runAdapterContract` call in `apps/backend/src/adapter-contract.test.ts` plus `<name>.test.ts` for data mapping                                                         |
| Docs                    | the integration entry in `docs/integracoes.md` with required permissions                                                                                                  |

The coverage test in `adapter-contract.test.ts` fails when a registered type has no contract run.

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

Run `pnpm vitest run apps/backend/src/adapter-contract.test.ts`, then `pnpm check` and `pnpm build`.
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

- [ ] Every file in the table above is updated
- [ ] Contract test passes and the type is covered
- [ ] Fixtures cite their source honestly
- [ ] Only GET through the shared transport; no new header, method or code loading
- [ ] Required permissions documented (read-only token where supported)
- [ ] Marked "implemented, unvalidated" in the docs
- [ ] `pnpm check` and `pnpm build` pass
