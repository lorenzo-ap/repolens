# syntax=docker/dockerfile:1.7
# Multi-stage build for all three RepoLens services. Build a target with:
#   docker build --target api -t repolens-api .
#   docker build --target analyzer -t repolens-analyzer .
#   docker build --target web --build-arg API_INTERNAL_URL=http://api:4000 -t repolens-web .

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/analyzer/package.json apps/analyzer/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY packages/analysis/package.json packages/analysis/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN pnpm --filter @repolens/api build && pnpm --filter @repolens/analyzer build && pnpm --filter @repolens/web build

# --- API -------------------------------------------------------------------
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD \
  node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]

# --- Analyzer worker --------------------------------------------------------
FROM base AS analyzer
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/analyzer/node_modules ./apps/analyzer/node_modules
COPY --from=build /app/apps/analyzer/dist ./apps/analyzer/dist
COPY --from=build /app/apps/analyzer/package.json ./apps/analyzer/package.json
COPY --from=build /app/packages/database/drizzle ./packages/database/drizzle
RUN mkdir -p /work && chown node:node /work
USER node
ENV ANALYZER_WORKDIR=/work
CMD ["node", "apps/analyzer/dist/main.js"]

# --- Web --------------------------------------------------------------------
FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD \
  node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
