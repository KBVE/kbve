FROM ghcr.io/kbve/kbve:main as kbve

# ! MUSL Build - Failed
#RUN apt-get install -y musl-tools musl-dev
#RUN rustup target add x86_64-unknown-linux-musl

SHELL ["/bin/bash", "-c"]

# ! MUSL Build - Failed
#ENV RUSTFLAGS="-C target-feature=+crt-static"
#RUN pnpm nx build rust_api_profile --release --target=x86_64-unknown-linux-musl

RUN pnpm nx build rust_api_profile --release

COPY . .

# Final

FROM ubuntu:22.04

WORKDIR /usr/src/app

COPY --from=kbve /usr/src/app/dist/target/rust_api_profile/release/rust_api_profile ./rust_api_profile

RUN apt-get update \
      && apt-get install -y --no-install-recommends curl libmysqlclient-dev pkg-config libssl-dev libjemalloc-dev \
      && apt-get autoremove -y \
      && apt-get purge -y --auto-remove \
      && rm -rf /var/lib/apt/lists/*

ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2
#ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:1000,muzzy_decay_ms:1000"
ENV MALLOC_CONF="background_thread:true,dirty_decay_ms:1000,muzzy_decay_ms:1000,lg_tcache_max:16,narenas:4,oversize_threshold:8388608"


EXPOSE 3000
ENTRYPOINT ["./rust_api_profile"]
