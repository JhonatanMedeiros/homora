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
- **The application draws the widgets over its own data.** The Summary widgets declare a name, a gallery entry,
  a configuration and its editor in `packages/widgets`. Their content comes from services, health and maintenance
  already loaded by the Home, so their module has no view and the frontend supplies one (`summaryRenderers`). A test
  requires a renderer for every `summaryOnly` definition, and a widget without one, or with settings that cannot be
  read, says so instead of disappearing. Moving that data into the widgets package would invert the dependency between
  the application and its widgets.
- **A widget may cover part of the installation.** Pinned, Needs attention, service windows, hosts, states, latency and
  maintenance accept group and page names; probes accept probe names. `{}` means everything. A name that no longer
  exists matches nothing, so a selection never silently widens. Narrowed health is derived by the same functions as the
  whole one, without probes, which belong to no group or page. Health figures, availability and proposals have no
  options, because they read installation totals that the server does not split.
- **Only what is on the page is computed.** A renderer runs when its widget is shown, and widgets with the same scope
  share one reading. The Home still reads its sources once for all of them.
- **One writer.** `page-widget-store.ts` is the only module that writes page widgets; it keeps the limits and the order
  of each page. Routes, pages, the Summary save, import and agent proposals call it inside their own transactions.
- **Pages start complete.** A migration gives every existing page the eleven widgets; creating a page, in the interface,
  by an agent proposal or by an import, does the same. Deleting a page deletes its Summary widgets and asks for a
  destination only for groups and other widgets.
- **One edit, one transaction.** `PUT /api/pages/:id/summary-layout` takes the revision, both arrangements, the widgets
  to create (under negative ids) and the ids to delete. A conflict or an invalid item changes nothing.
- **Import never doubles the Summary.** From file version 7, a page that holds only unnamed Summary widgets without
  options and no arrangement takes the file's; any other page keeps its own and receives only those it lacks, compared
  by type, name and options.
- **Limits.** A page holds 40 widgets and the installation 500, replacing 12 and 200, because the Summary alone uses
  eleven. Passing either is `409 widget-limit`.

## Consequences

- A new card of the Summary is a widget definition plus its view, with no change to the layout format. Pages that already
  exist do not receive it unless a migration adds it; people add it from the gallery.
- A Summary widget may be added more than once, each with its own name and scope.
- Editing a widget's options saves it at once, as for every page widget; it is not part of the arrangement draft.
- Services lists the widgets of a page except those only the Summary draws.
- Going back to an earlier version leaves widget types it does not know; it shows them as unsupported.
