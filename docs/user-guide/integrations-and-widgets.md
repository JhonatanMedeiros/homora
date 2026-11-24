---
description: 'Connect Proxmox, Jellyfin, Pi-hole and other tools, and show live data with card and page widgets.'
---

# Integrations and widgets

Integrations show live information from the tools you already run, such as how many VMs are up in Proxmox or how your
DNS blocker is doing. They are **optional** and **read-only**: Homora queries them and never changes anything in them.

![The Integrations page](../screenshots/integrations.png)

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
from the Homora container and match the certificate; client counts need client history enabled in the Controller.

The integrations were validated with mocks and documented sample responses. Coolify (v4.7.5) and Pi-hole were partly
checked against real installations. Verify each connection in your own environment. The authoritative table, with
exact limits and requirements, is the [integration reference](../integrations.md#integration-status).
:::

## Add a connection

1. Open **Manage → Integrations** and press **Add connection**.
2. Pick the **type** and fill in the form: a name, the address and the credentials the integration needs.
   Use a read-only account or token wherever the service allows it.
3. If the service lives on your local network, enable **private network** access for the connection.
4. If it uses a private certificate authority, paste the CA's **public** certificate (PEM). Never paste a private key.
5. Choose **Save and test**, or open the connection's card later and choose **Test connection**.

Each connection card shows whether the last test worked and, if not, a short reason (credentials rejected, service
error, timeout). The page summary counts connections that need attention. Homora tests only when you ask and keeps
the last result until you edit the connection.

### Good to know

- Connections run from the **backend**, so the address must be reachable from where Homora runs. Inside a container,
  `localhost` is the container itself.
- **TLS validation always stays on.** Authenticated connections require HTTPS, and the host name or IP must be covered
  by the certificate. A custom CA applies only to that connection.
- Redirects are not followed, and special IP ranges are blocked by the same destination policy as service checks.
- Results are cached in memory for 30 seconds per connection. Refreshing from the interface forces an update, and a
  failure is never cached as a success.
- Use separate named connections for independent clusters or servers.
- Rotating the encryption key is not supported. To rotate a credential, create a new token at the source, enter it on
  the connection, and revoke the old one.

## Card widgets

A card widget puts a connection's data directly on a service card.

1. On **Manage → Integrations**, open the **Widgets** tab.
2. Choose the widget type, the connection and the card to attach it to.
3. Save. The card now shows the readout under its name.

Each widget has its own loading and error state, so a failing connection never affects the other cards.

## Page widgets

Page widgets live on a dashboard page, above your groups.

1. On the dashboard, press the dashed **Add widget** tile.
2. Pick a widget from the searchable gallery (Homora's own, and those offered by your connections).
3. Set its options. A **clock** offers 12 or 24-hour format, seconds, the date and any time zone, with a live preview.
4. For a **note**, enter up to 4,000 characters of basic Markdown. An optional name appears above it. Paragraphs, line breaks, emphasis, lists and HTTP(S) links are supported; HTML, images, tables and code blocks are not rendered as such.
5. Save.

Each widget has a **⋯** menu to edit it (the type cannot change), move it, or remove it after confirmation. On a touch
screen the menu is always visible, and you can drag widgets to reorder them. Exports include local and internal monitoring widgets; connected
widgets appear as skipped in the import preview and must be recreated with a connection you choose.

## The top bar

Turn the optional top bar on in **Settings → Top bar and shortcuts**. It shows the date, the time, and CPU, memory and
disk usage from a selected Proxmox connection. The clock can show seconds, use a 12 or 24-hour format and follow another
time zone. The choice is saved in the browser only.

## Docker discovery

Docker discovery also lives on the Integrations page. It suggests cards from container labels, on this host or on
remote hosts. See [Docker discovery](docker-discovery.md).

## Writing your own

If your tool is missing, read [Writing an integration adapter](../adapters.md). The guide applies equally to people and
AI agents.

### Countdown

Add a **Countdown** page widget for one named event. Enter its local date and time and choose an IANA time zone, or leave the browser zone selected. The countdown updates each minute while the tab is visible. After the event, it stays visible in muted text by default; choose **Hide automatically** to hide it. Hidden widgets remain saved; use **Manage hidden countdowns** to edit or remove them. Each event needs its own widget.

When a clock change makes the entered time ambiguous, the first occurrence is used. If the time does not exist, it moves forward by the size of the clock change. The full resolved date and time remains visible; the timer does not announce every minute. Countdowns are included in exports and imports without a connection.

### Monthly calendar

Add a **Calendar** page widget to see the current month without a connection. Choose the first day of the week or **Automatic**, which follows the interface locale, and choose an IANA time zone or the browser time zone. Navigate between months and use **Today** to return. The displayed month is temporary; reloading returns to the current month. The date updates at midnight while visible and when returning to a hidden tab. Week numbers and events are not shown. The calendar supports normal and wide sizes; its configuration is included in exports and imports.

Add **Homelab summary** to see current counts for online, degraded, offline, maintenance and not measured monitors. It uses Homora's internal monitoring and does not need a connection. Choose groups and pages to restrict the summary; leaving a selection empty includes all. Standalone probes are included when no groups or pages are selected. You can hide the not measured row; its count still contributes to the total and the bar. Select a state to filter Home. Outside Home the counts are informational. A stale or failed reading is identified in the widget. Group and page selections use names, so a name absent after import matches nothing.

### Recent incidents

Add **Recent incidents** to see monitoring outages, newest first, with ongoing incidents first. Choose 24 hours, 7 days or 30 days, up to 10 entries (5 by default), an optional minimum duration and optional page and group filters. Selecting both filters requires a match in both; select none to include all, including standalone probes. Clicking a service opens its drawer; a standalone probe opens the probes page. The wide size includes the monitor's short failure reason; the rail and small screens use the normal presentation. Each incident is a separate row, even when several belong to one service. Dates use the browser's time zone.

The period includes incidents that overlap it, including an older ongoing incident. Incident rows currently have no automatic age pruning, but monitoring may not have existed for the entire selected period. Data refreshes every minute; a failed refresh retains the last result marked as outdated. Filters use names so they survive export and import; after renaming or removing a page or group, edit the widget's filters. This widget and its configuration are portable and do not need a connection.

### Current problems

Add **Current problems** to keep offline and latency-degraded monitors visible. It shows the oldest offline problems first, then degraded monitors, with the monitor's short reason and the time since an incident began when known. Latency degradation shows when it was first observed during the current server run; after a restart its earlier duration is unknown. Choose 1–10 items (five by default), optionally exclude latency degradation, and select pages and groups. An empty selection means all; when both are selected, a card must match both. Standalone probes have no group or page, so they appear only when both selections are empty. Open a card's row for its details; a probe opens probe management.

Maintenance and unmeasured or policy-blocked monitors are not problems; a quiet line counts the latter two. The widget shows how many results are displayed when more exist, reports stale readings and keeps a previous reading if refresh fails. It refreshes once a minute without running a new check. Each widget has its own error state. It needs no connection and is included in configuration exports. Scope selections use page and group names so they can move between installations; after renaming one, update the widget selection.

### RSS / Atom feed

Add **RSS / Atom feed** to follow recent entries from an RSS 2.0 or Atom 1.0 feed directly on a dashboard page. Configure the feed URL, an optional display title, and how many entries to show (1–10, five by default). It supports normal and wide sizes and is included in configuration exports and imports without a connection.

Feeds are fetched exclusively through the backend with an 8-second timeout, a 512 KB response limit, no redirects, and in-memory caching. By default, only HTTPS and public network addresses are allowed, and URLs with embedded credentials (`user:pass@`) are rejected. Enable **Allow HTTP and private/LAN network addresses** only for trusted feeds on your local network. Markup in feed titles is stripped to plain text, entry links are restricted to `http:` and `https:`, and failed refreshes retain the last cached entries marked as stale.

### Weather

Add **Weather** to display current conditions (temperature, condition, and today's high/low) and a short forecast on a dashboard page. It supports `normal` (3-day forecast) and `wide` (up to 5-day forecast plus feels-like temperature, humidity, wind speed, and precipitation probability) sizes, as well as `°C (Metric)` and `°F (Imperial)` units.

Select between the keyless **Open-Meteo** provider (default) or **OpenWeatherMap** (requires an API key, which is stored encrypted on the server and never included in page configuration or exports). Configure the location via backend city search, manual coordinates and optional display label, or the on-demand browser geolocation button (available only in secure contexts such as `https:` or `localhost` and never triggered automatically on load). Weather requests run through the backend with a 10-minute in-memory cache, and failed refreshes retain the last cached forecast marked as stale.

### Service latency history

Add **Latency history** and select a service card. Choose 24 hours, 7 days or 30 days and a normal or wide size. The chart shows the median of successful checks in each interval; gaps mean no valid reading was recorded. A short outage can be hidden inside an interval that also contains successful checks. Only raw checks retained for up to 30 days and matching the current monitor configuration are shown.

When a reading is stale or the service cannot be measured, the widget labels the last valid reading and its time rather than calling it current. A check is stale after more than twice its configured interval. If the card is deleted, select another card explicitly. Configuration export preserves the period and size but clears the local service selection; select it again after import. Database backups preserve the selection.

### Certificate expiry

The **Certificate expiry** page widget lists service cards configured with a TLS check, earliest expiry first. It shows up to five and reports additional matches. The 7, 14, 30 or 60 day warning is a display setting; it does not change monitoring or alerts. An unexpired certificate can still be invalid. A failed check may show an earlier observation, labeled with its time; unknown expiry is never treated as expired. Observations are retained for up to 30 days and only matched to the current check configuration. The widget does not perform additional checks.

Page and group filters are optional and use names for portability. If a selected name is removed or renamed, edit the widget: it will not expand the selection automatically. A failed refresh keeps the last result marked as outdated. Select a row to open service details.
