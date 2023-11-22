# KBVE Monorepo Base Dockerfile
# Use Ubuntu as the base image
FROM ubuntu:latest as kbve
# Set environment variables to non-interactive (this prevents prompts during package installation)
ENV DEBIAN_FRONTEND=noninteractive

# Update and install necessary packages
RUN apt-get update && \
    apt-get install -y curl gnupg2 build-essential libmysqlclient-dev musl-tools && \
    curl -sL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Adding dotnet

RUN apt-get install -y dotnet-sdk-7.0

# Install PNPM
RUN npm install -g pnpm

# Set the working directory
WORKDIR /usr/src/app

# Copy your monorepo content
COPY . .

# Install dependencies
RUN pnpm install

# Setting up bash
SHELL ["/bin/bash", "-c"]

# Install Rust
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y

# Cargo to ENV
ENV PATH="/root/.cargo/bin:${PATH}"

# x86_64-unknown-linux-musl
RUN rustup target add x86_64-unknown-linux-musl

# Nx Report
# RUN pnpm nx build rust_api_profile --release --target x86_64-unknown-linux-musl
RUN pnpm nx build rust_api_profile --release

COPY . .

# Final
FROM scratch
COPY --from=kbve /usr/src/app/dist/target/rust_api_profile/release /release
ENTRYPOINT ["/release/rust_api_profile"]
EXPOSE 3000
