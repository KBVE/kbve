# ============================================================================
# arpg-web — standalone Vite client for the ARPG, served as static files.
# A third play surface alongside kbve.com/arcade/arpg and the Discord embed.
#
# Build context = repo root. The game source + LFS-tracked sprite art live under
# apps/agones/arpg/web; the cross-repo deps are @kbve/laser and @kbve/observ
# (aliased to source in web/vite.config.ts). So this build mirrors those subtrees
# under /app.
# NOTE: the LFS art must be smudged (real PNGs, not pointer stubs) in the build
# context — CI runs `./kbve.sh -lfs arpg pull` before the docker build.
# ============================================================================

FROM node:24-bookworm-slim AS web
WORKDIR /app
RUN corepack enable

# Root install, same as the axum-* images. pnpm-workspace.yaml declares no
# `packages:`, so the one root node_modules IS the whole tree — this reproduces
# the exact resolution `nx build arpg-web` uses locally, instead of a separate
# app lockfile that silently drifts from it.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store/v3,id=pnpm-store \
    pnpm install --frozen-lockfile

# @kbve/laser and @kbve/observ are aliased to source by web/vite.config.ts.
COPY packages/npm/laser packages/npm/laser
COPY packages/npm/observ packages/npm/observ
COPY packages/data/codegen/generated packages/data/codegen/generated
COPY apps/agones/arpg/web apps/agones/arpg/web

# Prod endpoints baked at build time. arpg.kbve.com and supabase.kbve.com are
# both *.kbve.com so the browser calls Supabase directly (no dev /supabase proxy).
ARG PUBLIC_ARPG_GAME_WS=wss://arpg.kbve.com/ws
ARG PUBLIC_SUPABASE_URL=https://supabase.kbve.com
# Discord Activity client id, baked into the discord bundle. Public value (the
# OAuth client_secret stays server-side on axum-kbve); the arpg Discord app id.
ARG PUBLIC_DISCORD_CLIENT_ID=1518418263535653016
# Release version baked into the bundle (shown in-UI + the no-cache version.json
# the client polls to self-reload off a stale build). CI passes the resolved
# release version here so the bundle matches the image TAG even when version.toml
# is mid-publish-sync stale; empty default falls back to version.toml (vite.config).
ARG PUBLIC_ARPG_VERSION=
ENV PUBLIC_ARPG_GAME_WS=$PUBLIC_ARPG_GAME_WS
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_DISCORD_CLIENT_ID=$PUBLIC_DISCORD_CLIENT_ID
ENV PUBLIC_ARPG_VERSION=$PUBLIC_ARPG_VERSION
ENV PUBLIC_ARPG_LOCAL=false

RUN cd apps/agones/arpg/web && pnpm run build

# ============================================================================
FROM nginx:1.27-alpine AS runtime
COPY apps/agones/arpg/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web /app/apps/agones/arpg/web/dist /usr/share/nginx/html
EXPOSE 5402
