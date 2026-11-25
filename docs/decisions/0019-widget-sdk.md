# ADR 0019: Internal widget SDK and placement

**Status:** Accepted for widgets included in this implementation.

## Context

Integration presentations were coupled to the integration catalog and to `integration_widgets`
rows. Those rows require a connection; those without a card remain available only on the
Integrations screen. The clock and top-bar telemetry selection belong to the browser.
The [widget inventory](../issue-159-widget-inventory.md) describes the previous surfaces.

## Decision

The module and source-only UI boundaries in [ADR 0026](0026-widget-modules.md) extend this decision.

`@homora/widgets` is an internal workspace package without dependencies on integrations, the
backend server, or React in its compiled entries. It declares localizations, schema versioning, validated configurations,
optional sources, states, and presentations for statistics and the clock. The clock is a local
definition without a source or network access. Top-bar telemetry requires the `system-telemetry`
version 1 contract. A source satisfies a requirement only when contract name and version match
exactly; absence satisfies only absence.

`@homora/integrations` depends on the common contract, never the reverse. Registration remains
explicit at build time: code presentations and manifests stay in their respective integration
directories. Each integration output uses a specific `integration:<type>` version 1 contract;
only integrations declaring telemetry capability provide the shared telemetry contract. The catalog
adapts both presentation forms to the same contract without duplicating specific rules. Previous
presentation exports remain available as compatibility aliases.

The host controls session, persistence, localization, polling, transport, and credentials. It
validates configuration and compatibility before saving, and the adapter validates observations
before presentation. Widgets never receive credentials or direct network access. Integration reads
use the existing API and per-connection cache; page widgets batch reads by connection every 60
seconds. Failures and invalid data are displayed per instance. There is no mutable state API in
this delivery: any future capability must be mediated and authorized by the host; external
integrations remain strictly read-only.

## Data and lifecycle

An additive migration creates `page_widgets` with identity, page, type, name, configuration,
version, optional source, and position. No existing rows are converted. The host validates
version 1 on read and write; unknown versions are neither edited nor interpreted. Deleting a
page with widgets requires a destination and moves instances within the same transaction. Used
connections cannot be deleted. Removing an instance does not delete its connection. Clock
settings and top-bar source selection remain local to the browser. The legacy widget API and MCP
tools remain unchanged; page widgets are neither exposed nor editable via MCP in this delivery.

Homora configuration export version 3 uses page names and, for sources, connection type and name,
never IDs or credentials. Import accepts legacy versions and is additive: clocks are added;
connected widgets are listed as skipped in the preview and must be recreated with a user-selected
connection. There is no automatic linking by name, even when only a single candidate connection
exists. Page or widget changes invalidate import previews via configuration versioning. Database
backups remain the complete disaster recovery mechanism, including local links.

## Alternatives and consequences

Reinterpreting `service_id = NULL` would introduce unexpected widgets and invalidate pending
proposals; a separate table prevents this divergence. Converting all integration data into a
generic statistics list would erase semantic guarantees; specific contracts prevent false
compatibility. An independent package avoids dependency cycles, but requires inclusion in the
build and Docker images. The catalog is internal and compiled with the product: this decision
does not provide a public SDK, dynamic loading, third-party plugins, or expanded network access.

### Boundary verification follow-up

Widget runtime and test code are subject to the same application-import boundary, and also cannot
depend on integration code. A workspace graph checks transitive runtime dependencies starting at
`@homora/widgets`, while a synthetic minimal-host test exercises the public widget contracts.
The graph does not resolve computed imports, TypeScript aliases, development dependencies or external
packages; the synthetic host does not replace real host, browser or live-service validation.

## Internal monitoring source

[ADR 0027](0027-widget-internal-monitoring.md) defines the versioned host-owned monitoring contracts, their authenticated bounded readers and connection-free portability. No MON widget presentation is included in that foundation.

## Bounded connected widget queries (#315)

An integration registration may expose a named `prepareWidgetQuery` hook for an approved,
connection-bound page widget. The host resolves the saved connection, injects its existing
restricted GET transport and credentials server-side, and calls only the registered operation;
the browser and widget source never receive credentials or arbitrary destinations. The generic
widget-source route owns authentication, cache, deduplication and stale fallback.

Home Assistant's `entity-states` operation accepts at most 8 unique, validated entity IDs,
requests only their fixed `/api/states/<entity_id>` paths with at most 2 concurrent requests,
and projects only the ID, state and last-updated timestamp. Per-entity 404 and other failures are
isolated. Its 15-second cache is keyed by connection and ordered IDs. This does not change the
existing required single-entity connection setting or its legacy widget, and the token retains
the permissions of its Home Assistant account; the selected list is not an authorization boundary.
No general-purpose query, path, method, or transport capability is introduced.
