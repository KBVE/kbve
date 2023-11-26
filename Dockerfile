# KBVE Monorepo Base Dockerfile
FROM ubuntu:latest as kbve

# Set environment variables to non-interactive (this prevents prompts during package installation)
ENV DEBIAN_FRONTEND=noninteractive

# Update and install necessary packages
RUN apt-get update && \
    apt-get install -y curl gnupg2 build-essential libmysqlclient-dev pkg-config libssl-dev  && \
    curl -sL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Adding dotnet
RUN apt-get install -y dotnet-sdk-7.0

# gcc
#RUN yes | apt install gcc-x86-64-linux-gnu

# MUSL
#RUN apt-get install -y musl-tools musl-dev gcc-i686-linux-gnu

# Install PNPM
RUN npm install -g pnpm

# Setup Rust
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y

# Cargo to ENV
ENV PATH="/root/.cargo/bin:${PATH}"

# Set the working directory
WORKDIR /usr/src/app

# Copy your monorepo content
COPY . .

# Install dependencies
RUN pnpm install

# # Setting up bash
# SHELL ["/bin/bash", "-c"]


# RUN pnpm nx build rust_api_profile --release

COPY . .

#
# # # Final
#

# FROM ubuntu:22.04

# WORKDIR /usr/src/app

# COPY --from=kbve /usr/src/app/dist/target/rust_api_profile/release/rust_api_profile ./rust_api_profile

# RUN apt-get update \
#      && apt-get install -y --no-install-recommends curl libmysqlclient-dev \
#      && apt-get autoremove -y \
#      && apt-get purge -y --auto-remove \
#      && rm -rf /var/lib/apt/lists/*

# EXPOSE 3000
# ENTRYPOINT ["./rust_api_profile"]

# # #
# Chisel by Fernando Silva
# FROM ubuntu:22.04 as OS_BUILDER
# RUN apt-get update && apt-get update && apt-get install -y wget
# WORKDIR /tmp
# RUN wget https://go.dev/dl/go1.21.1.linux-amd64.tar.gz
# RUN tar -xvf go1.21.1.linux-amd64.tar.gz
# RUN mv go /usr/local
# RUN GOBIN=/usr/local/bin/ /usr/local/go/bin/go install github.com/canonical/chisel/cmd/chisel@latest
# WORKDIR /rootfs
# RUN chisel cut --release ubuntu-22.04 --root /rootfs \
#      base-files_base \
#      base-files_release-info \
#      ca-certificates_data \
#      libgcc-s1_libs \
#      libc6_libs \
#      openssl_config
#
#
# FROM scratch
# COPY --from=OS_BUILDER /rootfs /
# COPY --from=kbve /usr/src/app/dist/target/rust_api_profile/release/rust_api_profile ./rust_api_profile
# COPY --from=kbve /usr/lib/x86_64-linux-gnu/libmysqlclient.so.21 /usr/lib/x86_64-linux-gnu/libmysqlclient.so.21
# COPY --from=kbve /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libssl.so.3
# COPY --from=kbve /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3
# EXPOSE 3000
# ENTRYPOINT ["./rust_api_profile"]
# # #
