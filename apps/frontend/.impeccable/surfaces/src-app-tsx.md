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

## Direction contract

THESIS: Everything in Homora is labeled, like a rack organized at home: label-maker tape is the signature. Rejects generic dashboards of identical cards with plain status dots.
OWN-WORLD: warm graphite (oklch ~0.2, hue 70), graphite top bar in both themes, warm paper content in light theme and graphite in dark theme; label tape yellow (oklch ~0.88 0.17 95) only for primary action fills and focus rings, never as text color; green/red/gray status always paired with text and icon. Barlow Semi Condensed for labels and titles, Figtree in body copy, JetBrains Mono for URLs and data. Radius 6-8px, no decorative shadows.
STORY: the user understands in seconds what is online, opens any service in one click, and spots what needs attention; agent proposals appear as reviewable diffs with explicit decisions.
FIRST VIEWPORT: graphite top bar with branding, theme switcher, sign out, and Manage button; below, title, search, health summary, and service groups in a grid. Management opens directly on Services and groups and provides persistent navigation across Services, Connections, and Agents, with a back link to the dashboard. Edit and remove controls appear only in management.
FORM: Patch panel label, chosen via Impeccable. seed:f5c5d0470b6ce9b7. Signature marks: LabelTape (group and section title) and StatusTag (status as tape label with icon and text).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
