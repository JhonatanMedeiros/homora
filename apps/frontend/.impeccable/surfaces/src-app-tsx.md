---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Surface brief: Homora (entire app)

Mode: Operate. Services, Connections, and Agents, plus the access screen.

## Audience, task, and constraints
Anyone maintaining a homelab and opening services daily; occasionally organizes, connects integrations, and reviews agent proposals. Main task: open a service in one click and check if it is online. English and pt-BR, full keyboard navigation, small screens, light and dark theme, shadcn/ui (radix base) over Tailwind v4 with all elements as components.

## Direction

The visual system is "Lamplight", recorded in the root [DESIGN.md](../../../../DESIGN.md); that file is the authority for
color, type, shapes, layout and components. This brief only records what the surface is for.

- The user sees within seconds what is online, opens any service in one click and spots what needs attention.
- Services come first at every width; probes and widgets follow them on small screens.
- Status is always paired with words or a shape, never color alone.
- Agent proposals appear as reviewable diffs with explicit decisions.
