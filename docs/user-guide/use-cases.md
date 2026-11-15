---
description: 'Step-by-step recipes for common homelab goals: bookmarks, alerts, status pages, Proxmox, Docker, AI agents and more.'
---

# Use cases

Practical recipes for common homelab goals. Each one lists the steps and links to the guide with the details.

## Replace a wall of bookmarks

**Goal:** one page that opens everything, with search.

1. Add your services with **Organize → Add service** on the Home, or import an existing supported configuration file from
   **Settings → Export and import** ([guide](import-export-backup.md)).
2. Split them into **pages** (for example _Home_, _Media_, _Lab_) in **Settings → Home and pages**, and into
   **groups** by purpose.
3. Give each card a brand icon: type the name and accept the suggested logo.
4. Press `Ctrl K` (or `/`) from anywhere to jump to a service by name, group or host.

## Know when something breaks before your family does

**Goal:** a phone notification when a service goes down or comes back.

1. In **Settings → Alerts**, add an **ntfy**, **Telegram** or **Discord** channel and press **Send test**.
2. For flaky services, set **Failures before it counts as down** to 2 or 3 on the card's Monitoring tab, so a single
   blip stays quiet ([guide](services-and-monitoring.md#alerts-and-states)).
3. For services that return 200 even when broken, use a **Keyword** or **JSON** check.
4. For HTTPS services, add a **TLS certificate** check and hear about expiry two weeks ahead.

See [Notifications and the public status page](notifications-and-status-page.md).

## Give family or teammates a status page

**Goal:** a link people can open to see whether Plex or Nextcloud is up, without signing in.

1. In **Settings → Public status**, enable the page, set a title and a short description, and review the preview.
2. On each service you want visible, turn on **Show on the public status page** (Access tab).
3. Share the address, for example `https://status.example.home/status`, from behind your HTTPS reverse proxy.

Visitors see only the service name, group, state, the last check time and uptime, never URLs, latency or reasons. Keep it
behind a private network or a separate hostname; public exposure of Homora itself is not supported
([Deployment and upgrades](deployment.md)).

## Keep a Proxmox cluster in view

**Goal:** see VM counts and load, and know which services live on which guest.

1. In **Manage → Integrations**, add a **Proxmox VE** connection with a read-only token and **Save and test**.
2. Add a **Proxmox widget** to the Proxmox card, or a page widget to a dashboard page. Optionally show the top bar.
3. Link cards to their guests: use **Suggested hosts**, or the **Connections** tab of each card.
4. Switch to the **Host** and **Map** views to see what is affected when a node goes down.

See [Integrations and widgets](integrations-and-widgets.md) and
[Where a service runs and what it needs](services-and-monitoring.md#where-a-service-runs-and-what-it-needs).

## Add everything you already run in Docker

**Goal:** cards for every container, without typing.

1. Add labels to your containers: `homora.url` is the only required one (Homepage's `homepage.href` also works).
2. Enable discovery with the restricted Docker proxy, or run the small agent on each remote Docker host.
3. Review the suggestions in **Integrations → Docker discovery** and confirm the ones you want.

See [Docker discovery](docker-discovery.md).

## Let an AI assistant tidy your dashboard

**Goal:** ask an agent to organize groups or add cards, with you in control.

1. In **Manage → Agents**, create an agent with only the scopes it needs, for example `services:read` and
   `proposals:create`. Copy the token once.
2. Press **Connect** and copy the ready-made setup for Claude Code, Codex, Claude Desktop, Cursor or VS Code.
3. Ask the agent for a change. It appears under **Agents → Proposals** with the exact diff and a countdown.
4. **Approve and apply** or **Reject**. Nothing changes until you approve, and everything is in the Activity log.
5. Revoke the token when you are done; it stops the agent's very next call.

See [AI agents and MCP](agents-and-mcp.md) and the [ten-minute walkthrough](../agent-demo.md).

## Plan maintenance without ruining your numbers

**Goal:** swap a disk without a red incident and a bad uptime figure.

1. Open the service's detail page and press **Schedule maintenance**.
2. Choose the start, the end (up to 30 days) and a note such as "Disk swap".
3. During the window checks pause and the period is ignored by uptime, incidents and alerts.

## Move to a new machine

**Goal:** restore your dashboard, history and connections elsewhere.

1. Make a [backup](import-export-backup.md#backup-and-restore): the database, the `.key` file and the session secret.
2. Install Homora on the new machine and restore the backup into a new database file.
3. Sign in, test your connections and confirm that checks resume.

## Share a layout without sharing secrets

**Goal:** give a friend your groups and cards.

1. Download your configuration as **YAML** or **JSON** from **Settings → Export and import**. It contains no passwords,
   tokens, connections or IDs.
2. Review the file before sending it: it can include page widget names and connection names.
3. Your friend imports it with a preview that writes nothing until they confirm. Import only adds; it never overwrites.
