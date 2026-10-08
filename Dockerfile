# ==============================================================================
# Wasel Production Multi-Stage Dockerfile (API & Background Worker)
# Base: node:22-alpine, Non-root user, pnpm deploy --prod, HEALTHCHECK
# ==============================================================================

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.9.1 --activate
WORKDIR /app

# ------------------------------------------------------------------------------
# Builder Stage: Install all dependencies, build packages & deploy prod bundle
# ------------------------------------------------------------------------------
FROM base AS builder

# Copy workspace configurations
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./

# Copy packages and application source trees
COPY packages ./packages
COPY apps/api ./apps/api
COPY supabase ./supabase

# Install full dependencies
RUN pnpm install --frozen-lockfile

# Build shared packages and api
RUN pnpm --filter @wasel/shared build && \
    pnpm --filter @wasel/api build

# Deploy isolated production distribution of @wasel/api
RUN pnpm --filter @wasel/api deploy --prod /prod/api

# Copy compiled dist and migrations into the deployed output
RUN cp -r apps/api/dist /prod/api/dist && \
    cp -r supabase /prod/supabase

# ------------------------------------------------------------------------------
# Production Runner Base: node:22-alpine with non-root user
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# Create non-root system group and user
RUN addgroup -S wasel && adduser -S wasel -G wasel

# Set production environment defaults
ENV NODE_ENV=production
ENV APP_ENV=production
ENV ALLOW_DEV_PROVIDERS=true

# Copy deployed production artifacts with strict non-root ownership
COPY --from=builder --chown=wasel:wasel /prod/api /app
COPY --from=builder --chown=wasel:wasel /prod/supabase /app/supabase

USER wasel

# ------------------------------------------------------------------------------
# Target: worker (BullMQ Background Worker & Event Dispatcher)
# ------------------------------------------------------------------------------
FROM runner AS worker
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/worker.js"]

# ------------------------------------------------------------------------------
# Target: api (NestJS Modular Monolith API) - DEFAULT FINAL STAGE
# ------------------------------------------------------------------------------
FROM runner AS api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
