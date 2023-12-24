# KBVE Monorepo Base Dockerfile
FROM ubuntu:latest as kbve

# Set environment variables to non-interactive (this prevents prompts during package installation)
ENV DEBIAN_FRONTEND=noninteractive

# Update and install necessary packages
RUN apt-get update && \
    apt-get install -y curl gnupg2 build-essential libmysqlclient-dev pkg-config libssl-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js and PNPM
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install .NET SDK
RUN apt-get update && \
    apt-get install -y dotnet-sdk-7.0 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Setup Rust
RUN curl https://sh.rustup.rs -sSf | bash -s -- -y

# Cargo to ENV
ENV PATH="/root/.cargo/bin:${PATH}"

# Set the working directory
WORKDIR /usr/src/app

# Copy your monorepo content
COPY package*.json pnpm-lock.yaml nx.json migrations.json ./
COPY ./tools/ ./tools/
# COPY ./scripts/ ./scripts/

# Install dependencies
RUN pnpm install

COPY . .