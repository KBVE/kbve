FROM ghcr.io/kbve/kbve:main as kbve

SHELL ["/bin/bash", "-c"]

RUN pnpm nx build rust_api_profile --release

COPY . .

# Final

FROM ubuntu:22.04

WORKDIR /usr/src/app

COPY --from=kbve /usr/src/app/dist/target/rust_api_profile/release/rust_api_profile ./rust_api_profile

RUN apt-get update \
      && apt-get install -y --no-install-recommends curl libmysqlclient-dev \
      && apt-get autoremove -y \
      && apt-get purge -y --auto-remove \
      && rm -rf /var/lib/apt/lists/*

EXPOSE 3000
ENTRYPOINT ["./rust_api_profile"]
