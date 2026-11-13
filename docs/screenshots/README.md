# Screenshots

The images in this folder are used by the [README](../../README.md) and the [user guide](../user-guide/README.md).

## What they show

Every screenshot comes from a **demo installation filled with synthetic data**: invented services on a private
network, mock servers that answer with a chosen status code and latency, a mock Proxmox connection and a scripted
agent proposal. The administrator "Alex Rivera", the status page title and the notification channel are fictional.
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

| File                           | Screen                                       |
| ------------------------------ | -------------------------------------------- |
| `dashboard-dark.png`           | Dashboard, dark theme (hero image)           |
| `dashboard-light.png`          | Dashboard, light theme                       |
| `dashboard-cards.png`          | Dashboard with the Cards layout              |
| `command-palette.png`          | Command palette filtering with `status:down` |
| `service-detail.png`           | A service's uptime, latency and incidents    |
| `service-form.png`             | Service form, Appearance tab                 |
| `service-form-monitoring.png`  | Service form, Monitoring tab                 |
| `service-form-connections.png` | Service form, Connections tab                |
| `manage-services.png`          | Services and groups                          |
| `organize-mode.png`            | Organize mode                                |
| `integrations.png`             | Integrations page                            |
| `agents.png`                   | Agents page with a pending proposal          |
| `proposal-review.png`          | A proposal's diff with Approve and Reject    |
| `proposal-review-mobile.png`   | The same review on a phone                   |
| `activity.png`                 | Activity log                                 |
| `account.png`                  | Account page                                 |
| `login.png`                    | Sign-in page                                 |
| `public-status.png`            | Public status page (anonymous view)          |
| `settings-appearance.png`      | Settings → Appearance                        |
| `settings-home.png`            | Settings → Home and pages                    |
| `settings-topbar.png`          | Settings → Top bar and shortcuts             |
| `settings-alerts.png`          | Settings → Alerts                            |
| `settings-public.png`          | Settings → Public status                     |
| `settings-backup.png`          | Settings → Export and import                 |
| `mobile-dashboard.png`         | Dashboard on a phone                         |

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
