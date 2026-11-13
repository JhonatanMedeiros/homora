# @homora/icons

Private workspace package containing the catalog and local SVG assets for built-in brand icons.
Both service cards and integrations use the same catalog. The frontend serves these files at the
stable `/brand-icons/<name>.svg` URLs in development and in production; no CDN is required.

To add a logo, review its license and source, add its SVG to `assets/` and its name to
`src/index.ts`, and update the third-party notices if needed. The icon tests check that the catalog
and files match and reject common unsafe SVG content. Brand names and logos remain the property of
their respective owners. See `THIRD_PARTY_NOTICES.md` and `licenses/` at the repository root.
