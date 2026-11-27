# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Self-hosting and homelab enthusiasts in an open source project: people who maintain
their own services and want to gather them in one place. They use Homora every day
to open services and see if they are running, and occasionally to organize,
connect integrations, or review proposals from an agent. No prior knowledge of
the product is assumed; first use must work without a manual.
Local access, single administrator account.

## Product Purpose

Bring together services and environment information in a customizable dashboard, useful
without Proxmox and without AI agents. Success: quickly register the first service,
open any service in one click, and know if it is available.

## Positioning

A self-hosted homepage where an AI agent only alters configuration through
proposals that a human reviews and approves, with explicit permissions and audit
logging.

## Operating Context

Browser on desktop and mobile, local network (HTTP on loopback). Current
integrations: read-only Proxmox and experimental read connections. MCP supports local stdio and HTTP, with scoped reads and human-reviewed proposals.

## Capabilities and Constraints

- Service groups and cards (name, URL, icon, description), search, ordering.
- Availability status: available, unavailable, or unknown, with
  timestamp of the last attempt.
- Agent proposals approved or rejected via the UI; credentials never
  appear in the browser.
- Interface in English and Brazilian Portuguese, fully usable with keyboard and on small screens.
- Outside MVP: restarting VMs, multi-user support, native app, third-party plugins.

## Brand Commitments

Name: Homora. Tone requested by maintainer: warm and personal, rather than a cold
administrative panel. Existing light and dark themes must continue.

## Evidence on Hand

Docs in `docs/`. There are no testimonials, customers, or metrics; do not invent them.

## Product Principles

1. Using comes before managing: opening services is the primary path. The Home opens with a health summary, pinned
   services stay one click away there, and Services holds the cards.
2. Honest status: unknown is displayed as unknown.
3. Human in control: no agent changes configuration without approval.
4. Works out of the box: without Proxmox, without agent, without manual.

## Accessibility & Inclusion

Full keyboard navigation, visible focus rings, 44px touch targets, minimum
AA contrast, respect for `prefers-reduced-motion`, status never indicated by color alone.
