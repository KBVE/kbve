ARG RUST_VERSION=1.96

FROM --platform=linux/amd64 rust:${RUST_VERSION}-bookworm AS builder
ENV CARGO_INCREMENTAL=0
WORKDIR /build

COPY apps/agones/palworld/relay/Cargo.workspace.toml Cargo.toml
COPY apps/agones/palworld/relay apps/agones/palworld/relay
COPY packages/rust/jedi packages/rust/jedi

RUN --mount=type=cache,target=/build/target,id=agones-palworld-relay-target \
    --mount=type=cache,target=/usr/local/cargo/registry,id=cargo-registry \
    --mount=type=cache,target=/usr/local/cargo/git,id=cargo-git \
    cargo build --release -p agones-palworld-relay && \
    cp /build/target/release/agones-palworld-relay /agones-palworld-relay && \
    strip /agones-palworld-relay

FROM --platform=linux/amd64 gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /agones-palworld-relay /usr/local/bin/agones-palworld-relay

ENV RUST_LOG=info,agones_palworld_relay=debug \
    PALWORLD_REST_ADDR=http://127.0.0.1:8212 \
    PALWORLD_RCON_ADDR=127.0.0.1:25575 \
    IRC_SERVER=irc.kbve.com \
    IRC_PORT=6697 \
    IRC_USE_TLS=true \
    IRC_NICK=palworld-bot \
    IRC_CHANNEL=#general \
    CLICKHOUSE_DATABASE=gameops

USER nonroot
ENTRYPOINT ["/usr/local/bin/agones-palworld-relay"]
