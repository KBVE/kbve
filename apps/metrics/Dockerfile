# syntax=docker/dockerfile:1
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner
ENV CARGO_INCREMENTAL=0

RUN printf '[workspace]\nmembers = ["apps/metrics", "packages/rust/jedi", "packages/rust/holy", "packages/rust/kbve"]\nresolver = "2"\n' > Cargo.toml

# Pin dependency resolution to the committed lockfile — without it cargo-chef
# resolves fresh and can pick an uncompilable pairing (e.g. time/time-macros).
COPY Cargo.lock Cargo.lock

COPY apps/metrics/Cargo.toml apps/metrics/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/holy/Cargo.toml packages/rust/holy/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/data/proto/ packages/data/proto/
COPY apps/metrics/src/ apps/metrics/src/
COPY packages/rust/jedi/src/ packages/rust/jedi/src/
COPY packages/rust/holy/src/ packages/rust/holy/src/
COPY packages/rust/kbve/src/ packages/rust/kbve/src/

RUN cargo chef prepare --recipe-path recipe.json

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS cook
ENV CARGO_INCREMENTAL=0

RUN printf '[workspace]\nmembers = ["apps/metrics", "packages/rust/jedi", "packages/rust/holy", "packages/rust/kbve"]\nresolver = "2"\n' > Cargo.toml

COPY Cargo.lock Cargo.lock

COPY apps/metrics/Cargo.toml apps/metrics/Cargo.toml
COPY packages/rust/jedi/Cargo.toml packages/rust/jedi/Cargo.toml
COPY packages/rust/holy/Cargo.toml packages/rust/holy/Cargo.toml
COPY packages/rust/kbve/Cargo.toml packages/rust/kbve/Cargo.toml
COPY packages/data/proto/ packages/data/proto/

COPY --from=planner /app/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p met

FROM cook AS builder

COPY apps/metrics/Cargo.toml apps/metrics/Cargo.toml
COPY packages/rust/jedi/ packages/rust/jedi/
COPY packages/rust/holy/ packages/rust/holy/
COPY packages/rust/kbve/ packages/rust/kbve/
COPY apps/metrics/src/ apps/metrics/src/
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    touch apps/metrics/src/main.rs && \
    cargo build --release -p met && \
    strip target/release/met

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.3 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/met /app/metrics

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=5500
ENV RUST_LOG=met=info,tower_http=info

EXPOSE 5500

ENTRYPOINT ["/app/metrics"]
