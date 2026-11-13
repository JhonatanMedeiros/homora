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
  ember-text-light: 'oklch(0.55 0.15 50)'
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

Content up to 72rem, 16px side margins (32px from `md`). Homepage: search (`/` focuses it), availability summary, then groups. **Ctrl or Cmd K** opens the command palette (`CommandPalette`): open any service, toggle theme, or switch to management. Management lives behind a single entry.

Services default to a **list** view: one dense row per service (icon, name, host in mono, status light), two columns from `lg`. **Cards** shows the three-column cards with descriptions. One "View" button in the summary row (`ViewOptions`, a popover) switches between them; the descriptions switch exists only in Cards. The same actions are in the command palette. The choice is stored in `homora-density` (`list` or `cards`; the older `comfortable` maps to cards, `compact` to list). Group filter tabs appear only with three or more groups.

### Organize mode

Services are one compact row each (`OrganizeRow`): drag handle (hidden on touch), icon, name, host, up and down arrows, and a menu with "Move to top" and "Move to group". Each group header has its arrows and a menu with columns on the home (Auto, 1, 2, 3; larger saved values apply as 3), Rename, and Remove (empty groups only, after a confirmation dialog). A one-line hint and a "New group" button replace the old form; on small screens a fixed bar holds Done. Dragging onto a row of another group moves the service there, at the end of that group; while dragging, empty groups show a drop zone.

## Elevation & Depth

Flat. Depth comes from surface tone and 1px borders. The one exception is a 1px inner top highlight in ember at 16% on service cards that are up, which reads as lamplight. No drop shadows on cards, buttons, popovers, or fields; focus uses a 3px ring.

## Shapes

Base radius 8px (`--radius`), steps of 6, 10, and 14. Icons are Lucide, 16px in buttons. The status light is a 8px circle.

## Components

### StatusLight (signature)

`src/components/status-light.tsx`. 8px dot plus text. Up: green with a soft glow. Down: solid red (the service card also gets a red border and tint). Unknown and blocked: empty ring in muted ink. Replaces the old label-tape StatusTag.

### ServiceCard

Bordered card, 16px padding; whole card is the link. Icon tile turns ember-tinted when the service is up. Host in Geist Mono. Edit and remove sit in the corner on hover or focus.

### Brand mark

`src/components/brand-mark.tsx` and `public/favicon.svg`: a house outline in current color with an ember window.

### shadcn base

shadcn/ui new-york, Radix, Lucide, Tailwind v4, tokens in `@theme inline`. Primitives in `src/components/ui`, product components in `src/components`, pages in `src/pages`, domain modules in `src/features`. Every UI element is a component.

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
