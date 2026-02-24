FROM rust:1-alpine3.23 AS builder
ENV RUSTFLAGS="-C target-feature=-crt-static"
RUN apk add --no-cache musl-dev git

WORKDIR /pumpkin
COPY ./pumpkin /pumpkin

RUN rustup show active-toolchain || rustup toolchain install
RUN rustup component add rustfmt

# Build Pumpkin server
RUN --mount=type=cache,sharing=private,target=/pumpkin/target \
    --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --release && cp target/release/pumpkin ./pumpkin.release

# Build plugins
COPY ./plugins /plugins
RUN --mount=type=cache,sharing=private,target=/plugins/kbve-mc-plugin/target \
    --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --release --manifest-path /plugins/kbve-mc-plugin/Cargo.toml \
    && mkdir -p /built-plugins \
    && cp /plugins/kbve-mc-plugin/target/release/libkbve_mc_plugin.so /built-plugins/ 2>/dev/null \
    || cp /plugins/kbve-mc-plugin/target/release/libkbve_mc_plugin.dylib /built-plugins/ 2>/dev/null \
    || true

FROM alpine:3.23

COPY --from=builder /pumpkin/pumpkin.release /bin/pumpkin
COPY --from=builder /built-plugins/ /pumpkin/plugins/

WORKDIR /pumpkin

RUN apk add --no-cache libgcc && chown -R 2613:2613 .

ENV RUST_BACKTRACE=1
EXPOSE 25565
USER 2613:2613
ENTRYPOINT [ "/bin/pumpkin" ]
HEALTHCHECK CMD nc -z 127.0.0.1 25565 || exit 1
