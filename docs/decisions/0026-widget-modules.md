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
7. `sizes` and versioned `source` metadata leave room for future capabilities; neither wide layout nor an internal monitoring source is implemented here.

## Consequences

The source-only UI requires React, shared primitives and Tailwind source scanning in frontend builds; compiled definitions must remain independent of them. Module registration remains manual until the separate scaffold and boundary work. Configuration remains validated on each import and save. Future size and source changes require their own design and validation.
