# ADR 0026: Widget modules and host registry

**Status:** Accepted.

## Context

Page widget validation, transfer, editing and presentation were scattered through the host. Adding a local widget required editing each of those places. Existing rows and exported configurations must remain readable, and integrations must keep their restricted transport and source checks.

## Decision

1. Keep one internal `@homora/widgets` package. Each local widget has a compiled, React-free entry and a source-only `/ui` entry; the compiled TypeScript project excludes UI, and a separate project checks it. A graph check guards the backend and non-UI widget sources. A separate UI package for widgets would add another workspace and duplicate registration without improving this boundary.
2. A local registry lists definitions; `resolveWidget` combines local definitions and integration definitions without reversing the integrations dependency. The frontend has a typed UI registry. Registration is explicit; dynamic plugins are not provided.
3. A definition marks portable configuration. Export and import validate through `parseConfig`; connected widgets retain their source descriptor and are not automatically linked. Existing export versions and database rows are unchanged.
4. Widget UI receives locale and translation through a host context. Widget messages are merged into the application resources alongside integration messages, retaining existing keys and text.
5. The host owns placement, persistence, connection reads, menus and generic dialogs. Modules provide editors, gallery content, previews, display and visibility behavior. The host does not receive credentials from widgets or grant new network access.
6. The top bar renders a registry-provided slot without importing a widget module. The registry binds that slot to the clock module and its browser-local preferences.
7. `sizes` and versioned `source` metadata leave room for future capabilities; wide layout is specified below; internal monitoring contracts are defined in [ADR 0027](0027-widget-internal-monitoring.md).

## Consequences

The source-only UI requires React, shared primitives and Tailwind source scanning in frontend builds; compiled definitions must remain independent of them. The scaffold updates the explicit definition, translation, UI and package registrations together; this keeps the catalog static and avoids runtime discovery. Configuration remains validated on each import and save. Future size and source changes require their own design and validation.

## Page widget sizes (#255)

The host owns the saved layout size, separate from widget configuration. Definitions may declare `sizes` as `normal` and `wide`; the default is `normal`, which must always be supported. Existing definitions support only normal. The host validates writes against the definition. An unknown stored size is displayed as normal without changing the row; an explicit edit saves the chosen known size. The additive `page_widgets.size` column defaults to `normal`, including for existing rows and database backups.

In the strip, wide spans two columns from `sm`; small screens and the rail use one column. Grid auto-placement preserves DOM and keyboard order: a wide item that does not fit moves to the next row, leaving the gap empty rather than backfilling it. Reordering changes position, not size. The 12-widget limit counts instances, not columns; page deletion moves widgets subject to the existing limit, and removing an instance removes its size with it. Size does not add MCP capabilities.

Portable exports retain the current format and include optional `size: wide` only when needed. Older files default to normal. Older readers ignore this optional field, so they can import new files while displaying the widget as normal; they cannot preserve wide through a re-export. Storing size in config was rejected because it mixes host layout with widget data; a new transfer version would cause older readers to reject files. Unknown size values in imports are rejected as invalid widgets.

Internal monitoring sources are portable without a connection; see [ADR 0027](0027-widget-internal-monitoring.md). A module declares the contract and the host supplies its reader.

## Generic widget source host (#282)

To keep the backend and frontend hosts agnostic as external-source widgets are added, `@homora/widgets` defines a `WidgetSourceReader` contract (`packages/widgets/src/source.ts`) registered in `packages/widgets/src/source-registry.ts`. A module with an external or computed source implements `parseQuery`, `read(params, context)`, and optional `project` inside its own directory (e.g. `source.ts`), receiving only host-injected capabilities (`context.fetch` backed by `network-policy.ts`, clamped to at most 8 s and 512 KB, with DNS pinning and no redirects).

The backend mounts one generic route (`GET /api/widget-sources/:contract` in `apps/backend/src/routes/widget-sources.ts`) that owns authentication, TTL caching, concurrent request deduplication, stale-cache fallback, and policy error mapping. The frontend `WidgetHost` exposes a single generic `readSource(contract, params, signal)` helper so new widget modules do not require new host routes or `WidgetHost` methods. Internal monitoring contracts (`ADR 0027`) remain on `widget-monitoring.ts` for their direct SQLite/monitor snapshot readers.
