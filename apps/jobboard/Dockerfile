# syntax=docker/dockerfile:1
# ============================================================================
# jobboard — Multi-stage Docker build (shared chisel base images)
# ============================================================================

# ---- web stage: build the React/Vite SPA into web/dist (baked by rust-embed) --
# The SPA consumes @kbve/rn + @kbve/core buildless source via vite aliases
# (react-native -> react-native-web), so the repo layout is mirrored under /app
# and the scoped deps are installed at the build root so @kbve/rn's own imports
# resolve there. Bounded (only the SPA's declared deps), not a whole-monorepo
# install. The deps layer caches independently of source.
FROM node:22-slim AS web
WORKDIR /app
COPY apps/jobboard/web/package.json apps/jobboard/web/package-lock.json ./
RUN npm ci
COPY tsconfig.base.json tsconfig.base.json
COPY packages/npm/rn packages/npm/rn
COPY packages/npm/core packages/npm/core
COPY packages/npm/fx packages/npm/fx
COPY packages/data/codegen/generated packages/data/codegen/generated
COPY apps/jobboard/web apps/jobboard/web
RUN cd apps/jobboard/web && npx vite build

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner
ENV CARGO_INCREMENTAL=0

RUN printf '[workspace]\nmembers = ["apps/jobboard", "packages/rust/jedi", "packages/rust/holy", "packages/rust/kbve"]\nresolver = "2"\n' > Cargo.toml

COPY apps/jobboard/Cargo.toml apps/jobboard/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/holy/Cargo.toml packages/rust/holy/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/data/proto/ packages/data/proto/
COPY apps/jobboard/build.rs apps/jobboard/build.rs
COPY apps/jobboard/src/ apps/jobboard/src/
COPY packages/rust/jedi/src/ packages/rust/jedi/src/
COPY packages/rust/holy/src/ packages/rust/holy/src/
COPY packages/rust/kbve/src/ packages/rust/kbve/src/

RUN cargo chef prepare --recipe-path recipe.json

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS cook
ENV CARGO_INCREMENTAL=0

RUN printf '[workspace]\nmembers = ["apps/jobboard", "packages/rust/jedi", "packages/rust/holy", "packages/rust/kbve"]\nresolver = "2"\n' > Cargo.toml

COPY apps/jobboard/Cargo.toml apps/jobboard/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/holy/Cargo.toml packages/rust/holy/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/data/proto/ packages/data/proto/
COPY apps/jobboard/build.rs apps/jobboard/build.rs

COPY --from=planner /app/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p jobboard

FROM cook AS builder

# cargo-chef normalizes the package version to 0.0.1 in the cook skeleton so a
# version bump doesn't bust the dependency cache. Re-copy the REAL Cargo.toml
# here so cargo build bakes the true CARGO_PKG_VERSION (the /health fallback
# when APP_VERSION isn't set).
COPY apps/jobboard/Cargo.toml apps/jobboard/Cargo.toml
COPY packages/rust/jedi/ packages/rust/jedi/
COPY packages/rust/holy/ packages/rust/holy/
COPY packages/rust/kbve/ packages/rust/kbve/
COPY apps/jobboard/src/ apps/jobboard/src/
COPY --from=web /app/apps/jobboard/web/dist apps/jobboard/web/dist
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    touch apps/jobboard/src/main.rs && \
    cargo build --release -p jobboard && \
    strip target/release/jobboard

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/jobboard /app/jobboard

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=5400
ENV RUST_LOG=jobboard=info,tower_http=info

EXPOSE 5400

ENTRYPOINT ["/app/jobboard"]
