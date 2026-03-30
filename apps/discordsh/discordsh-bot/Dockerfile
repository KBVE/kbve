# ── Stage A: Dependency planner (cargo-chef) ────────────────────────
FROM rust:1.94 AS chef
RUN cargo install cargo-chef --locked
WORKDIR /app

# ── Stage B: Prepare dependency recipe ──────────────────────────────
FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage C: Build dependencies (cached layer) ─────────────────────
FROM chef AS builder

# System libraries needed for compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev protobuf-compiler && \
    rm -rf /var/lib/apt/lists/*

COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json -p discordsh-bot

# ── Stage D: Build application ─────────────────────────────────────
COPY . .
RUN cargo build --release -p discordsh-bot --features jemalloc && \
    strip target/release/discordsh-bot

# ── Stage Z: Runtime ───────────────────────────────────────────────
FROM ghcr.io/kbve/chisel-ubuntu-axum:24.04.2 AS runtime

WORKDIR /app

# Copy the binary
COPY --from=builder /app/target/release/discordsh-bot /app/discordsh-bot

# Copy fonts for SVG rendering
COPY apps/discordsh/discordsh-bot/alagard.ttf /app/alagard.ttf
COPY apps/discordsh/discordsh-bot/NotoSansSymbols-Regular.ttf /app/NotoSansSymbols-Regular.ttf

ENV RUST_LOG=discordsh_bot=debug,kbve=debug \
    FONT_PATH=/app/alagard.ttf \
    SYMBOL_FONT_PATH=/app/NotoSansSymbols-Regular.ttf \
    HEALTH_PORT=4322

EXPOSE 4322

ENTRYPOINT ["/app/discordsh-bot"]
