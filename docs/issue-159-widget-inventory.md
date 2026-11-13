# Widget inventory for issue #159

This document records the existing behavior prior to migration. It does not describe an
implemented widget SDK nor does it alter the interpretation of stored data.

## Integration presentations

The integration catalog registers twelve types. Proxmox, Coolify, and Pi-hole provide code-based
presentations; AdGuard Home, Cloudflare, Home Assistant, Jellyfin, NetBird, Portainer, Speedtest
Tracker, Tailscale, and Uptime Kuma use `display` in manifests. Definitions, translations,
fixtures, and contract tests remain under their respective directories in
`packages/integrations/src/integrations`. The generated catalog explicitly registers the three
code-based factories; `createWidgetRenderer` resolves both them and manifests. The current
common output is a list of labels and values, and a summary for data visualization.
Invalid data yields `null`; remote text is never interpreted as HTML.

| Surface                   | Source and configuration                                                                                        | Updates and states                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service card and list     | `integration_widgets` with `service_id`; required connection, custom name and type                              | List and reads every 60 s; one read per connection in each cycle. Loading, error, invalid data, and ready data are isolated per widget. Failure to list leaves cards without widgets. |
| Integrations, Widgets tab | The same rows, including `service_id = NULL`; connection chosen on creation and fixed on edit                   | On-demand data query, translated summary or invalid data indicator. Card absence merely signifies lack of association with a card.                                                    |
| Top bar: telemetry        | Browser-selected connection with `systemTelemetry` capability; without selection, uses the first capable widget | Query every 60 s; loading, no connection, error, node unavailable, and ready data. Only displays recognized CPU, memory, and disk statistics.                                         |
| Top bar: clock            | Browser clock and time zone, with local preferences for format, time zone, date, and seconds                    | Update aligned to next second or minute; `Intl` formats time, date, and zone. An unsupported stored time zone falls back to the browser's time zone. Does not depend on a connection. |
| Top bar settings          | Same local preferences and connection selection                                                                 | Preview reuses the clock component; options remain independent in each browser.                                                                                                       |

Connection reads are mediated by the backend, and their observation cache has a 30 s TTL;
failures are not cached. The host maintains credentials and restricted transport. The fact that two
results are lists of statistics does not make them interchangeable sources: for example,
the top bar depends on semantic CPU, memory, and disk identifiers.

## Compatibility to preserve

- IDs, names, types, connections, and associations of existing rows must retain their meaning.
  Specifically, do not convert cardless rows into page widgets.
- The API and MCP operate on `integration_widgets`; pending proposals and their stale-state
  checks use this data. Any representation change must preserve these reads and human review.
- Top bar preferences belong to the browser, not the shared database. Do not silently
  create page instances from them.
- Proxmox results may indicate node unavailability and accept legacy responses without disk;
  Coolify omits optional zero counts. These rules remain in integrations.
- The future contract must separate configuration, localization, and source, validate source
  compatibility explicitly, and preserve translation, read batching, and failure isolation.
  The inventory does not yet choose a persisted representation nor authorize direct network access.

## Pending work

Define and record the ADR and contracts, implement the SDK and page instances, migrate
presentations and the top bar, handle transfer and compatibility, and run the integration
and browser validations required by the issue. No implementation criteria for the issue are
considered complete by this inventory alone.
