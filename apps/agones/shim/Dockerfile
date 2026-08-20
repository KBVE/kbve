# agones-shim — Agones lifecycle sidecar for game servers with no SDK of their own.
#
# Deliberately small and dependency-light: this runs beside every game server in
# the cluster, so its image size and start time are paid on every pod.
#
# Uses the trimmed Cargo.workspace.toml rather than the repo root manifest so a
# change to an unrelated crate does not invalidate this build's cache. The shim
# depends on no internal crates, which keeps that list to one member.

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

WORKDIR /app

COPY apps/agones/shim/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./
COPY apps/agones/shim/Cargo.toml apps/agones/shim/Cargo.toml

# cargo-chef needs a source tree to plan against, not the real sources.
RUN mkdir -p apps/agones/shim/src && echo 'fn main() {}' > apps/agones/shim/src/main.rs

RUN cargo chef prepare --recipe-path recipe.json

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder

WORKDIR /app

COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

COPY apps/agones/shim/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./
COPY apps/agones/shim/Cargo.toml apps/agones/shim/Cargo.toml
COPY apps/agones/shim/src apps/agones/shim/src

RUN cargo build --release --bin agones-shim && \
    strip target/release/agones-shim

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3

COPY --from=builder /app/target/release/agones-shim /usr/local/bin/agones-shim

# Runs beside a game server that may itself be non-root; nothing here needs
# privileges or a writable filesystem.
USER 1000:1000

ENTRYPOINT ["/usr/local/bin/agones-shim"]
