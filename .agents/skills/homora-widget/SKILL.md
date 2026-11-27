---
name: homora-widget
description: Create, change or review a Homora local widget under packages/widgets, including its configuration, UI, messages and external sources. For widgets of a service integration, use homora-integration.
---

# Homora widget

Read before changing anything:

- [widget creation guide](../../../docs/create-widget.md): the source of truth
- [widget catalog](../../../docs/widget-catalog.md)
- [ADR 0019](../../../docs/decisions/0019-widget-sdk.md) and
  [ADR 0026](../../../docs/decisions/0026-widget-modules.md)
- the closest existing module under `packages/widgets/src/widgets/`

## Stop and ask first

New sources, permissions and sizes need their own approved scope. So does anything that would add a
widget-specific route, `WidgetHost` method or branch in the host.

## Steps

1. New widget: `pnpm widget:create <type>`, then review every registration change it made.
2. `definition.ts`: versioned defaults and a strict `parseConfig`. Compiled files import neither
   React nor `@homora/ui`. Provide `portableConfig` when the configuration references things local
   to one installation.
3. `ui/`: view, editor and gallery entry, using the host context and shared primitives (see the
   `shadcn` skill and [standards](../../../docs/standards.md)). Do not import the applications,
   integrations or other widget modules. Set `category` and useful `keywords`.
4. External data: implement `WidgetSourceReader` in `source.ts`, register it in
   `packages/widgets/src/source-registry.ts` and read it with `useWidgetHost().readSource()`. Never
   put credentials or arbitrary URLs in widget configuration, and treat responses as untrusted.
5. Replace both English and Portuguese messages.
6. Keep stored configurations and portable exports working when changing an existing widget.
7. Keep widget tests inside the module: definition, source, and UI behavior, invalid
   configuration, accessibility and edge cases.
8. Update the widget catalog.

## Validate

```sh
pnpm exec vitest run packages/widgets/src/widgets/<type>
pnpm check
pnpm build
```

Check the gallery and the layouts the widget supports in a browser, including a narrow screen. Say
what was not verified.
