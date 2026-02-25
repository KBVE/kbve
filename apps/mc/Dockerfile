FROM rust:1-alpine3.23 AS chef
ENV RUSTFLAGS="-C target-feature=-crt-static"
RUN apk add --no-cache musl-dev git
RUN cargo install cargo-chef --locked
WORKDIR /pumpkin
COPY ./pumpkin /pumpkin
RUN rustup show active-toolchain || rustup toolchain install
RUN rustup component add rustfmt

# --- Pumpkin: plan (only Cargo.toml/lock matter) ---
FROM chef AS planner
RUN cargo chef prepare --recipe-path recipe.json

# --- Cook: compile third-party deps (cached until Cargo.toml/lock changes) ---
FROM chef AS deps
COPY --from=planner /pumpkin/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo chef cook --release --recipe-path recipe.json

# --- Foundation: leaf + data crates (rarely change, cached aggressively) ---
#     cargo-chef cook strips workspace.lints, so restore the real manifests.
#     Full workspace build ensures feature unification is correct.
FROM deps AS foundation
COPY ./pumpkin/Cargo.toml /pumpkin/Cargo.toml
COPY ./pumpkin/Cargo.lock /pumpkin/Cargo.lock
COPY ./pumpkin/pumpkin-nbt /pumpkin/pumpkin-nbt
COPY ./pumpkin/pumpkin-api-macros /pumpkin/pumpkin-api-macros
COPY ./pumpkin/pumpkin-util /pumpkin/pumpkin-util
COPY ./pumpkin/pumpkin-data /pumpkin/pumpkin-data
COPY ./pumpkin/pumpkin-macros /pumpkin/pumpkin-macros
COPY ./pumpkin/pumpkin-config /pumpkin/pumpkin-config
RUN --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --release

# --- Core: engine crates (protocol, world, inventory) ---
FROM foundation AS core
COPY ./pumpkin/pumpkin-world /pumpkin/pumpkin-world
COPY ./pumpkin/pumpkin-protocol /pumpkin/pumpkin-protocol
COPY ./pumpkin/pumpkin-inventory /pumpkin/pumpkin-inventory
RUN --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --release

# --- Pumpkin: build server (parallel with plugin) ---
FROM core AS builder
COPY ./pumpkin/pumpkin /pumpkin/pumpkin
RUN --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --release && cp target/release/pumpkin ./pumpkin.release

# --- Plugin: build (parallel with pumpkin, reuses all pre-compiled crates) ---
FROM core AS plugin-builder
COPY ./pumpkin/pumpkin /pumpkin/pumpkin
COPY ./plugins /plugins
ENV CARGO_TARGET_DIR=/pumpkin/target
RUN --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --release --manifest-path /plugins/kbve-mc-plugin/Cargo.toml \
    && mkdir -p /built-plugins \
    && cp /pumpkin/target/release/libkbve_mc_plugin.so /built-plugins/ 2>/dev/null \
    || cp /pumpkin/target/release/libkbve_mc_plugin.dylib /built-plugins/ 2>/dev/null \
    || true

# --- Resource pack ---
FROM alpine:3.23 AS pack-builder
RUN apk add --no-cache zip coreutils
COPY ./data/resource-pack /resource-pack
RUN cd /resource-pack && zip -r /kbve-resource-pack.zip . -x '.*' -x '__MACOSX/*'
RUN SHA1=$(sha1sum /kbve-resource-pack.zip | awk '{print $1}') && \
    printf '[resource_pack]\nenabled = true\nurl = "http://localhost:8080/kbve-resource-pack.zip"\nsha1 = "%s"\nforce = true\nprompt_message = "KBVE Resource Pack - Custom items and textures"\n\n[networking.rcon]\nenabled = true\naddress = "0.0.0.0:25575"\npassword = "kbve-rcon"\nmax_connections = 5\n' "$SHA1" > /features.toml

# --- Final image ---
FROM alpine:3.23

COPY --from=builder /pumpkin/pumpkin.release /bin/pumpkin
COPY --from=plugin-builder /built-plugins/ /pumpkin/plugins/

WORKDIR /pumpkin

# Bake in custom server config and icon
COPY ./data/config/configuration.toml /pumpkin/config/configuration.toml
COPY ./data/server_icon.png /pumpkin/server_icon.png

# Resource pack: zip served by axum, config for Pumpkin
COPY --from=pack-builder /kbve-resource-pack.zip /pumpkin/resource-pack.zip
COPY --from=pack-builder /features.toml /pumpkin/config/features.toml

RUN apk add --no-cache libgcc && chown -R 2613:2613 .

ENV RUST_BACKTRACE=1
EXPOSE 25565 8080 25575
USER 2613:2613
ENTRYPOINT [ "/bin/pumpkin" ]
HEALTHCHECK CMD nc -z 127.0.0.1 25565 || exit 1
