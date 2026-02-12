####################
# Stage 0: Build kilobase extension
####################
FROM rust:bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg2 lsb-release ca-certificates \
    libclang-dev pkg-config libssl-dev && \
    echo "deb http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg && \
    apt-get update && apt-get install -y --no-install-recommends postgresql-server-dev-17 && \
    rm -rf /var/lib/apt/lists/*

RUN cargo install cargo-pgrx --version "=0.16.1" --locked

RUN cargo pgrx init --pg17=/usr/bin/pg_config

WORKDIR /build
COPY . .

RUN cargo pgrx package --pg-config /usr/bin/pg_config --features pg17 && \
    echo "=== Build passed ==="

####################
# Stage 1: Build Supabase PostgreSQL via Nix
####################
FROM nixos/nix:latest AS supabase-nix-builder

RUN echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf

WORKDIR /build
RUN nix-shell -p git --run "git clone https://github.com/supabase/postgres.git supabase-postgres"
WORKDIR /build/supabase-postgres

RUN nix flake show . | head -20

RUN echo "=== Building PostgreSQL 17 with Supabase's Nix system ===" && \
    nix build .#psql_17/bin --out-link /supabase-postgresql && \
    echo "=== Build completed ===" && \
    /supabase-postgresql/bin/pg_config --version

####################
# Stage 2: Combine Supabase PostgreSQL + kilobase artifacts
####################
FROM nixos/nix:latest AS custom-postgresql-builder

COPY --from=supabase-nix-builder /supabase-postgresql /supabase-postgresql
COPY --from=builder /build/target/release/kilobase-pg17 /kilobase-dist
COPY extend-supabase-postgresql.nix /extend-supabase-postgresql.nix

RUN nix-build /extend-supabase-postgresql.nix --out-link /extended-postgresql && \
    echo "=== Extended PostgreSQL built ===" && \
    ls -la /extended-postgresql/lib/ | grep kilobase && \
    ls -la /extended-postgresql/share/postgresql/extension/ | grep kilobase

####################
# Stage 3: Final image based on Supabase with kilobase
####################
FROM supabase/postgres:17.4.1.068

COPY --from=custom-postgresql-builder /extended-postgresql /nix/store/extended-postgresql

ENV PATH="/nix/store/extended-postgresql/bin:$PATH"

RUN CURRENT_PG_STORE=$(readlink -f $(which pg_config) | sed 's|/bin/pg_config||') && \
    echo "=== Integrating extended PostgreSQL ===" && \
    echo "Current PostgreSQL: $CURRENT_PG_STORE" && \
    echo "Extended PostgreSQL: /nix/store/extended-postgresql" && \
    \
    if [ -d "$CURRENT_PG_STORE/lib" ]; then \
        cp /nix/store/extended-postgresql/lib/kilobase.so "$CURRENT_PG_STORE/lib/" 2>/dev/null || \
        mkdir -p "$CURRENT_PG_STORE/lib" && cp /nix/store/extended-postgresql/lib/kilobase.so "$CURRENT_PG_STORE/lib/"; \
    fi && \
    \
    if [ -d "$CURRENT_PG_STORE/share" ]; then \
        cp /nix/store/extended-postgresql/share/postgresql/extension/kilobase* "$CURRENT_PG_STORE/share/postgresql/extension/" 2>/dev/null || \
        mkdir -p "$CURRENT_PG_STORE/share/postgresql/extension" && cp /nix/store/extended-postgresql/share/postgresql/extension/kilobase* "$CURRENT_PG_STORE/share/postgresql/extension/"; \
    fi && \
    \
    chown -R postgres:postgres "$CURRENT_PG_STORE/lib" "$CURRENT_PG_STORE/share" 2>/dev/null || true

RUN echo "=== Final Verification ===" && \
    pg_config --version && \
    PG_LIBDIR=$(pg_config --pkglibdir) && \
    PG_SHAREDIR=$(pg_config --sharedir) && \
    ls -la "$PG_LIBDIR" | grep kilobase && \
    ls -la "$PG_SHAREDIR/extension" | grep kilobase

USER postgres
