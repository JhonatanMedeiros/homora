# Base images are pinned by digest so builds are repeatable. Dependabot proposes updates.
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS backend
LABEL org.opencontainers.image.title="Homora backend" \
      org.opencontainers.image.description="API, monitor and local MCP server for the Homora self-hosted dashboard" \
      org.opencontainers.image.source="https://github.com/JhonatanMedeiros/homora" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production HOMORA_BIND_HOST=0.0.0.0 HOMORA_DATABASE_PATH=/app/data/homora.sqlite
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/auth/status').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/backend/dist/server.js"]

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS frontend
LABEL org.opencontainers.image.title="Homora frontend" \
      org.opencontainers.image.description="Web interface for the Homora self-hosted dashboard" \
      org.opencontainers.image.source="https://github.com/JhonatanMedeiros/homora" \
      org.opencontainers.image.licenses="MIT"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
# The MIT license, third-party notices and the SIL OFL texts for the bundled fonts.
COPY --from=build /app/LICENSE /app/THIRD_PARTY_NOTICES.md /usr/share/doc/homora/
COPY --from=build /app/apps/frontend/node_modules/@fontsource/barlow-semi-condensed/LICENSE /usr/share/doc/homora/fonts/barlow-semi-condensed-OFL.txt
COPY --from=build /app/apps/frontend/node_modules/@fontsource-variable/figtree/LICENSE /usr/share/doc/homora/fonts/figtree-OFL.txt
COPY --from=build /app/apps/frontend/node_modules/@fontsource-variable/jetbrains-mono/LICENSE /usr/share/doc/homora/fonts/jetbrains-mono-OFL.txt
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/"]
