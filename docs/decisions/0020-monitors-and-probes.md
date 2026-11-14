# ADR 0020: Monitors separate from dashboard cards, and probes

**Status:** Accepted.

## Context

Everything Homora monitored was a service, and a service was a dashboard card. To stop using Uptime
Kuma, targets that have no card (the internet connection, an internal DNS name, a TCP port) had to
be added as cards, which put monitoring plumbing on the Home and mixed what is monitored with how it
is shown.

## Decision

- Split the old `services` table in two with the same ids. `monitors` holds what is monitored: name,
  check type, interval, expected status, path, check address, match text, private-network permission
  and the public status flag. `services` keeps only the card: URL, alias, group, description, icon,
  position, open target and host link. `services.id` references `monitors.id` and cascades.
- A **probe** is a monitor without a card. Its address is `monitors.check_url`, always an
  `http(s)://host[:port]` URL (a TCP probe of port 8080 is `http://host:8080`), and it supports every
  check type.
- Everything that records or reports health (observations, history, rollups, incidents,
  maintenance, notification state, alert settings, dependencies, acknowledgements, public status)
  references `monitors`. Card-only data (links, favorites, tags, resource links, widgets, dismissed
  suggestions) references `services`.
- Two SQL views carry the read side. `service_cards` is the card joined with its monitor in the shape
  `services` used to have; `monitor_targets` is what the monitoring engine reads, with the address
  resolved as the card URL, unless the monitor sets `check_url`, or the probe's `check_url`. API
  shapes, configuration hashes and monitoring signatures are therefore unchanged, and stored
  history stays attached to the same ids.
- Deleting a card deletes its monitor and history, as before. Deleting a probe does the same.
  Removing only a card is not offered; a probe cannot be edited or deleted through the card API.
- The public status page lists a shared probe under **Connectivity**, before the groups of cards. The group name is not translated.

## Migration

`0040_monitors_and_probes` renames `services` to `monitors` (SQLite rewrites child foreign keys to
follow the rename), creates the new `services` from it, rebuilds `monitors` without the card columns
and rebuilds the six card-only children so they reference the new table. The runner now switches
`PRAGMA foreign_keys` off outside the migration transaction (the pragma is a no-op inside one),
compares `foreign_key_check` before and after, and rolls back if a migration leaves orphans. The
migration test keeps every id, row and relation.

## Consequences

- No new dependency.
- Probes are not part of configuration export/import, agent proposals or MCP tools in this change;
  they are managed in the web UI. Extending those boundaries is a separate decision.
- Probes use the default alert settings; per-probe alert settings use the existing endpoints and have
  no screen yet.
- Retiring Uptime Kuma still needs a cutover plan (run both, compare, switch notifications). This
  change only makes the targets representable.
