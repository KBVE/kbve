#   [STAGE A] - Base Image
FROM --platform=linux/amd64 rust:1.85 AS base
RUN rustup target add x86_64-unknown-linux-gnu \
    && cargo install cargo-chef --version ^0.1
WORKDIR /app

#   [STAGE B] - Planner
FROM --platform=linux/amd64 base AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

#   [STAGE C] - Builder
FROM --platform=linux/amd64 base AS builder
RUN apt-get update && apt-get install -y protobuf-compiler
ENV PROTOC=/usr/bin/protoc

COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --features jemalloc

#   [STAGE D] - Chisel
# Rust Profile Chisel by h0lybyte and special thanks to Fernando Silva for Chisel Go core.
FROM --platform=linux/amd64 ubuntu:24.04 AS os_builder

RUN apt-get update && apt-get update && apt-get install -y wget

WORKDIR /tmp

RUN wget https://go.dev/dl/go1.21.1.linux-amd64.tar.gz

RUN tar -xvf go1.21.1.linux-amd64.tar.gz
RUN mv go /usr/local
RUN GOBIN=/usr/local/bin/ /usr/local/go/bin/go install github.com/canonical/chisel/cmd/chisel@latest
WORKDIR /rootfs
RUN chisel cut --release ubuntu-24.04 --root /rootfs \
        base-files_base \
        base-files_release-info \
        ca-certificates_data \
        libgcc-s1_libs \
        libc6_libs \
        libstdc++6_libs \
        openssl_config

#   [STAGE E] - Jemalloc
FROM --platform=linux/amd64 ubuntu:24.04 AS jemalloc
RUN apt-get update \
      && apt-get install -y --no-install-recommends libjemalloc-dev \
      && apt-get autoremove -y \
      && apt-get purge -y --auto-remove \
      && rm -rf /var/lib/apt/lists/*

#   [STAGE Z] - Release
FROM --platform=linux/amd64 scratch
COPY --from=os_builder /rootfs /
COPY --from=builder /app/target/release/disoxide ./disoxide
COPY --from=jemalloc /usr/lib/x86_64-linux-gnu/libjemalloc.so.2 /usr/lib/x86_64-linux-gnu/libjemalloc.so.2
COPY /build /build
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:1000,muzzy_decay_ms:1000,lg_tcache_max:16,narenas:4,oversize_threshold:8388608"
EXPOSE 3000 8081
ENTRYPOINT ["./disoxide"]