# ADR 0033: Everything on the Summary is a page widget

**Status:** Accepted

## Context

Issue #391 makes the Summary a grid that each person arranges. Its health cards (pinned services, Needs attention,
availability and so on) were part of the page, while page widgets were added and removed by the person. A first design
kept both kinds: cards that could only be hidden, and widgets that could be deleted. Two sets of rules for things that
look alike confused the interface, the stored layout, import and export.

## Decision

- **One model.** Each card is a page widget, with a row in `page_widgets`, added from the widget gallery and removed
  like any other. The layout refers only to widget ids.
- **Definitions say where a widget lives.** `WidgetDefinition.summaryOnly` marks a widget that only the Summary draws,
  and `summary` gives its default and smallest size in the grid. Applications read these flags; they do not compare
  widget types ([ADR 0026](0026-widget-modules.md)).
- **The application draws the widgets over its own data.** The Summary widgets declare a name, a gallery entry and a
  strict empty configuration in `packages/widgets`. Their content comes from services, health and maintenance already
  loaded by the Home, so their module has no view and the frontend supplies one. Moving that data into the widgets
  package would invert the dependency between the application and its widgets.
- **Pages start complete.** A migration gives every existing page the eleven widgets; creating a page, in the interface,
  by an agent proposal or by an import, does the same. Deleting a page deletes its Summary widgets and asks for a
  destination only for groups and other widgets.
- **One edit, one transaction.** `PUT /api/pages/:id/summary-layout` takes the revision, both arrangements, the widgets
  to create (under negative ids) and the ids to delete. A conflict or an invalid item changes nothing.
- **Import never doubles the Summary.** From file version 7, a page that holds only unnamed Summary widgets and no
  arrangement takes the file's; any other page keeps its own and receives only the types it lacks.
- **Limits.** A page holds 40 widgets and the installation 500, replacing 12 and 200, because the Summary alone uses
  eleven.

## Consequences

- A new card of the Summary is a widget definition plus its view, with no change to the layout format. Pages that already
  exist do not receive it unless a migration adds it; people add it from the gallery.
- A Summary widget may be added twice. They show the same data until a configuration is added, which is possible later
  through the normal widget version rules.
- Services lists the widgets of a page except those only the Summary draws.
- Going back to an earlier version leaves widget types it does not know; it shows them as unsupported.
