####################
# Stage 1: Build extensions in matching Nix environment
####################
FROM nixos/nix:latest AS extension-builder

# Enable flakes and experimental features
RUN echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf

# Add unstable channel for latest packages
RUN nix-channel --add https://nixos.org/channels/nixos-unstable nixpkgs
RUN nix-channel --update

# Copy source code
COPY . /app
WORKDIR /app

# Build kilobase extension using the same PostgreSQL version as Supabase
RUN nix-shell -p postgresql_17.dev rustc cargo pkg-config openssl --run " \
  echo '=== Building kilobase extension in Nix environment ===' && \
  pg_config --version && \
  echo 'Library dir:' \$(pg_config --pkglibdir) && \
  echo 'Share dir:' \$(pg_config --sharedir) && \
  cargo pgrx init --pg17 \$(which pg_config) && \
  cargo pgrx package --pg-config \$(which pg_config) --features pg17 --out-dir=./dist && \
  echo '=== Build verification ===' && \
  ls -la ./dist/ && \
  find ./dist/ -name '*.so' -o -name '*.control' -o -name '*.sql' \
"

####################
# Stage 2: Get pg_failover_slots from official PostgreSQL
####################
FROM ubuntu:noble AS pg-extensions

ENV DEBIAN_FRONTEND=noninteractive

# Add PostgreSQL APT repository
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg ca-certificates wget && \
    echo "deb http://apt.postgresql.org/pub/repos/apt noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - && \
    apt-get update

# Install pg_failover_slots
RUN apt-get install -y --no-install-recommends \
    postgresql-17-pg-failover-slots && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

####################
# Stage 3: Final Supabase image with extensions
####################
FROM supabase/postgres:17.4.1.068

# Get PostgreSQL paths dynamically and create directories if needed
RUN PG_LIBDIR=$(pg_config --pkglibdir) && \
    PG_SHAREDIR=$(pg_config --sharedir) && \
    echo "=== PostgreSQL Configuration ===" && \
    echo "Library directory: $PG_LIBDIR" && \
    echo "Share directory: $PG_SHAREDIR" && \
    mkdir -p "$PG_LIBDIR" "$PG_SHAREDIR/extension"

# Copy kilobase extension from Nix builder
COPY --from=extension-builder /app/dist/usr/lib/postgresql/17/lib/kilobase.so /tmp/kilobase.so
COPY --from=extension-builder /app/dist/usr/share/postgresql/17/extension/kilobase* /tmp/

# Copy pg_failover_slots from APT installation
COPY --from=pg-extensions /usr/lib/postgresql/17/lib/pg_failover_slots.so /tmp/pg_failover_slots.so
COPY --from=pg-extensions /usr/share/postgresql/17/extension/pg_failover_slots* /tmp/

# Install extensions to correct PostgreSQL paths
RUN PG_LIBDIR=$(pg_config --pkglibdir) && \
    PG_SHAREDIR=$(pg_config --sharedir) && \
    echo "=== Installing extensions ===" && \
    \
    # Install kilobase
    cp /tmp/kilobase.so "$PG_LIBDIR/" && \
    cp /tmp/kilobase*.control /tmp/kilobase*.sql "$PG_SHAREDIR/extension/" 2>/dev/null || \
    cp /tmp/kilobase* "$PG_SHAREDIR/extension/" && \
    \
    # Install pg_failover_slots
    cp /tmp/pg_failover_slots.so "$PG_LIBDIR/" && \
    cp /tmp/pg_failover_slots*.control /tmp/pg_failover_slots*.sql "$PG_SHAREDIR/extension/" 2>/dev/null || \
    cp /tmp/pg_failover_slots* "$PG_SHAREDIR/extension/" && \
    \
    # Set proper ownership and permissions
    chown postgres:postgres "$PG_LIBDIR"/*.so "$PG_SHAREDIR/extension"/* && \
    chmod 755 "$PG_LIBDIR"/*.so && \
    chmod 644 "$PG_SHAREDIR/extension"/* && \
    \
    # Clean up temp files
    rm -rf /tmp/*.so /tmp/*.control /tmp/*.sql

# Verify extensions are properly installed
RUN PG_LIBDIR=$(pg_config --pkglibdir) && \
    PG_SHAREDIR=$(pg_config --sharedir) && \
    echo "=== Extension verification ===" && \
    echo "Library files:" && \
    ls -la "$PG_LIBDIR" | grep -E "(kilobase|pg_failover)" && \
    echo "Extension files:" && \
    ls -la "$PG_SHAREDIR/extension" | grep -E "(kilobase|pg_failover)" && \
    echo "Extensions successfully installed!"

USER postgres