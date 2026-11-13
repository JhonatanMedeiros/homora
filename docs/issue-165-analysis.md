# Service link target behavior — Issue 165 analysis

## Proposed experience

When creating or editing a service, display an **Open link** field next to the address,
with the options **New tab** and **Same tab**. The first remains selected by
default, including for existing services. The options must be visible and
mutually exclusive, keyboard-accessible, and translated into English and Portuguese.
On small screens, the control must fit within the form width without requiring
horizontal scrolling. The choice is saved with the service alongside other changes.

The behavior must be consistent across list, card, hosts, and map views,
as well as when opening a result or recent service in the command palette. Links must remain
native links to allow context menus and browser modifier keys. For
a new tab, retain `rel="noopener noreferrer"` and screen-reader announcements;
for the same tab, do not announce a new tab. The palette's Shift+Enter shortcut continues
navigating to the card, as it has its own dedicated function.

## Current state and implications

- Cards in list and grid views and links in hosts and map views
  use `target="_blank"`; the palette uses `window.open` with the same target.
- Service configuration passes through the shared contract, API validation,
  creation and update SQL, editing, proposals, and import/export. Modifying
  only the visual component would not preserve the preference.
- Updates omitting the property must preserve the existing value,
  including when originating from legacy flows or proposals. New services
  without the property use a new tab.

## Suggested implementation

1. Add an optional field to the contract with explicit `new-tab` and
   `same-tab` values, validated by the API. Add a column with a `new-tab` default via a
   compatible migration, preserving existing services. Include the field in service
   reads and writes, including proposals and import.
2. Export the choice in native YAML/JSON format and accept legacy files without
   the field as new tab. For invalid values, show a preview warning instead
   of silently altering intent. Do not assume equivalence with Homepage or
   Dashy options without verifying their formats.
3. Add the control to the form and preserve the choice in the edit draft.
   Centralize the target decision across all four link presentations and the
   palette, preserving native link behavior and new-tab protection.
4. Update usage and import/export documentation. Only record the issue
   as resolved once the criteria and verification steps below are met.

## Required verification

- Migration on a temporary database with preexisting data: services and other fields
  preserved with new-tab target. Create, edit, and update without sending the field.
- Import legacy files and verify YAML/JSON round-trips in both modes; also validate
  invalid values and proposals that omit the preference.
- Test list, grid, hosts, map, and palette in both modes and with the default; verify
  accessible indicators, new-tab protection, keyboard navigation, and link modifier keys.
- Inspect the form at desktop and mobile widths, in light and dark themes,
  and execute `pnpm check` and `pnpm build`.

This analysis records the chosen implementation direction for the issue.
