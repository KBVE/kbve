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
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/kbve-proto/Cargo.toml crates/kbve-proto/Cargo.toml
COPY crates/holy/Cargo.toml crates/holy/Cargo.toml
COPY crates/kbve/Cargo.toml crates/kbve/Cargo.toml
COPY crates/bevy_inventory/Cargo.toml crates/bevy_inventory/Cargo.toml
COPY crates/bevy_items/Cargo.toml crates/bevy_items/Cargo.toml
COPY crates/bevy_behavior/Cargo.toml crates/bevy_behavior/Cargo.toml
COPY crates/bevy_battle/Cargo.toml crates/bevy_battle/Cargo.toml
COPY crates/bevy_npc/Cargo.toml crates/bevy_npc/Cargo.toml
COPY crates/bevy_quests/Cargo.toml crates/bevy_quests/Cargo.toml
COPY crates/bevy_skills/Cargo.toml crates/bevy_skills/Cargo.toml
COPY crates/bevy_chat/Cargo.toml crates/bevy_chat/Cargo.toml
COPY crates/bevy_mapdb/Cargo.toml crates/bevy_mapdb/Cargo.toml
COPY crates/bevy_pathfinder/Cargo.toml crates/bevy_pathfinder/Cargo.toml
COPY crates/bevy_db/Cargo.toml crates/bevy_db/Cargo.toml
COPY crates/bevy_dungeon/Cargo.toml crates/bevy_dungeon/Cargo.toml
COPY crates/bevy_dialogue/Cargo.toml crates/bevy_dialogue/Cargo.toml
COPY crates/holy-derive/Cargo.toml crates/holy-derive/Cargo.toml
# bevy_db carries an optional path dep on bevy_tasker behind the
# "bevy-plugin" feature. cargo chef prepare reads every member manifest
# fully — including optional path deps — so the bevy_tasker manifest
# must exist on disk even though we never enable the feature here.
COPY crates/bevy_tasker/Cargo.toml crates/bevy_tasker/Cargo.toml

COPY packages/data/proto packages/data/proto

RUN mkdir -p apps/discordsh/discordsh-bot/src && echo "fn main() {}" > apps/discordsh/discordsh-bot/src/main.rs && \
    mkdir -p crates/jedi/src && echo "" > crates/jedi/src/lib.rs && \
    mkdir -p crates/bevy_dialogue/src && echo "" > crates/bevy_dialogue/src/lib.rs && \
    mkdir -p crates/holy-derive/src && echo "" > crates/holy-derive/src/lib.rs && \
    mkdir -p crates/kbve-proto/src && echo "" > crates/kbve-proto/src/lib.rs && \
    mkdir -p crates/holy/src && echo "" > crates/holy/src/lib.rs && \
    mkdir -p crates/kbve/src && echo "" > crates/kbve/src/lib.rs && \
    mkdir -p crates/bevy_inventory/src && echo "" > crates/bevy_inventory/src/lib.rs && \
    mkdir -p crates/bevy_items/src && echo "" > crates/bevy_items/src/lib.rs && \
    mkdir -p crates/bevy_behavior/src && echo "" > crates/bevy_behavior/src/lib.rs && \
    mkdir -p crates/bevy_battle/src && echo "" > crates/bevy_battle/src/lib.rs && \
    mkdir -p crates/bevy_npc/src && echo "" > crates/bevy_npc/src/lib.rs && \
    mkdir -p crates/bevy_quests/src && echo "" > crates/bevy_quests/src/lib.rs && \
    mkdir -p crates/bevy_skills/src && echo "" > crates/bevy_skills/src/lib.rs && \
    mkdir -p crates/bevy_chat/src && echo "" > crates/bevy_chat/src/lib.rs && \
    mkdir -p crates/bevy_mapdb/src && echo "" > crates/bevy_mapdb/src/lib.rs && \
    mkdir -p crates/bevy_pathfinder/src && echo "" > crates/bevy_pathfinder/src/lib.rs && \
    mkdir -p crates/bevy_db/src && echo "" > crates/bevy_db/src/lib.rs && \
    mkdir -p crates/bevy_dungeon/src && echo "" > crates/bevy_dungeon/src/lib.rs && \
    mkdir -p crates/bevy_tasker/src && echo "" > crates/bevy_tasker/src/lib.rs

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

COPY crates/jedi crates/jedi
COPY crates/kbve-proto crates/kbve-proto
COPY crates/bevy_dialogue crates/bevy_dialogue
COPY crates/holy-derive crates/holy-derive
COPY packages/proto packages/proto
COPY crates/holy crates/holy
COPY crates/kbve crates/kbve
COPY crates/bevy_inventory crates/bevy_inventory
COPY crates/bevy_items crates/bevy_items
COPY crates/bevy_behavior crates/bevy_behavior
COPY crates/bevy_battle crates/bevy_battle
COPY crates/bevy_npc crates/bevy_npc
COPY crates/bevy_quests crates/bevy_quests
COPY crates/bevy_skills crates/bevy_skills
COPY crates/bevy_chat crates/bevy_chat
COPY crates/bevy_mapdb crates/bevy_mapdb
COPY crates/bevy_pathfinder crates/bevy_pathfinder
COPY crates/bevy_db crates/bevy_db
COPY crates/bevy_dungeon crates/bevy_dungeon
# bevy_db carries an optional path dep on bevy_tasker behind the
# "bevy-plugin" feature; cargo reads the dep manifest even when the
# feature is off, so the source must exist on disk in this stage too
# (planner stage already copies it — see #10668).
COPY crates/bevy_tasker crates/bevy_tasker

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo build --release -p kbve -p jedi -p holy -p bevy_inventory -p bevy_items -p bevy_behavior -p bevy_battle -p bevy_npc -p bevy_quests -p bevy_skills -p bevy_chat -p bevy_mapdb -p bevy_pathfinder -p bevy_db -p bevy_dungeon

# ============================================================================
# [STAGE D] - Build Application
# ============================================================================
FROM foundation AS builder

# Ensure make is available for tikv-jemalloc-sys compilation (build from source)
RUN dpkg -s make >/dev/null 2>&1 || \
    (apt-get update && apt-get install -y --no-install-recommends make && rm -rf /var/lib/apt/lists/*)

# Foundation crate source (cargo needs source to verify fingerprints)
COPY packages/data/proto packages/data/proto
COPY crates/jedi crates/jedi
COPY crates/kbve-proto crates/kbve-proto
COPY crates/bevy_dialogue crates/bevy_dialogue
COPY crates/holy-derive crates/holy-derive
COPY packages/proto packages/proto
COPY crates/holy crates/holy
COPY crates/kbve crates/kbve
COPY crates/bevy_inventory crates/bevy_inventory
COPY crates/bevy_items crates/bevy_items
COPY crates/bevy_behavior crates/bevy_behavior
COPY crates/bevy_battle crates/bevy_battle
COPY crates/bevy_npc crates/bevy_npc
COPY crates/bevy_quests crates/bevy_quests
COPY crates/bevy_skills crates/bevy_skills
COPY crates/bevy_chat crates/bevy_chat
COPY crates/bevy_mapdb crates/bevy_mapdb
COPY crates/bevy_pathfinder crates/bevy_pathfinder
COPY crates/bevy_db crates/bevy_db
COPY crates/bevy_dungeon crates/bevy_dungeon
# bevy_db -> bevy_tasker (optional path dep, gated on bevy-plugin feature)
COPY crates/bevy_tasker crates/bevy_tasker

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
