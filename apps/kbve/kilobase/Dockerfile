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

RUN cargo install cargo-pgrx --version "=0.19.2" --locked

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

# pg_durable supplies the durable-execution runtime kilobase schedules against.
# It is built from upstream unmodified, at its own pinned pgrx (0.16.1, not the
# 0.19.2 kilobase uses) in its own cargo root, so the two never share a lock or
# a feature graph. That isolation is the point: pulling its dependency tree
# (duroxide, sqlx, reqwest, tokio) into the workspace would unify features
# across every other crate that resolves the same versions.
#
# No http-allow-* feature is enabled. Those are compile-time only, and the only
# one that would permit arbitrary domains is `http-allow-all`, which upstream
# documents as disabling SSRF protection entirely — including the loopback and
# link-local guards that keep df.http away from cloud metadata and in-cluster
# services. df.http is therefore unavailable; enabling it should come with an
# egress policy, not on its own.
FROM rust:bookworm AS pgdurable

ARG PG_DURABLE_VERSION=v0.2.5

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg2 lsb-release ca-certificates git \
    libclang-dev clang pkg-config libssl-dev && \
    echo "deb http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/pgdg.gpg && \
    apt-get update && apt-get install -y --no-install-recommends postgresql-server-dev-17 && \
    rm -rf /var/lib/apt/lists/*

RUN cargo install cargo-pgrx --version "=0.16.1" --locked

RUN cargo pgrx init --pg17=/usr/bin/pg_config

RUN git clone --depth 1 --branch "${PG_DURABLE_VERSION}" \
        https://github.com/microsoft/pg_durable.git /pgdurable

WORKDIR /pgdurable

RUN cargo pgrx package --pg-config /usr/bin/pg_config && \
    mkdir -p /pgdurable-dist && \
    cp target/release/pg_durable-pg17/usr/lib/postgresql/17/lib/pg_durable.so /pgdurable-dist/ && \
    cp target/release/pg_durable-pg17/usr/share/postgresql/17/extension/pg_durable* /pgdurable-dist/ && \
    cp LICENSE.txt /pgdurable-dist/LICENSE-pg_durable.txt && \
    echo "=== pg_durable build passed ===" && ls -la /pgdurable-dist

####################
# Stage 1: Final image = Supabase base (alpine+nix) with our extensions installed
####################
FROM supabase/postgres:17.6.1.136

USER root

COPY --from=builder /build/target/release/kilobase-pg17 /kilobase-dist
COPY --from=builder /pgfs-dist /pgfs-dist
COPY --from=pgdurable /pgdurable-dist /pgdurable-dist

RUN set -eux; \
    MERGED_LIB="$(dirname "$(dirname "$(readlink -f "$(command -v pg_config)")")")/lib"; \
    PROFILE_LIB="$(readlink -f "$(dirname "$(dirname "$(pg_config --sharedir)")")/lib")"; \
    EXTDIR="$(readlink -f "$(pg_config --sharedir)/extension")"; \
    KILO_SO="$(find /kilobase-dist -name 'kilobase.so' | head -1)"; \
    KILO_CTRL="$(find /kilobase-dist -name 'kilobase.control' | head -1)"; \
    PGFS_SO="$(find /pgfs-dist -name 'pg_failover_slots.so' | head -1)"; \
    PGD_SO="$(find /pgdurable-dist -name 'pg_durable.so' | head -1)"; \
    for D in "$MERGED_LIB" "$PROFILE_LIB"; do \
        test -e "$D/plpgsql.so" || continue; \
        chmod u+w "$D"; \
        cp "$KILO_SO" "$D/"; chmod 755 "$D/kilobase.so"; \
        cp "$PGFS_SO" "$D/"; chmod 755 "$D/pg_failover_slots.so"; \
        cp "$PGD_SO" "$D/"; chmod 755 "$D/pg_durable.so"; \
    done; \
    chmod u+w "$EXTDIR"; \
    cp "$KILO_CTRL" "$EXTDIR/"; \
    find /kilobase-dist -name 'kilobase*.sql' -exec cp {} "$EXTDIR/" \; ; \
    find /pgfs-dist \( -name 'pg_failover_slots*.control' -o -name 'pg_failover_slots*.sql' \) -exec cp {} "$EXTDIR/" \; ; \
    find /pgdurable-dist \( -name 'pg_durable*.control' -o -name 'pg_durable*.sql' \) -exec cp {} "$EXTDIR/" \; ; \
    rm -rf /kilobase-dist /pgfs-dist /pgdurable-dist; \
    echo "=== Final verification ==="; \
    pg_config --version; \
    ls -la "$MERGED_LIB" | grep -E 'kilobase|failover|durable'

USER postgres
