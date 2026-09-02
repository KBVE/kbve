# syntax=docker/dockerfile:1
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS planner
ENV CARGO_INCREMENTAL=0

# The real workspace root, with `members` narrowed to the crates this image builds.
# A hand-written stub root used to be enough, but since #15165 every member inherits
# `rust-version` from `[workspace.package]` and its dependency versions from
# `[workspace.dependencies]`, and a stub has neither — `cargo metadata` then fails
# before a single crate is compiled.
COPY Cargo.toml /tmp/workspace-root.toml
RUN sed -e '/^members = \[/,/^\]/c\members = ["apps/metrics", "crates/jedi", "crates/holy", "crates/kbve"]' \
        /tmp/workspace-root.toml > Cargo.toml

# Pin dependency resolution to the committed lockfile — without it cargo-chef
# resolves fresh and can pick an uncompilable pairing (e.g. time/time-macros).
COPY Cargo.lock Cargo.lock

COPY apps/metrics/Cargo.toml apps/metrics/Cargo.toml
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/holy/Cargo.toml crates/holy/Cargo.toml
COPY crates/kbve/Cargo.toml crates/kbve/Cargo.toml
COPY packages/data/proto/ packages/data/proto/
COPY apps/metrics/src/ apps/metrics/src/
COPY crates/jedi/src/ crates/jedi/src/
COPY crates/holy/src/ crates/holy/src/
COPY crates/kbve/src/ crates/kbve/src/

RUN cargo chef prepare --recipe-path recipe.json

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04-builder AS cook
ENV CARGO_INCREMENTAL=0

# The real workspace root, with `members` narrowed to the crates this image builds.
# A hand-written stub root used to be enough, but since #15165 every member inherits
# `rust-version` from `[workspace.package]` and its dependency versions from
# `[workspace.dependencies]`, and a stub has neither — `cargo metadata` then fails
# before a single crate is compiled.
COPY Cargo.toml /tmp/workspace-root.toml
RUN sed -e '/^members = \[/,/^\]/c\members = ["apps/metrics", "crates/jedi", "crates/holy", "crates/kbve"]' \
        /tmp/workspace-root.toml > Cargo.toml

COPY Cargo.lock Cargo.lock

COPY apps/metrics/Cargo.toml apps/metrics/Cargo.toml
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/holy/Cargo.toml crates/holy/Cargo.toml
COPY crates/kbve/Cargo.toml crates/kbve/Cargo.toml
COPY packages/data/proto/ packages/data/proto/

COPY --from=planner /app/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p met

FROM cook AS builder

COPY apps/metrics/Cargo.toml apps/metrics/Cargo.toml
COPY crates/jedi/ crates/jedi/
COPY crates/holy/ crates/holy/
COPY crates/kbve/ crates/kbve/
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
