---
description: 'Theme, language, accent color, backgrounds, custom CSS and safe mode.'
---

# Appearance and personalization

Homora is meant to look like _your_ dashboard. This guide covers the theme and language, the look shared by all your
devices, custom CSS and the safe mode that gets you out of a bad stylesheet.

![Appearance settings](../screenshots/settings-appearance.png)

## Two kinds of settings

| Kind                      | Where it is saved | What it covers                                                                                                   |
| ------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Per browser**           | The browser       | Theme (light or dark), language, list or cards layout, descriptions, uptime period, top bar, keyboard shortcuts. |
| **Shared by all devices** | The Homora server | Accent color, page background, card translucency, background image and custom CSS.                               |

Open **Manage → Settings → Appearance** for both. The first card, **Theme and language**, is per browser; **Look for
all devices** is shared.

## Theme and language

- **Theme:** dark is the default and light is a complete theme, not an afterthought. You can also switch from the
  contrast button in the header.
- **Language:** English or Portuguese (Brazil). By default it follows your browser, and the language button in the
  header switches it. Notifications use the language chosen for each channel.

![The dashboard in the light theme](../screenshots/dashboard-light.png)

## The look shared by all devices

Under **Look for all devices**:

- **Accent color:** choose Ember, Moss, Sky, Rose, Violet or Slate, or a **Custom** color. It drives buttons, focus rings
  and active items.
- **Page background:** one of six looks: Flat, Dusk, Ember glow, Forest, Ocean or Sand light. Colors only;
  nothing is loaded from other sites.
- **Advanced:** card **translucency** and blur, and an optional **background image**.
- **Preview:** the panel beside the controls shows how a card will look before you save.
- **Reset to default** returns to the original look.

**Readability is enforced.** Homora refuses to save a combination that would make text or controls hard to read: in
both themes, for every gradient stop, text must reach a 4.5:1 contrast ratio on the card and on the page, and the
accent must reach 3:1 on the card. When it cannot save, it says so instead of letting you lock yourself into an
unreadable page.

### Background image

- JPEG, PNG or WebP up to 2 MB. Animated images are rejected.
- The server processes the picture: it removes metadata, applies the EXIF rotation, resizes it to at most 1920 px and
  stores it as WebP next to the database as `<database>.background`.
- Homora computes the minimum dimming that keeps text readable on top of the picture.
- The image is part of a database backup made with `pnpm backup`. See [Import, export and backup](import-export-backup.md).
- Phones do not offer upload or editing, only a notice.

## Custom CSS

For anything else, **Custom CSS** lets you add your own stylesheet (up to 20 KB). It is validated in the browser and
again on the server, and it is served from Homora itself.

To keep the interface safe and private, the following are rejected: `@import`, any address with a scheme or starting
with `//` (in `url()`, `image-set()` or strings), script-like features (`expression`, `behavior`, `-moz-binding`,
`javascript:`), `<`, control characters and unbalanced braces.

### Safe mode

If a stylesheet makes the interface unusable, you can turn it off **without losing the text**:

- Open any page with `?safe=1`, for example `http://localhost:8080/?safe=1`, **or**
- run `pnpm css:reset` on the server. With Docker Compose: `docker compose exec backend node scripts/css-reset.mjs`.

## Pages and the home layout

Pages are the tabs on your dashboard. Create, rename, reorder and delete them in **Settings → Home and pages** (up to
12, with unique names). Each group belongs to one page, and keys `1` to `9` switch between them. The same screen holds
the list or cards layout, whether descriptions show, and the uptime period (24 h, 7 d or 30 d); these are saved in the
browser.

![Home and pages settings](../screenshots/settings-home.png)

## Top bar and shortcuts

**Settings → Top bar and shortcuts** has three groups of options:

- **Keyboard shortcuts:** turn the single-key shortcuts on or off. `Ctrl/⌘ K` and `Ctrl/⌘ B` always work.
- **Command palette:** optionally add "Search the web". It is off by default, and only the text you type is sent
  when you choose it.
- **Top bar:** show the date, the time and CPU, memory and disk usage from a Proxmox connection above the dashboard.

## Search for any setting

The **Search settings** box at the top of the Settings page finds a setting by name from anywhere in Settings.
