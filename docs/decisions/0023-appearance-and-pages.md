# 0023 — Appearance, custom CSS and pages

**Status:** Accepted (all four phases of issue #97 implemented)

## Context

Issue #97 asks for per-instance personalization in four phases: accent color,
gradients and card translucency; a background image; custom CSS with a safe mode; and
pages (tabs) on the Home. The look must be shared by every device, must never make the
interface unreadable without a way back, and must not open new ways to reach other sites
or run script.

## Decision

### Appearance settings

- Stored on the server under `app_settings` key `appearance` as JSON (`version: 2`:
  `accent`, `customAccent`, `background`, `cardOpacity` 60 to 100 in steps of 5, `blur`,
  `image`). `parseAppearance` reads version 1 and upgrades it; unknown or invalid data
  falls back to the default look. Theme and language stay per browser.
- `packages/shared/src/appearance.ts` owns the setting contract, parsing, color math, and
  contrast policy used by both server and browser. The frontend-only
  `apps/frontend/src/lib/appearance-tokens.ts` turns a setting into `--ap-*` CSS variables;
  `appearance.ts` applies them with `style.setProperty`, which a strict CSP allows. `style.css`
  maps them to semantic tokens (`--primary`, `--ring`, `--card`, `--page-background`, ...).
  No component uses a raw color.
- **Naming divergence:** the project already used `--accent` for a neutral hover surface,
  so the chosen accent drives `--primary` and a new `--accent-text`; `--accent` keeps its
  meaning.
- **Contrast policy.** Saving is refused (`appearance-contrast`) unless, in both themes
  and for every gradient stop, ink and muted text reach 4.5:1 on the card and on the page,
  and the accent reaches 3:1 on the card. The color on the accent is white or black,
  whichever passes. For an image, the server stores the minimum dim that passes, using the
  image's mean color; the client's file facts are ignored.

### Background image

- Upload is `PUT /api/appearance/background` with the raw bytes (2 MB, scoped content-type
  parser), `DELETE` removes it. It is processed with `sharp`: magic-byte sniffing (JPEG,
  PNG, WebP only), animated images and APNG rejected, 36 megapixel limit, EXIF rotation
  applied then metadata stripped, resized to at most 1920 px, stored as WebP. The mean
  color feeds the contrast check.
- Stored in one file next to the database (`<database>.background`); the database holds
  only a random 32-hex name. Served at `/api/appearance/background/:name` behind the
  session, with `nosniff`, `Content-Security-Policy: default-src 'none'` and immutable
  caching (the name changes on every upload). The file is part of backups
  (`scripts/backup.mjs` copies it). Nothing is loaded from other sites.
- Phones do not offer upload or edit, only a notice.

### Custom CSS and safe mode

- Text in `custom_css` plus the `custom_css_enabled` flag, at most 20 KB in bytes. The
  shared `customCssProblem` normalizes comments and escapes first, then rejects `@import`,
  any address with a scheme or a leading `//` (in `url()`, `image-set()` or strings), script-like
  features (`expression`, `behavior`, `-moz-binding`, `javascript:`), `<`, control
  characters and unbalanced braces. The same function runs in the browser (live feedback)
  and on the server (authority).
- Served same-origin as `GET /api/appearance/custom.css` (`text/css`, `nosniff`) and
  loaded through `<link id="homora-custom-css">`, never inline, so a strict
  `style-src 'self'` would still allow it.
- **Safe mode:** `?safe=1` skips the link for that tab only (kept in `sessionStorage`) and
  shows a banner with the way out. `pnpm css:reset` (`scripts/css-reset.mjs`) turns the
  flag off while keeping the text and records an audit event (`custom-css-reset`,
  actor `anonymous`, detail `cli: disabled`). It works when the interface is unusable.
- Stable hooks for authors: `data-homora="service-card | group-title | top-bar |
  app-header | host-view | host-map | host-suggestions | impact-banner |
  safe-mode-banner | page-tabs"`.
- **No CSP is shipped today.** The code is written so one can be added (no inline style
  attributes from settings, no external assets), but a header is not set by Homora or the
  bundled nginx. This is a known gap, listed in SECURITY.md.

### Pages

- `pages(id, name, position)` with a unique `NOCASE` index on `name`, and
  `service_groups.page_id` (nullable FK, restrict). Migration `0023` creates a `Home`
  page with id 1 and assigns every existing group to it. Services belong to groups by
  `services.category`, so pages hold groups. A group without a page (or a card whose
  group has no row) is treated as being on the first page.
- Limits: 12 pages, names of 1 to 40 characters, unique case-insensitively. The last page
  cannot be deleted; deleting a page that has groups needs `moveTo`. Every change is
  audited as `page-update`.
- Routes: `GET/POST /api/pages`, `PUT /api/pages/order`, `PUT/DELETE /api/pages/:id`,
  `PUT /api/groups/:id/page`. New groups go to the page they are created from, or to the
  first page.
- **Group view** shows one page at a time as a tab list (Radix Tabs) with counters and a
  "N down" badge; the selected page is remembered per browser (`homora-page`); digits
  `1` to `9` switch pages (same rules as the other single keys, inert in fields and
  dialogs). The category filter is per page. With a single page no tabs are shown.
- **Host list and Map show every page**, naming the page of each service, and the impact
  banner says on how many pages the affected services are. The command palette shows the
  page and "Go to card" switches to it. Organize mode lists the groups of all pages,
  labelled, when moving a card.
- Export is version 2 (it still reads version 1) and writes `pages` and a page per group.
  Import is additive: new pages are created while there is room (a `page-limit` warning
  otherwise), or all new groups can be put on a chosen page. MCP read tools name the page;
  a service proposal may carry a `page` that is validated.

### Export and import of settings

Export includes `appearance` (image reference cleared) and `customCss`. Import does not
read them: restoring a look is done with a database backup, and the image is only in the
backup. This keeps imports additive and free of surprises.

## Consequences

- One migration (`0023`); no downgrade, like the others.
- `sharp` is a new backend dependency, used only for the background image.
- nginx accepts up to 3 MB on the image route.
- Not verified in a real browser: see the pull request for the list of behaviours.
