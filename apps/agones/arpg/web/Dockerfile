# ============================================================================
# arpg-web — standalone Vite client for the ARPG, served as static files.
# A third play surface alongside kbve.com/arcade/arpg and the Discord embed.
#
# Build context = repo root. The game source + LFS-tracked sprite art live under
# apps/agones/arpg/web; the one cross-repo dep is @kbve/laser (aliased to source
# in web/vite.config.ts). So this build mirrors those two subtrees under /app and
# installs only the app's own (npm, non-workspace) deps.
# NOTE: the LFS art must be smudged (real PNGs, not pointer stubs) in the build
# context — CI runs `./kbve.sh -lfs arpg pull` before the docker build.
# ============================================================================

FROM node:24-bookworm-slim AS web
WORKDIR /app

# App deps first (cache layer independent of source).
COPY apps/agones/arpg/web/package.json apps/agones/arpg/web/
RUN cd apps/agones/arpg/web && npm install --no-save

# The game source + sprite art now live entirely under apps/agones/arpg/web.
# @kbve/laser is the one cross-repo dep the vite config aliases to source.
COPY tsconfig.base.json tsconfig.base.json
COPY packages/npm/laser packages/npm/laser
COPY apps/agones/arpg/web apps/agones/arpg/web

# Prod endpoints baked at build time. arpg.kbve.com and supabase.kbve.com are
# both *.kbve.com so the browser calls Supabase directly (no dev /supabase proxy).
ARG PUBLIC_ARPG_GAME_WS=wss://arpg.kbve.com/ws
ARG PUBLIC_SUPABASE_URL=https://supabase.kbve.com
# Discord Activity client id, baked into the discord bundle. Public value (the
# OAuth client_secret stays server-side on axum-kbve); the arpg Discord app id.
ARG PUBLIC_DISCORD_CLIENT_ID=1518418263535653016
ENV PUBLIC_ARPG_GAME_WS=$PUBLIC_ARPG_GAME_WS
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_DISCORD_CLIENT_ID=$PUBLIC_DISCORD_CLIENT_ID
ENV PUBLIC_ARPG_LOCAL=false

RUN cd apps/agones/arpg/web && npm run build

# ============================================================================
FROM nginx:1.27-alpine AS runtime
COPY apps/agones/arpg/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web /app/apps/agones/arpg/web/dist /usr/share/nginx/html
EXPOSE 5402
