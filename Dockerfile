# Base images are pinned by digest so builds are repeatable. Dependabot proposes updates.
FROM oven/bun:1.4.5-slim@sha256:b780593f3e10918cbdaec3d5a08d52224b9198069a65eb47812085c2ec007643 AS base
WORKDIR /app

# Dependencies are installed in their own stage so the layer survives source edits.
# Only the lockfile and the workspace manifests are copied here: changing application
# code does not invalidate the install, which is the most expensive step of the build.
FROM base AS manifests
COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/integrations/package.json ./packages/integrations/package.json
COPY packages/icons/package.json ./packages/icons/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/widgets/package.json ./packages/widgets/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/utils/package.json ./packages/utils/package.json

FROM manifests AS deps
# Bun's package cache is a cache mount: it persists between builds of this host without
# being copied into an image layer. `node_modules` still lives in the layer.
RUN --mount=type=cache,id=homora-bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

# Runtime dependencies of the API only (no devDependencies, no frontend tooling).
FROM manifests AS prod-deps
RUN --mount=type=cache,id=homora-bun-cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --filter @homora/backend

# The compiled output of the API and of every workspace package it links to (manifest, `dist`
# and bundled `assets`, never the sources), in the repository layout.
FROM build AS prod-tree
RUN mkdir /out \
    && for dir in apps/backend packages/*; do \
         mkdir -p "/out/$dir" && cp "$dir/package.json" "/out/$dir/" \
         && for item in dist assets; do if [ -e "$dir/$item" ]; then cp -r "$dir/$item" "/out/$dir/"; fi; done; \
       done

FROM oven/bun:1.4.5-slim@sha256:b780593f3e10918cbdaec3d5a08d52224b9198069a65eb47812085c2ec007643 AS backend
LABEL org.opencontainers.image.title="Homora backend" \
      org.opencontainers.image.description="API, monitor and local MCP server for the Homora self-hosted dashboard" \
      org.opencontainers.image.source="https://github.com/JhonatanMedeiros/homora" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
# Optional: `--build-arg HOMORA_BUILD_COMMIT=$(git rev-parse HEAD)` for builds outside Coolify. Coolify
# does not pass it, so the backend falls back to the SOURCE_COMMIT it injects at runtime. The commit is
# reported in the startup log and by /api/health.
ARG HOMORA_BUILD_COMMIT=
ARG HOMORA_RELEASE_TAG=
ENV NODE_ENV=production HOMORA_BIND_HOST=0.0.0.0 HOMORA_DATABASE_PATH=/app/data/homora.sqlite HOMORA_BUILD_COMMIT=${HOMORA_BUILD_COMMIT} HOMORA_RELEASE_TAG=${HOMORA_RELEASE_TAG}
# Same layout as the repository, so `root` in config.ts (three levels above dist) is /app and
# the workspace symlinks in node_modules keep resolving.
COPY --from=prod-deps --chown=bun:bun /app /app
COPY --from=prod-tree --chown=bun:bun /out /app
# `ping` backs the optional ICMP check; the monitor runs it as the unprivileged `bun` user.
RUN apt-get update \
    && apt-get install -y --no-install-recommends iputils-ping \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data && chown bun:bun /app/data
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "apps/backend/dist/server.js"]

# Optional Docker inventory agent. Supply a socket, token file and HTTPS origin at runtime.
FROM oven/bun:1.4.5-slim@sha256:b780593f3e10918cbdaec3d5a08d52224b9198069a65eb47812085c2ec007643 AS discovery-agent
WORKDIR /app
COPY --chown=bun:bun scripts/docker-push-agent.mjs ./docker-push-agent.mjs
USER bun
CMD ["bun", "docker-push-agent.mjs"]

FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de AS frontend
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

# Single-container distribution: the backend stays on loopback behind unprivileged nginx.
FROM backend AS homora
LABEL org.opencontainers.image.title="Homora" \
      org.opencontainers.image.description="Self-hosted dashboard and API"
USER root
RUN apt-get update && apt-get install -y --no-install-recommends nginx \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
COPY --from=frontend /usr/share/doc/homora /usr/share/doc/homora
COPY --chown=bun:bun docker/start.mjs /app/docker/start.mjs
COPY --chown=bun:bun scripts/backup.mjs /app/scripts/backup.mjs
USER bun
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:8080/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "docker/start.mjs"]
