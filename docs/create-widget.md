# Create a local widget

Read [ADR 0026](decisions/0026-widget-modules.md), [ADR 0019](decisions/0019-widget-sdk.md), the [catalog](widget-catalog.md) and [engineering standards](standards.md) before starting. New sources, permissions and sizes require separate approved scope.

Run `pnpm widget:create my-widget` with a unique lowercase, hyphenated type. The command creates a working example under `packages/widgets/src/widgets/my-widget` and registers its definition, messages, UI and package export. It refuses an existing name; review all generated changes. No host route, transfer, planner, layout, dialog or gallery edits are needed.

- In `definition.ts`, implement versioned defaults and strict `parseConfig` validation; put pure logic alongside it. Compiled files cannot import React or `@homora/ui`.
- In `ui/`, implement the view, editor and gallery using the host context and shared primitives. Do not import the application, integrations or other widget modules. Move reusable pure utilities outside individual modules.
- Replace both English and Portuguese messages in `messages.ts`. The generated registration merges them into the host resources.
- Extend the generated definition test and add UI tests for behavior, invalid configuration, accessibility and relevant edge cases. Preserve existing stored configurations and portable exports when changing a widget.

Run the focused tests, `pnpm check` and `pnpm build`; validate the gallery and relevant layouts in a browser and record what was not verified. The scaffold is an internal example, not a plugin API or permission to add network access.

Page widgets can declare `sizes: ['normal', 'wide']` in their definition when approved for that scope; omitting it means normal only. The host owns the choice and persistence. Wide spans two columns in the strip from `sm` and renders as normal in the rail and on small screens, so every widget must remain usable at normal width.

Internal monitoring sources are registered by contract and version, require no connection, and are portable. See [ADR 0027](decisions/0027-widget-internal-monitoring.md) for the three contracts, limits, stale data and privacy. The host reads them; a widget must not access monitoring infrastructure directly. MON presentations remain separate work.

For approved external-source widgets, implement a `WidgetSourceReader` in `source.ts`, register it in `packages/widgets/src/source-registry.ts`, and read it from `ui/` via `useWidgetHost().readSource(contract, params, signal)`. The backend host (`GET /api/widget-sources/:contract`) injects the restricted `context.fetch` transport (`network-policy.ts`) and owns caching, deduplication, and stale-cache fallback without widget-specific routes.

Keep widget-specific source, parser, config, and UI tests inside `packages/widgets/src/widgets/<type>/` (e.g. `definition.test.ts`, `source.test.ts`, `ui/index.test.tsx`). Host tests in `apps/backend` should only cover generic host infrastructure (auth, caching, `network-policy.ts` enforcement, and `page_widgets` persistence/transfer).
