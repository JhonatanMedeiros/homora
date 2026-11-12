# Third-Party Notices

Homora is distributed under the MIT license (see [LICENSE](LICENSE)). This
file summarizes licenses of production dependencies, according to
`pnpm licenses list --prod` on 2026-11-10. Re-run this command when updating
dependencies; the full text of each license accompanies the corresponding
package in `node_modules`.

| License      | Packages                                                                   |
| ------------ | -------------------------------------------------------------------------- |
| MIT and ISC  | The vast majority of dependencies, including `yaml` (ISC).                 |
| Apache-2.0   | `class-variance-authority`, `detect-libc`, `drizzle-orm`                   |
| BSD-3-Clause | `fast-uri`, `light-my-request`, `qs`, `secure-json-parse`, `source-map-js` |
| BSD-2-Clause | `json-schema-typed`                                                        |
| 0BSD         | `tslib`                                                                    |
| MPL-2.0      | `lightningcss` (CSS build tool; not executed at runtime in production)     |
| OFL-1.1      | Geist and Geist Mono fonts (Fontsource packages)                           |

## Icons

Icons `lucide:name` come from the `lucide-react` package (ISC license), listed above.
Icons provided by URL are the responsibility of the user configuring them.

`brand:name` logos (164 SVG files in `apps/frontend/public/brand-icons`)
come from the [dashboard-icons](https://github.com/homarr-labs/dashboard-icons) project
(Apache-2.0 license, text in `licenses/dashboard-icons-Apache-2.0.txt`),
copied from commit `d767d73`. Only clean vector SVGs were selected, without
embedded images, scripts, or external references (verified by tests).
Product names, brands, and logos belong to their respective owners and appear solely to
identify the service, without implying endorsement or affiliation; the Apache-2.0 license
of the repository does not grant rights over third-party trademarks.

## Fonts

Fonts are served locally via Fontsource packages under the SIL Open Font
License 1.1. This license permits usage and redistribution alongside software,
provided that the license and copyright notices accompany the fonts and
they are not sold individually. License files are included in the `@fontsource*`
packages.

## Pending Items

- This audit covered production dependencies, fonts, and brand logos from
  dashboard-icons (under the repository license only; individual trademark review
  was not performed). Future assets require their own review.
- No legal analysis was performed; name and trademark checks remain pending.
