####################
# Stage 0: Build kilobase extension (pgrx) + pg_failover_slots, against pgdg dev-17
####################
FROM rust:bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg2 lsb-release ca-certificates git make \
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
    echo "=== kilobase build passed ==="

# pg_failover_slots: vanilla supabase does NOT ship it, but it is in our
# shared_preload_libraries (HA logical-slot failover) so the image must carry
# the .so. v1.1.0 matches the version the prod image bundles.
RUN git clone --depth 1 --branch v1.1.0 \
        https://github.com/EnterpriseDB/pg_failover_slots.git /pgfs && \
    make -C /pgfs PG_CONFIG=/usr/bin/pg_config && \
    make -C /pgfs install PG_CONFIG=/usr/bin/pg_config && \
    mkdir -p /pgfs-dist && \
    cp "$(/usr/bin/pg_config --pkglibdir)/pg_failover_slots.so" /pgfs-dist/ && \
    (cp "$(/usr/bin/pg_config --sharedir)/extension/"pg_failover_slots* /pgfs-dist/ 2>/dev/null || true) && \
    echo "=== pg_failover_slots build passed ===" && ls -la /pgfs-dist

####################
# Stage 1: Final image = Supabase base (alpine+nix) with our extensions installed
####################
FROM supabase/postgres:17.6.1.136

USER root

COPY --from=builder /build/target/release/kilobase-pg17 /kilobase-dist
COPY --from=builder /pgfs-dist /pgfs-dist

RUN set -eux; \
    MERGED_LIB="$(dirname "$(dirname "$(readlink -f "$(command -v pg_config)")")")/lib"; \
    PROFILE_LIB="$(readlink -f "$(dirname "$(dirname "$(pg_config --sharedir)")")/lib")"; \
    EXTDIR="$(readlink -f "$(pg_config --sharedir)/extension")"; \
    KILO_SO="$(find /kilobase-dist -name 'kilobase.so' | head -1)"; \
    KILO_CTRL="$(find /kilobase-dist -name 'kilobase.control' | head -1)"; \
    PGFS_SO="$(find /pgfs-dist -name 'pg_failover_slots.so' | head -1)"; \
    for D in "$MERGED_LIB" "$PROFILE_LIB"; do \
        test -e "$D/plpgsql.so" || continue; \
        chmod u+w "$D"; \
        cp "$KILO_SO" "$D/"; chmod 755 "$D/kilobase.so"; \
        cp "$PGFS_SO" "$D/"; chmod 755 "$D/pg_failover_slots.so"; \
    done; \
    chmod u+w "$EXTDIR"; \
    cp "$KILO_CTRL" "$EXTDIR/"; \
    find /kilobase-dist -name 'kilobase*.sql' -exec cp {} "$EXTDIR/" \; ; \
    find /pgfs-dist \( -name 'pg_failover_slots*.control' -o -name 'pg_failover_slots*.sql' \) -exec cp {} "$EXTDIR/" \; ; \
    rm -rf /kilobase-dist /pgfs-dist; \
    echo "=== Final verification ==="; \
    pg_config --version; \
    ls -la "$MERGED_LIB" | grep -E 'kilobase|failover'

USER postgres
