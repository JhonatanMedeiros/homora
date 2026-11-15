# Maintaining the documentation site

The site is built from the Markdown files in `docs/` with VitePress. The user guide and reference documents remain in the repository, so improving a guide improves the site too. Search is generated locally at build time; it does not require a hosted search service.

## Work locally

Use the Node and pnpm versions specified by the repository, then install dependencies and run:

```bash
pnpm install --frozen-lockfile
pnpm docs:dev
```

The development server prints its local address. To validate a production build and preview it:

```bash
pnpm docs:build
pnpm docs:preview
```

The static output is written to `docs/.vitepress/dist`. The configuration and navigation are in `docs/.vitepress/config.mts`; the theme is in `docs/.vitepress/theme/`. Add new pages to the appropriate sidebar section and use relative Markdown links where practical, so documents also work on GitHub. Check links, screenshots, and any claims about product behavior against the implementation.

## Languages and releases

English is the default. The language menu also opens the Portuguese site at `docs/pt-BR/`; its user guides cover the main workflows and link to the detailed English references. When changing product behavior, update both language versions or explicitly record any remaining translation work. Links to English-only technical references are labeled. The language menu returns to the selected language's home page so that untranslated pages do not lead to missing routes.

On the home page, the browser requests the latest public stable release from the fixed GitHub API endpoint. GitHub receives the visitor's IP address. If the repository has no accessible release, the request fails, or its tag is not a valid stable version, the site displays a link to the releases page instead of guessing a version. The release number is not taken from the source checkout or Docker `latest` tag.

## Deploy to Vercel or Netlify

Create a project connected to this repository only when ready to publish. Use the repository root as the project root, Node 24 and pnpm 12.4.2 (the version pinned in `package.json`). The settings are the same for both services:

| Setting                    | Value                            |
| -------------------------- | -------------------------------- |
| Install command            | `pnpm install --frozen-lockfile` |
| Build command              | `pnpm docs:build`                |
| Output / publish directory | `docs/.vitepress/dist`           |

Use a domain root, such as `docs.example.com`; a subdirectory requires a matching VitePress `base` configuration. On Vercel, `vercel.json` at the repository root already sets the install and build commands, the output directory and `ENABLE_EXPERIMENTAL_COREPACK=1` (so the pinned pnpm version is used); without it Vercel detects the Turborepo setup, builds the whole application and fails with `STATIC_BUILD_NO_OUT_DIR`. Leave the project's own overrides empty so the file applies. Netlify reads the pinned version from `package.json`; set `PNPM_FLAGS=--frozen-lockfile` for its automatic dependency installation. The site is static and needs no Homora server, database or secrets. Review the hosting provider's build and publication settings before enabling automatic deployments. The first hosted build and deployment still need validation on the chosen provider.
