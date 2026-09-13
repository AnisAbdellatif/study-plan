# syntax=docker/dockerfile:1
# One image for the whole app: the API serves the built web app from the same origin.
# Build: docker build -t study-plan .   Run with PostgreSQL: see deploy/compose.yaml.

ARG BUN_VERSION=1.4.2

# Dependencies for building, cached as long as the manifests and the lockfile don't change.
FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

# The web app. Operator details for the legal pages are compiled in, so they come in as build arguments.
FROM deps AS web
ARG VITE_OPERATOR_NAME
ARG VITE_OPERATOR_STREET
ARG VITE_OPERATOR_POSTAL_CITY
ARG VITE_OPERATOR_EMAIL
ARG VITE_OPERATOR_PHONE
ARG VITE_HOSTING_PROVIDER
ARG VITE_MAIL_PROVIDER
ARG VITE_SERVER_LOG_RETENTION
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN bun run build

# Runtime dependencies only.
FROM oven/bun:${BUN_VERSION} AS prod-deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production

FROM oven/bun:${BUN_VERSION}-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST=apps/web/dist
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/apps/api/node_modules apps/api/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules packages/shared/node_modules
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src packages/shared/src
COPY apps/api/package.json apps/api/
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/src apps/api/src
COPY --from=web /app/apps/web/dist apps/web/dist
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "apps/api/src/main.ts"]
