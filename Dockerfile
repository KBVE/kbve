# KBVE Monorepo Base Dockerfile
# Use Ubuntu as the base image
FROM ubuntu:latest
# Set environment variables to non-interactive (this prevents prompts during package installation)
ENV DEBIAN_FRONTEND=noninteractive

# Update and install necessary packages
RUN apt-get update && \
    apt-get install -y curl gnupg2 && \
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

# Nx Report
RUN pnpm nx build herbmail.com
