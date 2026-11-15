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

## Deploy to Vercel or Netlify

Create a project connected to this repository only when ready to publish. Use the repository root as the project root, Node 24 and pnpm 12.4.2 (the version pinned in `package.json`). The settings are the same for both services:

| Setting                    | Value                            |
| -------------------------- | -------------------------------- |
| Install command            | `pnpm install --frozen-lockfile` |
| Build command              | `pnpm docs:build`                |
| Output / publish directory | `docs/.vitepress/dist`           |

Use a domain root, such as `docs.example.com`; a subdirectory requires a matching VitePress `base` configuration. On Vercel, set `ENABLE_EXPERIMENTAL_COREPACK=1` in the project settings so the pinned pnpm version is used. Netlify reads the pinned version from `package.json`; set `PNPM_FLAGS=--frozen-lockfile` for its automatic dependency installation. The site is static and needs no Homora server, database or secrets. Review the hosting provider's build and publication settings before enabling automatic deployments. The first hosted build and deployment still need validation on the chosen provider.
