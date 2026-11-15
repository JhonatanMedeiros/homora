---
layout: home
title: Homora
titleTemplate: Documentation

hero:
  name: Homora
  text: A home for your homelab.
  tagline: A self-hosted dashboard to organize your services and see their health. Proxmox and AI agents are optional.
  actions:
    - theme: brand
      text: Get started
      link: /user-guide/getting-started
    - theme: alt
      text: Browse the guide
      link: /user-guide/README

features:
  - icon: { src: /icons/layout.svg }
    title: Organize
    details: Pages, groups and cards for every service, with brand icons and a command palette.
    link: /user-guide/dashboard
    linkText: The dashboard
  - icon: { src: /icons/activity.svg }
    title: Monitor
    details: Seven check types, incidents, uptime and alerts on Telegram, ntfy, Discord or webhooks.
    link: /user-guide/services-and-monitoring
    linkText: Services and monitoring
  - icon: { src: /icons/plug.svg }
    title: Integrate
    details: Show live data from your tools with integrations and widgets.
    link: /user-guide/integrations-and-widgets
    linkText: Integrations and widgets
  - icon: { src: /icons/container.svg }
    title: Discover
    details: Add Docker containers from labels, locally or through remote agents.
    link: /user-guide/docker-discovery
    linkText: Docker discovery
  - icon: { src: /icons/bot.svg }
    title: Delegate
    details: Let an AI agent propose changes with scoped tokens. You review every proposal.
    link: /user-guide/agents-and-mcp
    linkText: AI agents and MCP
  - icon: { src: /icons/shield.svg }
    title: Stay in control
    details: Two-step verification, passkeys, backups and a read-only public status page.
    link: /user-guide/accounts-and-security
    linkText: Accounts and security
---

<section class="home-section">

## Running in two minutes

```bash
git clone https://github.com/JhonatanMedeiros/homora.git
cd homora
docker compose up -d --build
```

Then open <http://localhost:8080> and create your administrator account. [Follow the full tour](user-guide/getting-started.md).

</section>

<section class="home-section">

## See it in action

Screenshots use synthetic data from a demo installation.

<div class="home-gallery">
<figure>

![Service details showing uptime, latency and incidents](screenshots/service-detail.png)

<figcaption>Investigate health and incidents. <a href="user-guide/services-and-monitoring.html">Monitoring</a></figcaption>
</figure>
<figure>

![The integrations page showing connected services](screenshots/integrations.png)

<figcaption>Bring your tools into Homora. <a href="user-guide/integrations-and-widgets.html">Integrations</a></figcaption>
</figure>
</div>

</section>

<section class="home-section">

## Find your path

<div class="home-paths">

[**New here** Install Homora and add a first service.](user-guide/getting-started.md)

[**Moving over** Import a configuration and back it up.](user-guide/import-export-backup.md)

[**Sharing with others** Deploy behind HTTPS and secure accounts.](user-guide/deployment.md)

[**Contributing** Set up the project and add an integration.](contributing.md)

</div>

Homora is in early development and meant for local access. The guides mark experimental behavior.

</section>
