---
name: Homora
description: Self-hosted homelab dashboard as a house at night. Warm dark neutrals, one ember accent, and a lit window for every service that is up.
colors:
  background-dark: 'oklch(0.165 0.006 60)'
  card-dark: 'oklch(0.2 0.006 60)'
  border-dark: 'oklch(0.29 0.006 60)'
  ink-dark: 'oklch(0.95 0.006 80)'
  muted-ink-dark: 'oklch(0.7 0.01 70)'
  ember-dark: 'oklch(0.78 0.15 62)'
  ok-dark: 'oklch(0.77 0.15 155)'
  warning-dark: 'oklch(0.85 0.15 95)'
  info-dark: 'oklch(0.76 0.11 245)'
  down-dark: 'oklch(0.7 0.19 25)'
  background-light: 'oklch(0.985 0.004 80)'
  card-light: 'oklch(1 0 0)'
  border-light: 'oklch(0.9 0.006 80)'
  ink-light: 'oklch(0.2 0.01 60)'
  muted-ink-light: 'oklch(0.48 0.012 65)'
  ember-light: 'oklch(0.72 0.16 58)'
  ember-text-light: 'oklch(0.5 0.14 48)'
  ok-light: 'oklch(0.45 0.13 155)'
  warning-light: 'oklch(0.5 0.12 75)'
  info-light: 'oklch(0.48 0.13 250)'
  down-light: 'oklch(0.5 0.19 25)'
typography:
  headline:
    {
      fontFamily: "'Geist Variable', system-ui, sans-serif",
      fontSize: '1.875rem',
      fontWeight: 600,
      lineHeight: 1.25,
      letterSpacing: '-0.025em',
    }
  body:
    {
      fontFamily: "'Geist Variable', system-ui, sans-serif",
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.5,
    }
  data:
    {
      fontFamily: "'Geist Mono Variable', ui-monospace, monospace",
      fontSize: '0.8125rem',
      fontWeight: 400,
      lineHeight: 1.4,
    }
rounded: { sm: '6px', md: '8px', lg: '10px', xl: '14px' }
components:
  button-primary:
    {
      backgroundColor: '{colors.ember-dark}',
      textColor: 'oklch(0.2 0.03 60)',
      rounded: '{rounded.md}',
      padding: '8px 16px',
      height: '40px',
    }
  button-outline:
    {
      backgroundColor: '{colors.card-dark}',
      textColor: '{colors.ink-dark}',
      rounded: '{rounded.md}',
      padding: '8px 16px',
      height: '40px',
    }
  input-field:
    {
      backgroundColor: '{colors.card-dark}',
      textColor: '{colors.ink-dark}',
      rounded: '{rounded.md}',
      padding: '4px 12px',
      height: '40px',
    }
  status-light: { textColor: '{colors.ok-dark}', typography: '{typography.body}' }
  service-row:
    {
      backgroundColor: '{colors.card-dark}',
      textColor: '{colors.ink-dark}',
      rounded: '{rounded.md}',
      padding: '8px 12px',
    }
---

# Design System: Homora

## Overview

**Creative North Star: "Lamplight"**

A house at night. Surfaces are warm neutrals separated by 1px lines, never shadows. A single ember accent marks what you can act on: the primary button, the focus ring, the active item. Every service has a window light: lit green when it is up, red when it is down, an empty ring when unknown. Status is the identity, so the logo is a house with one lit window and the status light is the same shape of idea.

Dark is the intended default; light is a complete, supported theme. Both are defined in `src/style.css` (OKLCH is the normative source) and switched by the `dark` class on `<html>`.

## Colors

- **Ember** (`--primary`): fills for primary actions, active navigation, focus ring, selection. **Ember text** (`--accent-text`) is the variant that keeps contrast as text or icon on the page background (the active service icon uses it). Light theme uses a deeper ember for text.
- **Neutrals** have hue 60-80 and very low chroma so dark is warm, not blue. Layers: `background` < `card` < `popover`, divided by `border`.
- **Status:** `success` (up), `destructive` (down), muted ring (unknown or blocked).

### Named Rules

**The Status-Needs-Words Rule.** The light is never alone: it always sits next to text.
**The One-Accent Rule.** Ember is the only brand hue. Do not add a second accent; green and red mean status only.

## Typography

Geist Variable for interface and headings, Geist Mono Variable for hosts, counts, shortcuts, and technical labels. No uppercase tracking except tiny mono labels. Numbers that align use `tabular-nums`.

## Layout

Content up to 72rem (90rem when side columns are shown), 16px side margins (32px from `md`). **One shell for every
page** (`AppShell`). From 768px an icon **rail** (`NavRail`, 64px, each icon named by a tooltip and an accessible name)
lists Home, Services, Map, Probes, Integrations, Agents, Activity and Settings, with the theme and the account menu at
its end. The header holds the section links Summary, Services and Maintenance (`SectionTabs`, links with
`aria-current`) on those views and a breadcrumb elsewhere, then the command palette, the status pill, the alerts and New
service. Pages have their own bar below it on the Summary and Services. On phones the floating bottom bar (`MobileTabs`
over `FloatingNav`: a 60px capsule inset 14px from the edges, separated by a 1px line, no shadow, with a fade behind it;
only the active item shows its name, on an ember 16% pill, the rest are icons with a 48px target and a screen-reader
name) is on every page with Home, Services, Agents and More; the header keeps search, status, alerts and the account
menu. **Ctrl or Cmd K** opens the command palette (`CommandPalette`). A skip link (`SkipLink`) is the first tab stop.

### Home: Summary, Services and Maintenance

**The Home opens with health; the cards are one click away.** The Summary (`/`) is a grid of widgets (`SummaryBoard`).
Eleven are its own (`summaryOnly` definitions, drawn by the application from the services and their health in
`summaryRenderers`): pinned services, Needs attention (`ProbableCauses alwaysOpen`, where every cause says "likely", or a
calm or "cannot measure" card), service windows, hosts, probes, health figures, agent proposals, the state strip (a
ring, a number and a name per state, each a button that filters Services), availability target, latency and upcoming
maintenance. The rest are drawn as widget cards. A narrowed or named
widget writes its name and selection above its content, an empty selection says so and shrinks, and a widget that
cannot be drawn says why. "Nothing needs attention" is said only when nothing is unknown or
stale. It has no side columns; choosing a service opens the details sheet (`ServiceDrawer`).

**The grid** (`SummaryGrid`) has 12 columns, rows of at least 5rem and a 16px gap; widgets flow in order and fill holes
(dense flow), never overlap and never take free pixel positions. Those that must be read at a glance (pinned, attention,
figures, state strip) grow with their content; the others scroll inside their cell, fade at the bottom edge while more is
below and become focusable. From 768 to 1023px a widget takes half or all of the width. **Arranging is a mode**: a sticky
toolbar (Add widget, Restore default, Cancel, Done; two per row on phones) takes focus, each widget gets a dashed outline
(no layout shift), a floating chip with its name, size and `⋯` menu, and a corner handle for pointer resizing; its
content is inert. Every move and resize is in the menu and announced politely. On phones (`SummaryColumn`) it is one
column in its own order, with 44px edit (where there are options), up, down and remove buttons and no sizes. **Everything arranged is one draft**:
removals and additions happen on Done, the toolbar says removed widgets will be deleted, and deleting one with its own
settings asks first. Restore default also brings back the Summary's own widgets. The Add widget gallery lists them first,
marked "On this page" when present. Services and Maintenance keep the left column (`HomeSidebar`).
Maintenance (`/maintenance`) schedules a window and lists the open and the scheduled ones.

Services default to **compact tiles** (`ServiceCardCompact`): icon, name, host in mono, the state in words, a 6px bar of the period (`UptimeMiniBar`) and the latency, with an `i` button that opens the details drawer. **List** is one dense row per service, two columns from `lg`. **Cards** shows the three-column cards with descriptions. One "Display" button in the toolbar (`ViewOptions`, a popover) switches the layout and sets descriptions and the uptime period; the descriptions switch exists only in Cards. The same actions are in the command palette. The choice is stored in `homora-density` (`tiles`, `list` or `cards`; nothing stored means tiles, the older `comfortable` maps to cards and `compact` to list).

On Services, from 1280px the page widgets other than the Summary's own (`PageWidgetList layout="rail"`) are at the top of the right column
(`ServicePanel`), above the service windows; choosing a service shows its details in their place with **Back to widgets**.
A page without widgets shows the details of one service there, the first problem first. Without the column, widgets sit
above the groups in a collapsible section (`WidgetsSection`), open until folded. On phones the Add widget tile shows only
in Organize. The **status pill** (`HealthPill`, `HomeStatusPill`) is in the header of every page: an 8px status light and
a few words ("All up", "2 problems", "Partly monitored", "Cannot measure"), a ghost button with no border and no colored
text, so the color is the dot alone. On phones it shrinks to the dot plus the problem count, a check when all is well or a
question mark when unknown, so the state never depends on color alone. It opens a popover with `StatusBanner` and Needs
attention, reading the same `summarizeStatus` as the Summary, so the two cannot disagree. When the total mixes offline
services, offline probes and slow ones, the banner breaks it down and the left column says its counts include probes. A
status filter with a zero count fades only its dot. The Hosts section is a status light, the node name and a count of its
cards; it never appears for an inventory that is loading or unreadable. With "Problems first" on, offline cards also come
first inside each group.

The details sheet is on the right, and at the bottom under 768px. Empty states use the `Empty` primitive: first run, no
result (with a clear-filters action) and a calm Offline view with a check icon, which is good news and is not styled as
an error. Service addresses truncate in the middle and keep the port (`HostAddress`). Group filter tabs appear only with
three or more groups.

On phones (under 768px) the status filter, the arrangement (Group, Host, Map), the layout, Organize and Suggested hosts
live in one **Options** button on Services that opens a bottom sheet (`ServiceOptionsSheet`), next to the category chips.

### Organize mode

The status pill stays in the header, the left column becomes group jump links, and a note says when the saved order is shown instead of Problems first. Services are one compact row each (`OrganizeRow`): drag handle (hidden on touch), icon, name, host, up and down arrows, and a menu with "Move to top", "Move to group", "Edit" and "Remove" (removal asks to confirm in the row). Each group header has its arrows and a menu with columns on the home (Auto, 1, 2, 3; larger saved values apply as 3), Rename, and Remove (empty groups only, after a confirmation dialog). A one-line hint with "Add service" and "New group" buttons replaces the old form; services are added, edited and removed here (there is no separate management list); on small screens a fixed bar holds Done. Dragging onto a row of another group moves the service there, at the end of that group; while dragging, empty groups show a drop zone.

## Elevation & Depth

Flat. Depth comes from surface tone and 1px borders. The one exception is a 1px inner top highlight in ember at 16% on service cards that are up, which reads as lamplight. No drop shadows on cards, buttons, popovers, or fields; focus uses a 3px ring.

## Shapes

Base radius 8px (`--radius`), steps of 6, 10, and 14. Icons are Lucide, 16px in buttons. The status light is a 8px circle.

## Components

### StatusLight (signature)

`src/components/status-light.tsx`. 8px dot plus text. Up: green with a soft glow. Down: solid red (the service card also gets a red border and tint). Unknown and blocked: empty ring in muted ink. Replaces the old label-tape StatusTag.

### ServiceCard

The compact tile follows the same rules in less space: no description, tags or history, state always in words next to the light.

Bordered card, 16px padding; whole card is the link. Icon tile turns ember-tinted when the service is up. Host in Geist Mono. Edit and remove sit in the corner on hover or focus.

### Brand mark

`src/components/brand-mark.tsx` and `public/favicon.svg`: a house outline in current color with an ember window.

### shadcn base

shadcn/ui new-york, Radix, Lucide, Tailwind v4, tokens in `@theme inline`. Primitives in `packages/ui/src/components`, product components in `src/components`, pages in `src/pages`, domain modules in `src/features`. Every UI element is a component.

## Do's and Don'ts

### Do:

- **Do** use ember for primary action, active item, focus, and (via `accent-text`) links and active icons.
- **Do** show status with a StatusLight and words.
- **Do** show hosts, ports, counts, and shortcuts in Geist Mono.
- **Do** separate surfaces with tone and 1px borders.

### Don't:

- **Don't** add a second accent hue or decorative gradients.
- **Don't** use drop shadows for elevation.
- **Don't** communicate status by color alone.
- **Don't** reintroduce uppercase wide-tracking labels outside tiny mono captions.

## Motion

Motion is brief and tied to use: management content and tabs enter when navigating, palette results appear as it opens, and expanding a group reveals its contents. Buttons acknowledge a press; service surfaces respond to pointer hover, and organize-mode drop targets transition as their state changes. Group creation, edits, and removal receive a visible confirmation. A status light gives one short pulse when its state changes, never a continuous blink. Reduced-motion preferences suppress movement while the status text and color continue to communicate the state.

The Agents page review (`ReviewInbox`) is a queue with a detail, not a stack of cards. From 1024px the queue (20rem, risk filter and "Approve low risk") sits beside the selected proposal, whose decision footer sticks to the bottom of the screen; below that the queue moves into a bottom sheet and proposals are paged one at a time, with the footer above the floating navigation. Risk is a light with a word (`RiskLabel`: success for low risk, warning for attention, info for access, destructive for removals), never color alone. Changed values are diff lines (`DiffLine`): removed struck through on a destructive tint, added on a success tint, with only the differing part in bold. Risky approvals use hold-to-confirm (`ApproveButton`, 900ms), with an alert dialog as the non-pointer alternative. The summary is one line of figures, not tiles.
