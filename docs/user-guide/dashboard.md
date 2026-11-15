# The dashboard

The dashboard (`/`) is the page you will use most. It shows your cards grouped into pages, a health summary and any
widgets you added.

![The dashboard in the dark theme](../screenshots/dashboard-dark.png)

## The health banner

The banner answers "is everything fine?" at a glance. When something is wrong it names the services and how long they
have been down. It also summarizes:

| Figure                    | Meaning                                                                          |
| ------------------------- | -------------------------------------------------------------------------------- |
| **Average uptime · 24 h** | Availability across the monitored services, and how many that is.                |
| **Incidents · 7 d**       | Outages opened in the last week, compared with the week before.                  |
| **Mean time to recover**  | Average outage length over 30 days, plus the longest stretch without an outage.  |
| **Availability target**   | Progress against a 99.9% target over 30 days, with the remaining "error budget". |

Services not authorized for private-network monitoring appear as _not monitored_, not as failures.

Under the headline, each service has a small window colored by state and named for screen readers. Click one to open
the service's details.

## Needs attention

When services are offline, **Needs attention** groups them by what they probably share: a stopped guest or offline host
(from a linked Proxmox connection), the same error starting within ten minutes, or an address that does not answer.
The wording always says _likely_: Homora only reads what it already knows and never names a fix.

The panel starts as one line (how many services are offline, and how many causes). **Show causes** opens the list; the
browser remembers your choice.

For each group you can **Acknowledge** it (it stays quiet until that incident ends, and a new incident speaks up
again) or **Mute 1 h**. Both can be undone from the toast or with **Show again**. This only quiets the dashboard:
checks, incidents and notifications do not change. Each action is recorded in the audit log.

## Status filters

On wide screens, the left rail has a **Views** list (**All**, **Offline**, **Degraded**, **Maintenance**) and a
**Groups** list showing each group's health. On smaller screens they become chips under the banner (or **Options** on
a phone). The numbers are live counts. **Degraded** means online but slower than the limit you set (see
[Services and monitoring](services-and-monitoring.md#alerts-and-states)).

## Alerts bell

The bell counts unread notifications about confirmed outages and recoveries of services and probes (a probe event
opens **Manage → Probes**). Open it to review history and mark one or all as read. Reading is independent of
acknowledging or muting an incident, and **Activity** stays available for auditing. The inbox keeps up to 90 days and
10,000 entries. See [Notifications and status page](notifications-and-status-page.md#in-app-notifications).

## Pages, groups and cards

- **Pages** are the tabs along the top, for example _Home_, _Media_ and _Lab_. Each shows how many of its services are
  down. The `⋯` button on the selected tab renames, moves or deletes it (a page with groups or widgets asks where they
  go first). Press `1` to `9` to switch pages. Manage pages in **Settings → Home and pages**: up to 12, with unique
  names.
- **Groups** organize cards inside a page. Choose one in the **Groups** list to filter to it. Each group has 1 to 6
  columns, so a short group can use two wide columns while a long one uses six.
- **Cards** show the icon, name, address, state, latency and availability for the selected period. A failing card is
  highlighted and says why it failed and since when.

## Layouts and views

Open **Display** to choose how cards look. The choice is saved in your browser; **Compact** is the default.

| Choice      | What you get                                                                                                                                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Compact** | A small tile per service: icon, name, host, state in words and a thin bar for the period. Healthy groups can collapse and groups with problems can come first (both in **Settings → Home and pages**). The `i` button opens the details drawer. |
| **List**    | A dense row per service. Best for many services.                                                                                                                                                                                                |
| **Cards**   | Larger cards with the description, the uptime bar and a **Details** link that opens the drawer.                                                                                                                                                 |
| **Group**   | Cards organized by your groups (the default).                                                                                                                                                                                                   |
| **Host**    | Cards organized by the machine or guest they run on, for services linked to a host.                                                                                                                                                             |
| **Map**     | Hosts and the services running on them. See [linking a card to a host](services-and-monitoring.md#where-a-service-runs-and-what-it-needs).                                                                                                      |

![Cards layout with descriptions and uptime bars](../screenshots/dashboard-cards.png)

**Host** lists services under the node and guest they run on and flags those that a failing dependency may affect.
**Map** shows the same relationships as boxes, and you can drag an unlinked service onto a guest.

![Host view](../screenshots/host-view.png)

![Service map](../screenshots/host-map.png)

**Display** also sets whether descriptions show and the uptime period (24 h, 7 d or 30 d); the same options are in
**Settings → Home and pages**.

### Details drawer

The `i` button on a tile, **Details** on a card, a window in the banner or a name in **Needs attention** opens a side
panel (a bottom sheet on a phone). It shows the state, **Open** and **Copy address**, the availability bar, latency,
recent incidents and a link to the full page. `Esc` closes it.

![The details drawer of a failing service](../screenshots/dashboard-drawer.png)

### Favorites

**Pin** a service from its drawer to show it in the **Pinned** row above the groups, on every page. **Favorites** in
the left rail shows only pinned services. Pins are included in export and import.

### Widget panel

On screens wider than 1440 px, a page's widgets sit in a panel on the right. **Hide widget panel** (left rail) moves
them to a row under the banner. A widget that cannot refresh keeps its last reading and says how old it is; a widget
whose connection is missing says so.

## Search: the command palette

Press `Ctrl K` (`⌘ K` on macOS) or `/` from anywhere.

![The command palette filtering services that are down](../screenshots/command-palette.png)

- Type part of a name, group, description or host. Matching tolerates accents and missing letters.
- Filter with prefixes: `status:down` (also `up`, `online`, `unknown`) and `group:Media` or `group:"Developer tools"`.
  Combine them with text, such as `status:down plex`.
- Sort by **Relevance**, **Name** or **Status**.
- `Enter` opens the service; `Shift Enter` jumps to its card.
- **Go to** lists settings pages and actions, such as Import / Export.
- Extra addresses of a service show under it while you search.

### Web search (optional)

Turn it on in **Settings → Top bar and shortcuts** to add "Search the web" to the palette. It is off by default.
Nothing is sent until you choose it, and then only the text after the prefix goes to the engine.

| Prefix  | Engine     | Prefix | Engine    |
| ------- | ---------- | ------ | --------- |
| `!g`    | Google     | `!w`   | Wikipedia |
| `!ddg`  | DuckDuckGo | `!gh`  | GitHub    |
| `!b`    | Brave      | `!yt`  | YouTube   |
| `!bing` | Bing       |        |           |

For example, `!w jellyfin`.

## Keyboard shortcuts

Press `?` to see the list in the app. Single-key shortcuts can be turned off in **Settings → Top bar and shortcuts**;
the two `Ctrl`/`⌘` shortcuts always work.

| Keys         | Action                            |
| ------------ | --------------------------------- |
| `Ctrl/⌘ K`   | Open or close the command palette |
| `/`          | Open the palette                  |
| `?`          | Show all shortcuts                |
| `g` then `h` | Go to the dashboard and services  |
| `g` then `p` | Show what is offline              |
| `g` then `i` | Go to Integrations                |
| `g` then `a` | Go to Agents                      |
| `g` then `t` | Go to Activity                    |
| `g` then `s` | Go to Settings                    |
| `n`          | Add a new service                 |
| `1` to `9`   | Switch to that page               |
| `Ctrl/⌘ B`   | Show or hide the sidebar          |

## Organize cards and groups

Press **Organize** on the Home toolbar. This is also where you add, edit and delete services and groups; there is no
separate list under Manage.

![Organize mode](../screenshots/organize-mode.png)

- **Drag** a row by its handle to reorder, or use the **up and down arrows** (they work from the keyboard).
- The **⋯** menu on a row moves a service to the top or to another group, edits it, or removes it after confirmation.
- **Add service** opens the new service form (as do `n` and the command palette).
- **New group** creates a group; the controls beside a group name move or rename it.
- Press **Done** when finished.

Everything you can do by dragging also works with buttons and menus.

## Widgets on the dashboard

Between the banner and your groups, the dashboard can show **page widgets**: a clock, or live readings from an
integration such as Proxmox. A page holds up to 12; at the limit, the **Add widget** tile says so and full pages are
disabled in **Move to page**.

The dashed **Add widget** tile opens a searchable gallery. Each widget has a **⋯** menu to edit it, move it earlier or
later, move it to another page or remove it, and you can drag widgets to reorder them. Widgets can also be attached
_inside_ a card. See [Integrations and widgets](integrations-and-widgets.md).

## Other addresses (Links)

A service can be reachable more than one way, such as through its domain and through its LAN IP when DNS is down. In
the service form, open **Other addresses** and add up to 10. Each can have:

- a name;
- a type: a colored label such as _LAN_ or _Admin_ that you create, rename, recolor or delete on the spot (types are
  shared by all services and saved immediately);
- its own **Open in** setting (new or same tab), otherwise the service's.

Services with extra addresses show a **Links** button on the card and in lists, with the main address first and a copy
button on each (a bottom sheet on a phone). Only the main address is monitored.

## Service details

Click **Details** or **Incidents and charts** on a card (or choose a service in the palette) to open its page at
`/services/<id>`.

![A service's detail page](../screenshots/service-detail.png)

It shows uptime for 24 hours and 7, 30 and 90 days with the change from the previous period, a latency chart with
median and p95 lines and incident markers, a 90-day heatmap, and a breakdown of why checks failed. **Schedule
maintenance** pauses checks for a planned window. See [Services and monitoring](services-and-monitoring.md) for how
the numbers are calculated.

## On a phone

The layout collapses to one column and the header keeps a single row. The Home has no bottom bar: search,
notifications and the theme are in the header, and **Manage** is in the avatar menu. In the management area, a
floating bottom bar shows icons (only the current item shows its name) and **More**, which opens a sheet with the rest
and a way back to the dashboard.

Background-image editing is only available on larger screens, and the service map points to the host list on narrow
screens.

<p align="center"><img src="../screenshots/mobile-dashboard.png" alt="The dashboard on a phone" width="260"></p>
