# ============================================================================
# discordsh-bot — Multi-stage Docker build
#
# Uses shared chisel base images:
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder  (Rust + cargo-chef + sccache)
#   ghcr.io/kbve/chisel-ubuntu-axum:24.04.3         (chiseled Ubuntu + jemalloc + libpq)
# ============================================================================

# [STAGE A] - Cargo Chef Planner
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner

COPY apps/discordsh/discordsh-bot/Cargo.workspace.toml Cargo.toml
COPY Cargo.lock ./

COPY apps/discordsh/discordsh-bot/Cargo.toml apps/discordsh/discordsh-bot/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/rust/bevy/bevy_inventory/Cargo.toml packages/rust/bevy/bevy_inventory/Cargo.toml
COPY packages/rust/bevy/bevy_items/Cargo.toml packages/rust/bevy/bevy_items/Cargo.toml
COPY packages/rust/bevy/bevy_battle/Cargo.toml packages/rust/bevy/bevy_battle/Cargo.toml
COPY packages/rust/bevy/bevy_npc/Cargo.toml packages/rust/bevy/bevy_npc/Cargo.toml
COPY packages/rust/bevy/bevy_quests/Cargo.toml packages/rust/bevy/bevy_quests/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/discordsh/discordsh-bot/src && echo "fn main() {}" > apps/discordsh/discordsh-bot/src/main.rs && \
    mkdir -p packages/rust/jedi/src && echo "" > packages/rust/jedi/src/lib.rs && \
    mkdir -p packages/rust/kbve/src && echo "" > packages/rust/kbve/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_inventory/src && echo "" > packages/rust/bevy/bevy_inventory/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_items/src && echo "" > packages/rust/bevy/bevy_items/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_battle/src && echo "" > packages/rust/bevy/bevy_battle/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_npc/src && echo "" > packages/rust/bevy/bevy_npc/src/lib.rs && \
    mkdir -p packages/rust/bevy/bevy_quests/src && echo "" > packages/rust/bevy/bevy_quests/src/lib.rs

RUN cargo chef prepare --recipe-path recipe.json

# [STAGE B] - Cargo Chef Cook (Cache External Dependencies)
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS builder-deps
ENV CARGO_INCREMENTAL=0

COPY --from=planner /app/recipe.json recipe.json
COPY --from=planner /app/Cargo.toml /app/Cargo.lock ./
COPY --from=planner /app/apps apps
COPY --from=planner /app/packages packages

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p discordsh-bot

# [STAGE C] - Foundation Layer (Compile workspace crates from real source)
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS foundation
ENV CARGO_INCREMENTAL=0

COPY --from=builder-deps /app/target target
COPY --from=builder-deps /usr/local/cargo /usr/local/cargo

COPY --from=planner /app/Cargo.toml ./
COPY Cargo.lock ./

COPY apps/discordsh/discordsh-bot/Cargo.toml apps/discordsh/discordsh-bot/Cargo.toml
RUN mkdir -p apps/discordsh/discordsh-bot/src && \
    echo "fn main() {}" > apps/discordsh/discordsh-bot/src/main.rs

COPY packages/data/proto packages/data/proto

COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/bevy/bevy_inventory packages/rust/bevy/bevy_inventory
COPY packages/rust/bevy/bevy_items packages/rust/bevy/bevy_items
COPY packages/rust/bevy/bevy_battle packages/rust/bevy/bevy_battle
COPY packages/rust/bevy/bevy_npc packages/rust/bevy/bevy_npc
COPY packages/rust/bevy/bevy_quests packages/rust/bevy/bevy_quests

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p kbve -p jedi -p bevy_inventory -p bevy_items -p bevy_battle -p bevy_npc -p bevy_quests

# ============================================================================
# [STAGE D] - Build Application
# ============================================================================
FROM foundation AS builder

# Foundation crate source (cargo needs source to verify fingerprints)
COPY packages/data/proto packages/data/proto
COPY packages/rust/jedi packages/rust/jedi
COPY packages/rust/kbve packages/rust/kbve
COPY packages/rust/bevy/bevy_inventory packages/rust/bevy/bevy_inventory
COPY packages/rust/bevy/bevy_items packages/rust/bevy/bevy_items
COPY packages/rust/bevy/bevy_battle packages/rust/bevy/bevy_battle
COPY packages/rust/bevy/bevy_npc packages/rust/bevy/bevy_npc
COPY packages/rust/bevy/bevy_quests packages/rust/bevy/bevy_quests

# Application source (most frequently changing — placed last for cache)
COPY apps/discordsh/discordsh-bot apps/discordsh/discordsh-bot

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p discordsh-bot --features jemalloc && \
    strip target/release/discordsh-bot

# ============================================================================
# [STAGE Z] - Runtime Image
# ============================================================================
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/discordsh-bot /app/discordsh-bot

# Game card fonts (SVG -> PNG rendering via resvg)
COPY --chown=10001:10001 apps/discordsh/discordsh-bot/alagard.ttf /app/alagard.ttf
COPY --chown=10001:10001 apps/discordsh/discordsh-bot/NotoSansSymbols-Regular.ttf /app/NotoSansSymbols-Regular.ttf

ENV RUST_LOG=discordsh_bot=debug,kbve=debug \
    FONT_PATH=/app/alagard.ttf \
    SYMBOL_FONT_PATH=/app/NotoSansSymbols-Regular.ttf \
    HEALTH_PORT=4322

EXPOSE 4322

ENTRYPOINT ["/app/discordsh-bot"]
