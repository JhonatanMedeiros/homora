# Product Vision

Homora brings together services and useful environment information into a customizable dashboard. Users can organize their environment via the web UI or request changes through an MCP-connected agent. Proxmox is the first planned infrastructure integration, but does not limit the product's scope.

## Audience and Problems

People who self-host services need a central place to aggregate links, monitor availability, and configure integrations without manually editing multiple configuration files. An AI agent can reduce routine work, but must operate with explicit permissions and remain accountable for all changes.

## Core Experiences

1. Create and organize service groups and cards with name, URL, icon, and description.
2. View availability status, with last check timestamp and unknown status when reliable data is unavailable.
3. Connect Proxmox using read-only credentials and visualize available nodes, VMs, and containers.
4. Review card suggestions generated from inventory; discovered names and URLs are suggestions, not guaranteed facts.
5. Ask an agent to query configuration and propose a change; review and approve the proposal in the UI before it is applied.

## MVP

Responsive dashboard, editable groups and cards, search, availability checks, read-only Proxmox integration, MCP proposals for configuration changes, access authentication, and action audit history. The UI must remain fully usable without an agent and without Proxmox.

Outside MVP: restarting VMs, automated service installation, unrestricted network discovery, third-party plugins, multi-user support, native mobile app, and marketplace.

## Acceptance Criteria

- An authenticated user creates, edits, moves, and removes a card; data persists across restarts.
- Monitoring failures display unknown or unavailable status with last attempt timestamp, without locking the page.
- Proxmox credentials never appear in the browser, MCP responses, or logs; inventory uses a read-only account.
- The agent can query authorized data and create a proposal; changes only take effect after human approval tied to the exact proposal.
- Approved, rejected, and failed actions are logged without leaking secrets.
- UI works on small screens and with full keyboard navigation; an unavailable integration does not impede usage of other cards.

## Validation Metrics

Time to add the first service, number of steps to connect an integration, health check success rate, frequency of suggestion corrections, and clarity of proposals. Measurement is optional and local by default; no external telemetry is assumed.
