---
description: 'Task-by-task guides for using, running and securing Homora.'
---

# Homora user guide

Everything you can do with Homora, explained task by task. The project [README](../../README.md) is the
showcase; this guide is the manual.

> Homora is in early development. Where a feature is experimental or unvalidated, the guide says so. The screenshots
> use a demo installation with synthetic data ([how they are made](../screenshots/README.md)).

## Start here

| If you want to...                            | Read                                  |
| -------------------------------------------- | ------------------------------------- |
| Install Homora and add your first card       | [Getting started](getting-started.md) |
| Find a step-by-step recipe for a common goal | [Use cases](use-cases.md)             |
| Understand a word used in the app            | The [glossary](../../GLOSSARY.md)     |

## Using Homora

| Guide                                                                        | Topics                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [The dashboard](dashboard.md)                                                | Health banner, pages, groups, layouts, command palette, shortcuts, organize mode, details           |
| [Services and monitoring](services-and-monitoring.md)                        | Service form, seven check types, thresholds, incidents, uptime, maintenance, hosts and dependencies |
| [Notifications and the public status page](notifications-and-status-page.md) | Telegram, ntfy, Discord, webhooks, and the optional read-only status page                           |
| [Integrations and widgets](integrations-and-widgets.md)                      | Connections, supported integrations, card widgets, page widgets, top bar                            |
| [Docker discovery](docker-discovery.md)                                      | Container labels, remote agents, restricted Docker proxy, troubleshooting                           |
| [AI agents and MCP](agents-and-mcp.md)                                       | Agent tokens, scopes, proposals, review, stdio and HTTP setup                                       |
| [Appearance and personalization](appearance.md)                              | Theme, language, accent, backgrounds, custom CSS, safe mode, pages                                  |

## Running Homora

| Guide                                                | Topics                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| [Deployment and upgrades](deployment.md)             | Docker Compose, HTTPS reverse proxy, tested scenarios, upgrading           |
| [Import, export and backup](import-export-backup.md) | Configuration import, YAML and JSON export, backup and restore             |
| [Accounts and security](accounts-and-security.md)    | Sessions, two-step verification, passkeys, password reset, secret rotation |

## Reference

These documents describe how Homora is built and why. They are written for contributors, but useful to anyone
who wants the details.

- [Product vision](../product.md) · [Architecture and security](../architecture.md) · [Engineering standards](../standards.md)
- [Integration reference](../integrations.md) · [Writing an integration adapter](../adapters.md)
- [Agent capability inventory](../agent-capabilities.md) · [Agent walkthrough](../agent-demo.md)
- [Decision records](../decisions) · [Strategy](../strategy.md) · [Evolution plan](../evolution.md)

## Conventions

- **Bold** is a label you can click, such as **Settings → Alerts**. `Code` is something you type or a file name.
- Shortcuts use `Ctrl`; on macOS use `⌘`.
- Commands starting with `pnpm` run in a repository checkout. With Docker Compose, use `docker compose exec backend …`.
