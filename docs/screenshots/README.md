# Screenshots

The images in this folder are used by the [README](../../README.md) and the [user guide](../user-guide/README.md).

## What they show

Every screenshot comes from a **demo installation filled with synthetic data**: invented services on a private
network, mock servers that answer with a chosen status code and latency, a mock Proxmox connection and a scripted
agent proposal. Addresses shown are example addresses (`192.168.10.x`); the capture script rewrites the real test address in API
responses before the page renders. The Proxmox nodes and guests on the Host view and map are a fictional inventory
returned in place of the mock connection's. The administrator "Alex Rivera", the status page title and the notification channel are fictional.
No real service, account or credential appears. Treat the numbers as an illustration, not a benchmark.

Two parts of the history are generated for illustration, because a fresh installation has none: the 14 days of check
results and the 90-day hourly counts behind the uptime figures, heatmaps and incident log.

## Conventions

| Item     | Choice                                                                           |
| -------- | -------------------------------------------------------------------------------- |
| Viewport | Desktop 1440 × 900 (some pages 1440 × 1000); phone 390 × 844 at 2× pixel density |
| Theme    | Dark by default; `dashboard-light.png` shows the light theme                     |
| Language | English                                                                          |
| Format   | PNG, no browser chrome                                                           |
| Naming   | `kebab-case`, named after the screen, for example `service-detail.png`           |

## Files

| File                               | Screen                                                         |
| ---------------------------------- | -------------------------------------------------------------- |
| `dashboard-dark.png`               | Home summary, dark theme (hero image)                          |
| `dashboard-light.png`              | Services, light theme                                          |
| `dashboard-cards.png`              | Services with the Cards layout                                 |
| `dashboard-drawer.png`             | Details drawer of a failing service                            |
| `command-palette.png`              | Command palette filtering with `status:down`                   |
| `maintenance.png`                  | Maintenance view: open and scheduled windows                   |
| `service-detail.png`               | A service's uptime, latency and incidents                      |
| `service-form.png`                 | Service form, Appearance tab                                   |
| `service-form-monitoring.png`      | Service form, Monitoring tab                                   |
| `service-form-connections.png`     | Service form, Connections tab                                  |
| `organize-mode.png`                | Organize mode                                                  |
| `host-view.png`                    | Host view with a service that may be affected                  |
| `host-map.png`                     | Service map of nodes, guests and services                      |
| `host-map-problem.png`             | The map filtered to problems, with a failing service's details |
| `integrations.png`                 | Integrations page                                              |
| `agents.png`                       | Agents page with a pending proposal                            |
| `proposal-review.png`              | A proposal's diff with Approve and Reject                      |
| `proposal-review-mobile.png`       | The same review on a phone                                     |
| `activity.png`                     | Activity log                                                   |
| `account.png`                      | Account page                                                   |
| `login.png`                        | Sign-in page                                                   |
| `public-status.png`                | Public status page (anonymous view)                            |
| `settings-appearance.png`          | Settings → Appearance                                          |
| `settings-home.png`                | Settings → Home and pages                                      |
| `settings-topbar.png`              | Settings → Top bar and shortcuts                               |
| `settings-alerts.png`              | Settings → Alerts                                              |
| `settings-public.png`              | Settings → Public status                                       |
| `settings-backup.png`              | Settings → Export and import                                   |
| `mobile-dashboard.png`             | Home summary on phone                                          |
| `widgets-gallery-integrations.png` | Gallery of integration widgets                                 |
| `widgets-gallery-local.png`        | Gallery of page widgets that need no connection                |
| `widgets-gallery-monitoring.png`   | Gallery of monitoring widgets                                  |
| `widgets/<name>.png`               | One image per widget (32), for the widget gallery page         |

## How to refresh them

When the interface changes, retake the affected screens so the documentation does not drift:

1. Start a development build with an empty database: `pnpm build`, then `pnpm dev` (the backend runs with
   `HOMORA_DEV_MOCKS=true`, which provides the mock Proxmox connection).
2. Create the administrator account and import a Homora configuration file whose services point at small local
   HTTP servers on a private address, with **allow private network** set (`allowPrivate: true`). Let those servers
   answer with different status codes and latencies, leave one port closed and return a 5xx on another, so the
   dashboard shows both online and failing cards.
3. Add the page widgets, the notification channel and an agent with a pending proposal through the interface or the
   API, and enable the public status page for a few services.
4. Capture each screen with a headless browser at the sizes above, signed in (except the sign-in and status pages).
5. Look at every image before committing it, and make sure it shows no real address, name or secret.

Keep the images small: each should stay well under 250 KB.

## The widget images

The widget gallery uses extra images made from a second demo setup, on top of the one above:

- One connection per integration, added with a fictional `*.home.example` address and no credentials. The capture
  replaced each connection's data response with a hand-written example (for instance 18,423 DNS queries for Pi-hole),
  so no real service is contacted. Proxmox, Uptime Kuma and Coolify use the demo data built into the development
  server.
- The news feed and public IP responses were replaced the same way. The address is `203.0.113.42`, reserved for
  documentation. The weather and domain-expiry widgets showed live data for a chosen place and for `example.com`
  and `example.org`; retake them if you prefer fully offline captures.
- The latency and availability history of the sample services is synthetic, like the history above.
- Widgets were placed on four demo pages (integrations, services, local widgets and monitoring), at most 12 per page.
  Each page was captured in dark theme at 1440 × 2600 and 2× density with the widget panel open, then every widget
  was cropped from that image. The galleries tile the crops on a dark background. Take one capture per page rather
  than one per widget: capturing a single element made the page reload its widgets into the loading state.
