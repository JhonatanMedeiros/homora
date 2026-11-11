---
name: Homora
description: Self-hosted homelab dashboard where everything is labeled like a patch panel, warm graphite with laminated label-maker tape.
colors:
  tape-yellow: 'oklch(0.87 0.17 95)'
  tape-yellow-dark: 'oklch(0.88 0.17 95)'
  tape-yellow-ink: 'oklch(0.2 0.02 80)'
  warm-paper: 'oklch(0.965 0.008 85)'
  paper-card: 'oklch(0.99 0.004 85)'
  paper-muted: 'oklch(0.94 0.008 85)'
  paper-secondary: 'oklch(0.925 0.01 85)'
  paper-accent: 'oklch(0.92 0.02 90)'
  graphite-ink: 'oklch(0.22 0.012 70)'
  graphite-muted-ink: 'oklch(0.47 0.015 75)'
  paper-border: 'oklch(0.87 0.01 85)'
  paper-input-border: 'oklch(0.72 0.012 80)'
  focus-graphite: 'oklch(0.38 0.02 70)'
  laminated-tape: 'oklch(1 0 0)'
  tape-ink: 'oklch(0.17 0.01 70)'
  rack-rail: 'oklch(0.235 0.01 70)'
  rack-rail-dark: 'oklch(0.165 0.008 70)'
  rack-rail-ink: 'oklch(0.94 0.01 85)'
  rack-rail-hover: 'oklch(0.3 0.012 70)'
  rack-rail-border: 'oklch(0.32 0.012 70)'
  night-graphite: 'oklch(0.2 0.008 70)'
  night-card: 'oklch(0.245 0.009 70)'
  night-popover: 'oklch(0.27 0.01 70)'
  night-ink: 'oklch(0.95 0.01 90)'
  night-muted: 'oklch(0.28 0.01 70)'
  night-muted-ink: 'oklch(0.72 0.014 80)'
  night-border: 'oklch(0.34 0.01 70)'
  night-input-border: 'oklch(0.5 0.012 70)'
  night-tape: 'oklch(0.95 0.008 95)'
  status-ok: 'oklch(0.45 0.13 150)'
  status-ok-night: 'oklch(0.78 0.15 150)'
  status-down: 'oklch(0.52 0.19 27)'
  status-down-night: 'oklch(0.7 0.18 27)'
  status-on-color: 'oklch(0.985 0.005 85)'
typography:
  headline:
    fontFamily: "'Barlow Semi Condensed', 'Figtree Variable', system-ui, sans-serif"
    fontSize: '1.875rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '-0.025em'
  title:
    fontFamily: "'Barlow Semi Condensed', 'Figtree Variable', system-ui, sans-serif"
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: '-0.025em'
  body:
    fontFamily: "'Figtree Variable', system-ui, sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
  body-compact:
    fontFamily: "'Figtree Variable', system-ui, sans-serif"
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.43
  label-tape:
    fontFamily: "'Barlow Semi Condensed', 'Figtree Variable', system-ui, sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 700
    lineHeight: 1
    letterSpacing: '0.08em'
  data:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.4
rounded:
  tape: '3px'
  sm: '6px'
  md: '8px'
  lg: '10px'
  xl: '14px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '32px'
  rail-width: '232px'
  header-height: '64px'
  content-max: '72rem'
components:
  button-primary:
    backgroundColor: '{colors.tape-yellow}'
    textColor: '{colors.tape-yellow-ink}'
    rounded: '{rounded.md}'
    padding: '8px 16px'
    height: '40px'
  button-outline:
    backgroundColor: '{colors.paper-card}'
    textColor: '{colors.graphite-ink}'
    rounded: '{rounded.md}'
    padding: '8px 16px'
    height: '40px'
  button-ghost-hover:
    backgroundColor: '{colors.paper-accent}'
    textColor: '{colors.graphite-ink}'
  button-destructive:
    backgroundColor: '{colors.status-down}'
    textColor: '{colors.status-on-color}'
    rounded: '{rounded.md}'
    height: '40px'
  input-field:
    backgroundColor: '{colors.paper-card}'
    textColor: '{colors.graphite-ink}'
    rounded: '{rounded.md}'
    padding: '4px 12px'
    height: '40px'
  label-tape:
    backgroundColor: '{colors.laminated-tape}'
    textColor: '{colors.tape-ink}'
    typography: '{typography.label-tape}'
    rounded: '{rounded.tape}'
    padding: '0 8px'
    height: '24px'
  label-tape-section:
    backgroundColor: '{colors.laminated-tape}'
    textColor: '{colors.tape-ink}'
    rounded: '{rounded.tape}'
    padding: '0 10px'
    height: '28px'
  status-tag-available:
    backgroundColor: '{colors.status-ok}'
    textColor: '{colors.status-on-color}'
    typography: '{typography.label-tape}'
    rounded: '{rounded.tape}'
    padding: '0 8px'
    height: '24px'
  status-tag-unavailable:
    backgroundColor: '{colors.status-down}'
    textColor: '{colors.status-on-color}'
    typography: '{typography.label-tape}'
    rounded: '{rounded.tape}'
    padding: '0 8px'
    height: '24px'
  status-tag-unknown:
    backgroundColor: '{colors.paper-muted}'
    textColor: '{colors.graphite-muted-ink}'
    typography: '{typography.label-tape}'
    rounded: '{rounded.tape}'
    padding: '0 8px'
    height: '24px'
  service-card:
    backgroundColor: '{colors.paper-card}'
    textColor: '{colors.graphite-ink}'
    rounded: '{rounded.md}'
    padding: '16px'
  rail:
    backgroundColor: '{colors.rack-rail}'
    textColor: '{colors.rack-rail-ink}'
    width: '{spacing.rail-width}'
  rail-item-active:
    backgroundColor: '{colors.tape-yellow}'
    textColor: '{colors.tape-yellow-ink}'
    typography: '{typography.title}'
    rounded: '{rounded.md}'
---

# Design System: Homora

## Overview

**Creative North Star: "The Patch Panel Label"**

Everything in Homora is labeled, like a rack organized at home. The laminated tape from a label-maker is the signature: section titles and the status of each service use tape language, while service groups have more understated titles. The rest is warm graphite (hue 70) and warm paper, calm and dense enough for a daily dashboard. The system rejects the generic dashboard of identical cards with plain status dots.

The top bar is graphite in both themes, referencing the rack. Content lives on warm paper in the light theme and on dark graphite in the dark theme. Color has a functional role: tape yellow fills primary actions, active navigation items, and focus; green, red, and gray indicate status only. Barlow Semi Condensed labels, Figtree reads, JetBrains Mono displays addresses and counts.

**Key Characteristics:**

- White laminated tape with black uppercase text as signature mark (LabelTape, StatusTag).
- Graphite top bar in both themes; management accessible via a single button.
- Tape yellow only as fill, never as text.
- Status always with icon, text, and color.
- Flat: no decorative shadow, depth via tone and border.
- shadcn/ui base (new-york, Radix, lucide, Tailwind v4), themed via `dark` class.

## Colors

Warm graphite and warm paper, with a single tape yellow and three status colors. All values come from `src/style.css` and are maintained in OKLCH, the project's normative source. Frontmatter names map to shadcn variables (`--primary`, `--background`, `--sidebar`, etc.); the dark theme redefines the same variables under `.dark`.

### Primary

- **Tape Yellow** (`tape-yellow`, `--primary`): fill for primary action (Add service), active items when applicable, text selection, and `accent-color`. In dark theme becomes `tape-yellow-dark`. Text on top of it is `tape-yellow-ink`, near-black graphite.

### Secondary

- **Status OK Green** (`status-ok`, `status-ok-night`): available status, tape fill with light text.
- **Status Down Red** (`status-down`, `status-down-night`): unavailable status and destructive actions; border, 10% background, and ring on down service cards.

### Neutral

- **Warm Paper** (`warm-paper`): content background in light theme. **Paper Card** (`paper-card`): cards, inputs, popovers.
- **Graphite Ink** (`graphite-ink`) and **Muted Ink** (`graphite-muted-ink`): primary and secondary text in light theme.
- **Paper Border** (`paper-border`) for dividers; **Field Border** (`paper-input-border`) firmer for inputs; **Focus Graphite** (`focus-graphite`) for focus ring in light theme. In dark theme the focus ring is yellow.
- **Rack Rail** (`rack-rail`, `rack-rail-dark` in dark) with ink `rack-rail-ink`, hover `rack-rail-hover`, and border `rack-rail-border`.
- **Laminated Tape** (`laminated-tape`, `night-tape` in dark) with ink `tape-ink`: only in LabelTape.
- **Night Graphite** (`night-graphite`), `night-card`, `night-popover`, `night-ink`, `night-muted`, `night-muted-ink`, `night-border`, `night-input-border`: dark theme surfaces and text.
- **No Info Gray** uses `paper-muted` with `graphite-muted-ink` and border ring: unknown status or blocked monitoring.

### Named Rules

**The Never-Yellow-Text Rule.** Tape yellow is fill for primary actions, active items, and focus. Never a color for text, standalone icons, or links.

**The Status-Needs-Words Rule.** Green, red, and gray signify status and always appear with an icon and text. Color alone never communicates status.

## Typography

**Display/Label Font:** Barlow Semi Condensed 500/600/700 (with Figtree Variable and system-ui)
**Body Font:** Figtree Variable (with system-ui, sans-serif)
**Data Font:** JetBrains Mono Variable (with ui-monospace)

**Character:** Condensed and sturdy in labels, like label-maker print; legible and friendly in body copy; monospaced where users copy or compare URLs, numbers, and identifiers.

### Hierarchy

- **Headline** (600, 1.875rem, 1.25): page title (`h1`), tracking -0.025em, `text-balance`.
- **Title** (600, 1rem, 1.5): `h2`/`h3` and secondary titles, in Barlow.
- **Body** (400, 1rem, 1.5): body text and descriptions; max width 65ch in page header. Fields use 0.875rem from `md` upwards.
- **Label** (700, 0.8125rem, 0.08em, uppercase): LabelTape text; StatusTag uses 0.06em.
- **Data** (400, 0.8125rem): service host, counts with `tabular-nums`.

### Named Rules

**The Tape-Voice Rule.** Uppercase and wide tracking belong only to tape text (LabelTape and StatusTag). Everywhere else text follows standard casing.

## Layout

Graphite top bar with branding, theme switcher, sign out, and management access. Content spans up to 72rem (`max-w-6xl`), with lateral margins of 16px and 32px from `md` upwards. The homepage presents search, availability summary, and groups; administrative navigation appears when entering Manage. The service grid has one column on mobile, two from `sm`, and three from `xl`, with a 12px gap. Touch targets expand to 44px on coarse pointers.

## Elevation & Depth

The system is flat. Depth comes from tone (top bar darker than paper, card lighter than background) and 1px borders, never from drop shadows. The only exception is the tape lamination edge: an inner 1px bevel at 20% black plus a 1px baseline line, making the strip look like laminated label tape. It exists solely in LabelTape.

### Named Rules

**The Flat-By-Default Rule.** No decorative shadow on cards, buttons, popovers, or fields. Focus uses a 3px ring (`ring/50`), not a drop shadow.

**The Lamination-Edge Rule.** The tape bevel belongs only to LabelTape. Do not copy it to other surfaces for faux-relief.

## Shapes

Base radius of 8px (`--radius`), with 6px, 10px, and 14px steps. Controls and cards use 8px; tape uses 3px, almost sharp, like a label-maker cut. 1px borders define cards; Organize mode switches cards to dashed borders. Down services get red borders, red focus rings, and 10% red background. Icons are always Lucide, 16px in buttons and 14px inside tape labels.

## Components

### Buttons

- **Shape:** 8px corners, height 40px (44px on coarse pointers); `sm` 36px, `xs` 24px, `lg` 44px, icon 40px.
- **Primary:** tape yellow with graphite text, weight 600, padding 8px 16px; hover at 90% opacity.
- **Outline / Secondary / Ghost / Destructive / Link:** outline on card with field border; secondary on paper; ghost gets background on hover only; destructive in red with light text; link without background.
- **Focus:** 3px ring at 50%; disabled at 50% opacity.

### Inputs / Fields

- **Style:** card background, `paper-input-border`, 8px, height 40px.
- **Focus:** border and 3px ring in focus color.
- **Error / Disabled:** red border and ring on `aria-invalid`; disabled at 50%.

### Cards / Containers

A service is an Item with border, card background, 16px padding, and hover in `accent/40`. The link wraps the entire card; edit and remove actions sit in the corner at 50% opacity on fine pointers until hover or focus.

### Navigation

Graphite top bar with branding and Manage button. In administrative views, navigation is sidebar-based on larger screens and above content on mobile; active item uses secondary variant. Returning home goes back to the services dashboard.

### LabelTape (signature)

Laminated white strip (24px height, 28px on section titles) with Barlow 700 uppercase, 0.8125rem, 0.08em tracking, black text, 3px radius, and lamination bevel. Identifies resource types when necessary; section titles are subtle by default. Service groups use Barlow titles, folder icon, subtle counter, and a horizontal divider. In integrations and agents sections, section titles use subtle text and dividers without tape. In `src/components/label-tape.tsx`.

### StatusTag (signature)

Status label with the same geometry as the tape: 14px Lucide icon plus uppercase text. Available in green with CircleCheck; Unavailable in red with CircleX; No information and Blocked monitoring in gray with border ring, with CircleHelp and ShieldOff. In `src/components/status-tag.tsx`; the health summary presents several inline.

### shadcn Base and Componentization

shadcn/ui new-york style base with Radix (`radix-ui`), lucide icons, Tailwind v4 with tokens in `@theme inline`, and theme switching via `dark` class (`@custom-variant dark`). Primitives live in `src/components/ui`, product components in `src/components`, pages in `src/pages`, and domain modules in `src/features`. Every UI element is a component; no raw unencapsulated markup on pages.

## Do's and Don'ts

### Do:

- **Do** use subtle titles as default in sections and StatusTag for all service statuses; LabelTape is reserved for explicit uses, such as resource types.
- **Do** reserve tape yellow for primary action, active item, and focus.
- **Do** compose screens with primitives from `components/ui` and components from `components`, placing pages in `pages` and modules in `features`.
- **Do** display hosts and counts in JetBrains Mono.
- **Do** maintain graphite top bar in both themes and toggle theme only via `dark` class.

### Don't:

- **Don't** use yellow as text color, link color, or standalone icon color.
- **Don't** communicate status by color alone: always icon plus text.
- **Don't** add decorative shadows; LabelTape's lamination bevel is the only raised edge.
- **Don't** regress to a generic dashboard of identical cards with status dots.
- **Don't** use uppercase with wide tracking outside tape text.

## Homepage Navigation

The homepage prioritizes search, availability, and launching services. The graphite top bar retains branding, theme toggle, sign out, and subtle access to **Manage**. The management area brings together services and groups, connections, and agents; editing and removing cards reside in this area. Layout adapts to small screens without exposing administrative tabs on the homepage.
