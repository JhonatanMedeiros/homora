# Base images are pinned by digest so builds are repeatable. Dependabot proposes updates.
FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS base
WORKDIR /app

# Dependencies are installed in their own stage so the layer survives source edits.
# Only the lockfile and the workspace manifests are copied here: changing application
# code does not invalidate the install, which is the most expensive step of the build.
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json
# Bun's package cache is a cache mount: it persists between builds of this host without
# being copied into an image layer. `node_modules` still lives in the layer.
RUN --mount=type=cache,id=homora-bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

# Runtime dependencies of the API only (no devDependencies, no frontend), installed from the
# same lockfile and manifests; the workspace packages are linked into it below.
FROM base AS prod-deps
COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN --mount=type=cache,id=homora-bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --filter @homora/backend

FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS backend
LABEL org.opencontainers.image.title="Homora backend" \
      org.opencontainers.image.description="API, monitor and local MCP server for the Homora self-hosted dashboard" \
      org.opencontainers.image.source="https://github.com/JhonatanMedeiros/homora" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production HOMORA_BIND_HOST=0.0.0.0 HOMORA_DATABASE_PATH=/app/data/homora.sqlite
# Same layout as the repository, so `root` in config.ts (three levels above dist) is /app and
# the workspace symlinks in node_modules keep resolving.
COPY --from=prod-deps --chown=bun:bun /app/package.json /app/bun.lock ./
COPY --from=prod-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=prod-deps --chown=bun:bun /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=prod-deps --chown=bun:bun /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=build --chown=bun:bun /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build --chown=bun:bun /app/apps/backend/dist ./apps/backend/dist
COPY --from=build --chown=bun:bun /app/packages/db/package.json ./packages/db/package.json
COPY --from=build --chown=bun:bun /app/packages/db/dist ./packages/db/dist
COPY --from=build --chown=bun:bun /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=bun:bun /app/packages/shared/dist ./packages/shared/dist
# `ping` backs the optional ICMP check; the monitor runs it as the unprivileged `bun` user.
RUN apt-get update \
    && apt-get install -y --no-install-recommends iputils-ping \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data && chown bun:bun /app/data
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/api/auth/status').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "apps/backend/dist/server.js"]

# Optional Docker inventory agent. Supply a socket, token file and HTTPS origin at runtime.
FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS discovery-agent
WORKDIR /app
COPY --chown=bun:bun scripts/docker-push-agent.mjs ./docker-push-agent.mjs
USER bun
CMD ["bun", "docker-push-agent.mjs"]

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS frontend
LABEL org.opencontainers.image.title="Homora frontend" \
      org.opencontainers.image.description="Web interface for the Homora self-hosted dashboard" \
      org.opencontainers.image.source="https://github.com/JhonatanMedeiros/homora" \
      org.opencontainers.image.licenses="MIT"
# nginx renders templates/*.template into conf.d at start, filling HOMORA_TRUSTED_PROXY.
ENV HOMORA_TRUSTED_PROXY=127.0.0.1
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
# The MIT license, third-party notices and the SIL OFL texts for the bundled fonts.
COPY --from=build /app/LICENSE /app/THIRD_PARTY_NOTICES.md /usr/share/doc/homora/
COPY --from=build /app/licenses /usr/share/doc/homora/licenses
COPY --from=build /app/apps/frontend/node_modules/@fontsource-variable/geist/LICENSE /usr/share/doc/homora/fonts/geist-OFL.txt
COPY --from=build /app/apps/frontend/node_modules/@fontsource-variable/geist-mono/LICENSE /usr/share/doc/homora/fonts/geist-mono-OFL.txt
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/"]
