ARG RUST_VERSION=1.84

FROM --platform=linux/amd64 rust:${RUST_VERSION}-bookworm AS builder
ENV CARGO_INCREMENTAL=0
WORKDIR /build

COPY apps/agones/factorio/relay/Cargo.workspace.toml Cargo.toml
COPY apps/agones/factorio/relay apps/agones/factorio/relay

RUN --mount=type=cache,target=/build/target,id=agones-factorio-relay-target \
    --mount=type=cache,target=/usr/local/cargo/registry,id=cargo-registry \
    --mount=type=cache,target=/usr/local/cargo/git,id=cargo-git \
    cargo build --release -p agones-factorio-relay && \
    cp /build/target/release/agones-factorio-relay /agones-factorio-relay && \
    strip /agones-factorio-relay

FROM --platform=linux/amd64 gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /agones-factorio-relay /usr/local/bin/agones-factorio-relay

ENV RUST_LOG=info,agones_factorio_relay=debug \
    FACTORIO_CONSOLE_LOG=/shared/log/console.log \
    FACTORIO_RCON_ADDR=127.0.0.1:27015 \
    IRC_SERVER=irc.kbve.com \
    IRC_PORT=6697 \
    IRC_USE_TLS=true \
    IRC_NICK=factorio-bot \
    IRC_CHANNEL=#general \
    CLICKHOUSE_DATABASE=gameops

USER nonroot
ENTRYPOINT ["/usr/local/bin/agones-factorio-relay"]
