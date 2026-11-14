# Base images are pinned by digest so builds are repeatable. Dependabot proposes updates.
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS base
WORKDIR /app
RUN corepack enable

# Dependencies are installed in their own stage so the layer survives source edits.
# Only the lockfile and the workspace manifests are copied here: changing application
# code does not invalidate the install, which is the most expensive step of the build.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/integrations/package.json ./packages/integrations/package.json
COPY packages/icons/package.json ./packages/icons/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/widgets/package.json ./packages/widgets/package.json
# The pnpm store is a cache mount: it persists between builds of this host without
# being copied into an image layer. `node_modules` still lives in the layer.
RUN --mount=type=cache,id=homora-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

FROM deps AS build
COPY . .
RUN pnpm build

# Self-contained production tree for the API: compiled code, runtime dependencies only and the
# workspace packages (@homora/db, @homora/shared) with their `dist` and migrations.
FROM build AS prod
RUN pnpm --filter @homora/backend deploy --prod --legacy /prod

FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS backend
LABEL org.opencontainers.image.title="Homora backend" \
      org.opencontainers.image.description="API, monitor and local MCP server for the Homora self-hosted dashboard" \
      org.opencontainers.image.source="https://github.com/JhonatanMedeiros/homora" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
# Optional: `--build-arg HOMORA_BUILD_COMMIT=$(git rev-parse HEAD)` for builds outside Coolify. Coolify
# does not pass it, so the backend falls back to the SOURCE_COMMIT it injects at runtime. The commit is
# reported in the startup log and by /api/health.
ARG HOMORA_BUILD_COMMIT=
ENV NODE_ENV=production HOMORA_BIND_HOST=0.0.0.0 HOMORA_DATABASE_PATH=/app/data/homora.sqlite HOMORA_BUILD_COMMIT=${HOMORA_BUILD_COMMIT}
# Kept under apps/backend so `root` in config.ts (three levels above dist) is still /app.
COPY --from=prod --chown=node:node /prod /app/apps/backend
# `ping` backs the optional ICMP check; the monitor runs it as the unprivileged `node` user.
RUN apt-get update \
    && apt-get install -y --no-install-recommends iputils-ping \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/backend/dist/server.js"]

# Optional Docker inventory agent. Supply a socket, token file and HTTPS origin at runtime.
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS discovery-agent
WORKDIR /app
COPY --chown=node:node scripts/docker-push-agent.mjs ./docker-push-agent.mjs
USER node
CMD ["node", "docker-push-agent.mjs"]

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
