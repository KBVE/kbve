FROM rust:1-alpine3.23 AS builder
ENV RUSTFLAGS="-C target-feature=-crt-static"
RUN apk add --no-cache musl-dev git

WORKDIR /pumpkin
COPY ./pumpkin /pumpkin

RUN rustup show active-toolchain || rustup toolchain install
RUN rustup component add rustfmt

RUN --mount=type=cache,sharing=private,target=/pumpkin/target \
    --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --release && cp target/release/pumpkin ./pumpkin.release

FROM alpine:3.23

COPY --from=builder /pumpkin/pumpkin.release /bin/pumpkin

WORKDIR /pumpkin

RUN apk add --no-cache libgcc && chown 2613:2613 .

ENV RUST_BACKTRACE=1
EXPOSE 25565
USER 2613:2613
ENTRYPOINT [ "/bin/pumpkin" ]
HEALTHCHECK CMD nc -z 127.0.0.1 25565 || exit 1
