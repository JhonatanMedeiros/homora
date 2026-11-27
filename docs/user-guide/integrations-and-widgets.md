---
description: 'Connect Proxmox, Jellyfin, Pi-hole and other tools, and show live data with card and page widgets.'
---

# Integrations and widgets

Integrations show live information from the tools you already run, such as how many VMs are up in Proxmox or how your
DNS blocker is doing. They are **optional** and **read-only**: Homora queries them and never changes anything in them.

![The Integrations page](../screenshots/integrations.png)

Want to see every integration and widget first? Browse the [widget gallery](widget-gallery.md).

## The vocabulary

| Term            | Meaning                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Connection**  | A saved link to one external service: a name, an address and read-only credentials. Credentials are encrypted at rest. |
| **Widget**      | A small readout built from a connection's data, for example "VMs 3 / 5, CPU 23%".                                      |
| **Card widget** | A widget attached to a service card on the dashboard.                                                                  |
| **Page widget** | A widget placed on a dashboard page, independent of any card. The clock is a page widget that needs no connection.     |
| **Top bar**     | An optional strip above the dashboard with the date, the time and Proxmox CPU, memory and disk.                        |

## Supported integrations

| Integration           | What it reads                                                                                            | What it needs                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Proxmox VE**        | VMs and containers (running and total), CPU, memory and disk; optionally one node                        | Read-only API token, HTTPS                    |
| **Jellyfin**          | Server name and version                                                                                  | The public info endpoint, no credentials      |
| **Home Assistant**    | The state and last update of one entity, such as `sensor.temperature`                                    | Long-lived access token and entity ID, HTTPS  |
| **Uptime Kuma**       | The latest heartbeat of each monitor on a published status page                                          | A published status page                       |
| **AdGuard Home**      | Whether it is running and protection is on, and its version                                              | Basic-auth user, HTTPS                        |
| **Pi-hole (v6)**      | DNS queries, blocked queries and percentage, domains on the blocklist, protection state                  | Application password, HTTPS                   |
| **Speedtest Tracker** | The latest download, upload and ping                                                                     | Token with _Read Results_, HTTPS              |
| **Portainer**         | How many environments exist and how many are up or down                                                  | Access token, HTTPS                           |
| **NetBird**           | How many peers exist and how many are connected                                                          | Personal access token, HTTPS                  |
| **Tailscale**         | Devices, how many are connected and how many have an update available                                    | API access token, HTTPS                       |
| **Cloudflare**        | The number of zones and of active zones                                                                  | Token with _Zone Read_, HTTPS                 |
| **Healthchecks**      | How many scheduled-job checks exist and how many are up, late, down, paused or new                       | Read-only project API key, HTTPS              |
| **Coolify**           | Applications and services; links them to cards and proposes cards for review                             | Token with `read` only, HTTPS                 |
| **TP-Link Omada**     | One site: clients (Wi-Fi and wired), access points, switches and gateways, unresolved alerts in 24 hours | Client credential with the Viewer role, HTTPS |

::: warning Experimental
TP-Link Omada was built from API-only reports and has not been validated through Homora. Its Controller name must resolve
from the Homora container and match the certificate (attach a private CA to the connection if needed), and client
counts need client history enabled in the Controller.

Integrations were validated with mocks and sample responses; only Coolify (v4.7.5) and Pi-hole were partly checked
against real installations. Verify each connection in your environment. Exact limits and status are in the
[integration reference](../integrations.md#integration-status).
:::

## Add a connection

1. Open **Integrations** and press **Add connection**.
2. Pick the **type** and fill in the form: a name, the address and the credentials the integration needs.
   Use a read-only account or token wherever the service allows it.
3. If the service lives on your local network, enable **private network** access for the connection.
4. If it uses a private certificate authority, paste the CA's **public** certificate (PEM). Never paste a private key.
5. Choose **Save and test**, or open the connection's card later and choose **Test connection**.

Each connection card shows whether the last test worked or a short reason it did not (credentials rejected, service
error, timeout). Homora tests only when you ask and keeps the result until you edit the connection.

### Good to know

- Connections run from the **backend**, so the address must be reachable from where Homora runs. Inside a container,
  `localhost` is the container itself.
- **TLS validation always stays on.** Authenticated connections require HTTPS, and the host name or IP must be covered
  by the certificate. A custom CA applies only to that connection.
- Redirects are not followed, and special IP ranges are blocked by the same destination policy as service checks.
- Results are cached in memory for 30 seconds per connection. Refreshing from the interface forces an update, and a
  failure is never cached as a success.
- Rotating the encryption key is not supported. To rotate a credential, create a new token at the source, enter it on
  the connection, and revoke the old one.

## Card widgets

A card widget puts a connection's data directly on a service card.

1. On **Integrations**, open the **Widgets** tab.
2. Choose the widget type, the connection and the card to attach it to.
3. Save. The card now shows the readout under its name.

Each widget has its own loading and error state, so a failing connection never affects the other cards.

## Page widgets

Page widgets live on a dashboard page. They are blocks of its [Summary](dashboard.md#customize-the-summary), and on
Services they sit at the top of the right column on wide screens, above your groups on smaller ones.

1. On the Summary, press **Customize** and **Add widget**. On Services, press the dashed **Add widget** tile (on a
   phone, open **Organize** first).
2. Pick a widget from the searchable gallery (Homora's own, and those offered by your connections).
3. Set its options. A **clock** offers 12 or 24-hour format, seconds, the date and any time zone, with a live preview.
4. For a **note**, enter up to 4,000 characters of basic Markdown. An optional name appears above it. Paragraphs, line breaks, emphasis, lists and HTTP(S) links are supported; HTML, images, tables and code blocks are not rendered as such.
5. Save.

Each widget has a **⋯** menu to edit it (the type cannot change), move it, or remove it after confirmation. On a touch
screen the menu is always visible, and you can drag widgets to reorder them. Exports include local and internal monitoring widgets; connected
widgets appear as skipped in the import preview and must be recreated with a connection you choose.

## The top bar

Turn it on in **Settings → Top bar and shortcuts**. It shows the date, the time, and CPU, memory and disk usage from a
selected Proxmox connection. The clock can show seconds, use a 12 or 24-hour format and follow another time zone. The
choice is saved in the browser only.

## Docker discovery

Docker discovery also lives on the Integrations page. It suggests cards from container labels; see
[Docker discovery](docker-discovery.md).

## Writing your own

If your tool is missing, read [Writing an integration adapter](../adapters.md). It applies equally to people and AI
agents.

## Page widget reference

Widgets below need no connection unless noted. Their settings are included in exports and imports. Page and group
filters use **names**, so after renaming or removing one, edit the widget; an empty filter means all. For previews, see
the [widget gallery](widget-gallery.md).

### Countdown

Counts down to one named event. Enter its local date and time and an IANA time zone (or keep the browser's). It updates
each minute while the tab is visible. After the event it stays visible in muted text, or choose **Hide automatically**;
hidden countdowns stay saved under **Manage hidden countdowns**. Each event needs its own widget.

If a clock change makes the time ambiguous, the first occurrence is used; if the time does not exist, it moves forward by
the size of the change.

### Monthly calendar

Shows the current month. Choose the first weekday (or **Automatic**, which follows the interface language) and a time
zone. Use the arrows to change month and **Today** to return; the displayed month is not saved. Week numbers and events
are not shown. Normal and wide sizes.

### Homelab summary

Counts of online, degraded, offline, maintenance and not-measured monitors, from Homora's own monitoring. Restrict it by
groups and pages (standalone probes count only when no filter is set), and optionally hide the not-measured row; it still
counts toward the total and the bar. Select a state to filter Services. A stale or failed reading is marked.

### Recent incidents

Outages from monitoring, ongoing first, then newest. Choose 24 hours, 7 days or 30 days, up to 10 entries (5 by default), an
optional minimum duration and page and group filters (a card must match both). The period includes incidents that overlap
it. Each incident is its own row; the wide size adds the short failure reason. Dates use the browser's time zone. A failed
refresh keeps the last result, marked as outdated.

### Current problems

Keeps offline and slow (latency-degraded) monitors visible: oldest offline first, then degraded, each with its short reason
and how long it has lasted when known. Show 1–10 items (5 by default), optionally exclude latency degradation, and filter
by page and group. Maintenance, unmeasured and policy-blocked monitors are not problems; a quiet line counts the last two.
Standalone probes appear only when both filters are empty. Refreshes every minute without running a new check.

### RSS / Atom feed

Recent entries from an RSS 2.0 or Atom 1.0 feed: set the URL, an optional title and 1–10 entries (5 by default). Normal and
wide sizes.

The backend fetches the feed (8-second timeout, 512 KB limit, no redirects, cached in memory). By default only HTTPS and
public addresses are allowed, and URLs with embedded credentials are rejected. Enable **Allow HTTP and private/LAN network
addresses** only for trusted feeds on your network. Markup in titles is stripped, links are limited to `http:` and
`https:`, and a failed refresh keeps the cached entries marked as stale.

### Weather

Current conditions and today's high and low, with a 3-day forecast (normal) or up to 5 days plus feels-like, humidity,
wind and rain probability (wide). Units: °C or °F.

Pick the keyless **Open-Meteo** provider (default) or **OpenWeatherMap**, which needs an API key stored encrypted on the
server and never included in exports. Set the location by city search, coordinates with an optional label, or the browser
geolocation button (secure contexts only, never automatic). Requests go through the backend with a 10-minute cache; a
failed refresh keeps the last forecast marked as stale.

### Latency history

Choose a service card, a period (24 hours, 7 days or 30 days) and a size. The chart shows the median of successful checks
per interval; gaps mean no valid reading, and a short outage can hide inside an interval that also had successes. Only
checks kept up to 30 days and matching the current monitor settings appear. If a reading is stale (older than twice the
check interval) or the service cannot be measured, the widget labels the last valid reading with its time.

If the card is deleted, pick another. Exports keep the period and size but clear the service selection; select it again
after importing. Database backups keep it.

### Certificate expiry

Lists service cards that have a TLS check, earliest expiry first (up to five, with a count of the rest). The 7, 14, 30 or
60-day warning only affects the display, not monitoring or alerts. An unexpired certificate can still be invalid; a failed
check may show an earlier observation with its time, and an unknown expiry is never treated as expired. It performs no
extra checks.

### Maintenance schedule

Ongoing and upcoming maintenance windows in your browser's time zone. Choose a horizon of 24 hours, 7 days or 30 days, up to
10 rows, and page and group filters. Ongoing windows are included whenever they started. A failed refresh is shown
separately from an empty schedule, and a kept reading is marked outdated. Unfiltered results may include standalone probes.

### Public IP

Shows your public IPv4 or IPv6 address. It asks an outside service (**ipify** or **icanhazip**), so you must tick **Allow
external lookup requests** first; the request comes from the Homora backend, and the provider sees the server's address.
The address is masked by default (use the eye button to reveal it, or turn off masking) and can be copied.

### Domain expiration

Shows when up to 5 domains expire, as **registration** expiry (RDAP), which is separate from a TLS certificate. Set a
warning period from 1 to 365 days. Lookups run from the backend, and a registry that does not answer is shown as
unavailable.

### Home Assistant entities

Add **Home Assistant entities** as a page widget, choose a saved Home Assistant connection, and enter
1–8 entity IDs (one per line). The widget refreshes every 30 seconds; the backend caches each
connection-and-selection query for 15 seconds and issues one fixed `GET /api/states/<entity_id>` per
ID, with at most two requests in flight. Only the entity ID, state and last-updated timestamp are
returned; entity attributes, including location or camera data, are not sent to the browser. A 404
or other failure appears only on that entity's row. The existing connection field for the legacy
single-entity widget is unchanged. The token can still read whatever its Home Assistant account
allows, so selecting IDs limits requests but does not reduce token permissions. Real-service
validation is pending. The selected IDs are retained when exporting and importing widget
configuration; the connection is local to each installation and must be selected again after import.

### Healthchecks jobs

Add **Healthchecks jobs** as a page widget and select an existing Healthchecks connection. It lists up to 50 checks, with down and late checks first, followed by new, paused and up checks; an unrecognized state is shown as unknown. The row limit is configurable. Names and the last ping time are visible to the signed-in administrator. The reading time and stale or failed state are shown separately. A successful check does not verify that a backup can be restored. The connection requires a project read-only key. Live-service validation is pending.
