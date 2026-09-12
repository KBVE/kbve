# syntax=docker/dockerfile:1
FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.13-builder AS planner
ENV CARGO_INCREMENTAL=0

# The real workspace root, with `members` narrowed to the crates this image builds.
# A hand-written stub root used to be enough, but since #15165 every member inherits
# `rust-version` from `[workspace.package]` and its dependency versions from
# `[workspace.dependencies]`, and a stub has neither — `cargo metadata` then fails
# before a single crate is compiled.
COPY Cargo.toml /tmp/workspace-root.toml
RUN sed -e '/^members = \[/,/^\]/c\members = ["services/mail", "crates/jedi", "crates/kbve-proto"]' \
        /tmp/workspace-root.toml > Cargo.toml

# Pin dependency resolution to the committed lockfile — without it cargo-chef
# resolves fresh and can pick an uncompilable pairing (e.g. time/time-macros).
COPY Cargo.lock Cargo.lock

COPY services/mail/Cargo.toml services/mail/Cargo.toml
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/kbve-proto/Cargo.toml crates/kbve-proto/Cargo.toml
COPY packages/data/proto/ packages/data/proto/
COPY services/mail/src/ services/mail/src/
COPY crates/jedi/src/ crates/jedi/src/
COPY crates/kbve-proto/src/ crates/kbve-proto/src/

RUN cargo chef prepare --recipe-path recipe.json

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.13-builder AS cook
ENV CARGO_INCREMENTAL=0

COPY Cargo.toml /tmp/workspace-root.toml
RUN sed -e '/^members = \[/,/^\]/c\members = ["services/mail", "crates/jedi", "crates/kbve-proto"]' \
        /tmp/workspace-root.toml > Cargo.toml

COPY Cargo.lock Cargo.lock

COPY services/mail/Cargo.toml services/mail/Cargo.toml
COPY crates/jedi/Cargo.toml crates/jedi/Cargo.toml
COPY crates/kbve-proto/Cargo.toml crates/kbve-proto/Cargo.toml
COPY packages/data/proto/ packages/data/proto/

COPY --from=planner /app/recipe.json recipe.json
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    cargo chef cook --release --recipe-path recipe.json -p mail

FROM cook AS builder

COPY services/mail/Cargo.toml services/mail/Cargo.toml
COPY crates/jedi/ crates/jedi/
COPY crates/kbve-proto/ crates/kbve-proto/
COPY packages/proto packages/proto
COPY services/mail/src/ services/mail/src/
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/sccache,id=sccache \
    touch services/mail/src/main.rs && \
    cargo build --release -p mail && \
    strip target/release/mail

FROM --platform=linux/amd64 ghcr.io/kbve/chisel-ubuntu-axum:24.04.13 AS runtime

COPY --from=builder --chown=10001:10001 /app/target/release/mail /app/mail

ENV HTTP_HOST=0.0.0.0
ENV HTTP_PORT=5600
ENV RUST_LOG=mail=info,tower_http=info

EXPOSE 5600

ENTRYPOINT ["/app/mail"]
