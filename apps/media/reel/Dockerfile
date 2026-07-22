FROM rust:1-bookworm AS build
WORKDIR /app
COPY . .
RUN cargo build --release -p reel --target-dir /app/target

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/reel /usr/local/bin/reel
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/reel"]
