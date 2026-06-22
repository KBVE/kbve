# ============================================================================
# arpg-web — standalone Vite client for the ARPG, served as static files.
# A third play surface alongside kbve.com/arcade/arpg and the Discord embed.
#
# Build context = repo root. The app owns no game code: it consumes the game
# source from astro-kbve + @kbve/laser via vite aliases (see web/vite.config.ts)
# and serves the LFS-tracked sprite assets from astro's public dir. So this
# build mirrors the relevant repo subtrees under /app and installs only the
# app's own (npm, non-workspace) deps.
# ============================================================================

FROM node:24-bookworm-slim AS web
WORKDIR /app

# App deps first (cache layer independent of source).
COPY apps/agones/arpg/web/package.json apps/agones/arpg/web/
RUN cd apps/agones/arpg/web && npm install --no-save

# Source the vite app aliases: the arpg game source + the @/ modules it pulls
# (AuthBridge, IDBStorage), @kbve/laser, and the sprite assets it serves.
COPY tsconfig.base.json tsconfig.base.json
COPY packages/npm/laser packages/npm/laser
COPY apps/kbve/astro-kbve/src apps/kbve/astro-kbve/src
COPY apps/kbve/astro-kbve/public/assets/arcade/arpg apps/kbve/astro-kbve/public/assets/arcade/arpg
COPY apps/agones/arpg/web apps/agones/arpg/web

# Prod endpoints baked at build time. arpg.kbve.com and supabase.kbve.com are
# both *.kbve.com so the browser calls Supabase directly (no dev /supabase proxy).
ARG PUBLIC_ARPG_GAME_WS=wss://arpg.kbve.com/ws
ARG PUBLIC_SUPABASE_URL=https://supabase.kbve.com
ENV PUBLIC_ARPG_GAME_WS=$PUBLIC_ARPG_GAME_WS
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_ARPG_LOCAL=false

RUN cd apps/agones/arpg/web && npm run build

# ============================================================================
FROM nginx:1.27-alpine AS runtime
COPY apps/agones/arpg/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web /app/apps/agones/arpg/web/dist /usr/share/nginx/html
EXPOSE 5402
