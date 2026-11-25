# @homora/integrations

Private SDK for built-in, read-only integrations and their widgets. The complete contributor and
agent workflow is in [docs/adapters.md](../../docs/adapters.md); current support and live-validation
status are in [docs/integrations.md](../../docs/integrations.md).

Each integration owns its definition, descriptor, fixtures, tests and optional backend, frontend,
translations, MCP tools and development fixture under `src/integrations/<type>`. Start with
`bun run integration:create <id> <manifest|code>`, complete and review the generated skeleton, then
register it and run `bun run integration:catalog`. The catalogs are static and built from repository
files; the SDK does not load plugins from users, databases or networks.

`/backend/manifest` supplies the generic manifest runtime with injected host validation and error
policy. `/backend/catalog`, `/frontend/catalog`, `/backend/mcp`, and `/translations` expose generated
capabilities. The host owns its transport, access policy, authentication and persistence; changes
that introduce new capabilities or permissions need review. Use `@homora/icons` for bundled logos.

Run the integration's contract test, `bun run check`, and `bun run build`. Fixtures are not evidence of
compatibility with a live service; record real validation separately and never contact infrastructure
without authorization.
