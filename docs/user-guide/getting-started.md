---
description: 'Install Homora with Docker, create your account, add a first service and get your first alert in about ten minutes.'
---

# Getting started

A ten-minute tour: install, create your account, add a first card and get your first alert. Nothing here needs Proxmox
or an AI agent.

## Before you begin

- **Docker with Compose** on a machine you control (a laptop, a mini PC, a NAS or a VM).
- A modern browser; the same interface works on a phone.

## 1. Install

```bash
git clone https://github.com/JhonatanMedeiros/homora.git
cd homora
docker compose up -d --build
```

Open <http://localhost:8080>. The port is bound to `127.0.0.1`, so only this machine can reach it, and your data lives in
the `homora-data` Docker volume.

> **Do the first setup from the machine itself.** Until the first administrator exists, anyone who can reach the port
> can create it. To reach Homora from other devices, use an HTTPS reverse proxy as described in
> [Deployment and upgrades](deployment.md); plain HTTP from other machines is refused by design.

## 2. Create the administrator account

On the first visit Homora asks for a name, an email and a password of at least 8 characters. The email is only your
sign-in name; Homora never sends email. Tick **Keep me signed in** to stay signed in for up to 30 days instead of 8 hours.

![Homora sign-in page](../screenshots/login.png)

## 3. Add your first service

1. Press **Add your first service** (or press `n` on the Home).
2. Fill in a **name**, the **URL** you open it at, and a **category** (the group; a new name creates it).
3. Pick an **icon**: Homora suggests the brand logo matching the name (such as `brand:jellyfin`), or use an emoji, a
   built-in icon like `lucide:server`, or an image URL.
4. If the service lives on your local network, open the **Access** tab and allow **private network** monitoring.
   Without it the card reads **Not monitored**.
5. Press **Save service**.

![The service form, Monitoring tab](../screenshots/service-form-monitoring.png)

Within a minute the card shows **Online**, **Offline** or **Waiting** with the latency of the last check. A redirect or
a login prompt counts as Online; a failing card says why and opens a **Details** panel.

> **Tip:** with a supported configuration file you can skip the typing: **Settings → Export and import** (see
> [Import, export and backup](import-export-backup.md)).

## 4. Know your way around

![The Homora dashboard](../screenshots/dashboard-dark.png)

| Where                     | What it is                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------- |
| **Summary** (`/`)         | What needs attention, health figures, pins and upcoming maintenance.                   |
| **Services**              | Your cards, grouped and organized in pages, as groups, hosts or a map.                 |
| **Organize** (Services)   | Edit, move and delete cards and groups.                                                |
| **Maintenance**           | Windows that are open or scheduled.                                                    |
| **Search** (`Ctrl K`)     | Jump to any card, filter by status or group, and reach any settings page.              |
| **Integrations**          | Connect Proxmox and other tools, attach widgets to cards, and set up Docker discovery. |
| **Agents**                | Create AI agent identities and review their proposals.                                 |
| **Activity**              | A log of sign-ins, proposals, approvals and settings changes.                          |
| **Settings**              | Appearance, pages, top bar, alerts, the public status page, and export or import.      |
| **Account** (avatar menu) | Password, two-step verification and passkeys.                                          |

On a computer these are in the rail on the left; on a phone, in the bottom bar and its **More** menu. The status pill in
the header summarizes health on every page.

The avatar menu also opens **What's new**, with release notes and whether a newer stable version exists. The server checks
GitHub when you sign in and every six hours (GitHub sees only its public IP address), and Homora works if the check fails.

Press `?` anywhere to see every keyboard shortcut.

## 5. Get alerted when something breaks

1. Go to **Settings → Alerts** and add a channel: Telegram, ntfy, Discord or a webhook.
2. Press **Send test** to confirm the message arrives.
3. Optionally, on a card's **Monitoring** tab, set how many failed checks open an incident, so a single blip does not wake you.

Details are in [Notifications and the public status page](notifications-and-status-page.md).

## Where to go next

- Learn the dashboard: [Dashboard](dashboard.md).
- Tune your checks: [Services and monitoring](services-and-monitoring.md).
- Show live data from Proxmox, Jellyfin and others: [Integrations and widgets](integrations-and-widgets.md).
- Let an agent help: [AI agents and MCP](agents-and-mcp.md).
- Make it look like yours: [Appearance and personalization](appearance.md).
- Protect your data: [Import, export and backup](import-export-backup.md) and [Accounts and security](accounts-and-security.md).
- Not sure where to start? Browse the [use cases](use-cases.md).

## Common questions

**Can I use Homora without Proxmox?** Yes. Proxmox, the other integrations and AI agents are all optional.

**A card says "Not monitored".** Local addresses are monitored only after you allow **private network** on that service;
loopback addresses such as `127.0.0.1` are always blocked.

**I forgot my password.** Run `pnpm auth:reset` on the server; see [Accounts and security](accounts-and-security.md).

**How do I update?** Back up, pull the new version and run `docker compose up -d --build`. See
[Deployment and upgrades](deployment.md#upgrade).

### Monitoring changes

In **Activity**, select **Show monitoring changes** to inspect recorded incident starts
and recoveries over the last 24 hours or 7 days. Times use your browser's time zone. Service links
open service details; select a probe incident to inspect its recorded start and end. The list shows at most 100 events
and indicates when it is truncated. The view shows when it was updated, offers a refresh button and warns when its result is
more than two minutes old (the warning is checked every 30 seconds). Incident records do not establish
complete historical coverage, so an empty list is not proof that nothing happened. This view does not infer a cause or include configuration changes,
certificate history, or recurrence.
