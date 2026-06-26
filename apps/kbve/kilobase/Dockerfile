####################
# Stage 0: Build kilobase extension (pgrx, against pgdg server-dev-17)
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
# Stage 1: Final image = Supabase base (alpine+nix) with kilobase installed
####################
FROM supabase/postgres:17.6.1.136

USER root

COPY --from=builder /build/target/release/kilobase-pg17 /kilobase-dist

RUN set -eux; \
    SO="$(find /kilobase-dist -name 'kilobase.so' | head -1)"; \
    CTRL="$(find /kilobase-dist -name 'kilobase.control' | head -1)"; \
    MERGED_LIB="$(dirname "$(dirname "$(readlink -f "$(command -v pg_config)")")")/lib"; \
    PROFILE_LIB="$(readlink -f "$(dirname "$(dirname "$(pg_config --sharedir)")")/lib")"; \
    EXTDIR="$(readlink -f "$(pg_config --sharedir)/extension")"; \
    for D in "$MERGED_LIB" "$PROFILE_LIB"; do \
        test -e "$D/plpgsql.so" || continue; \
        chmod u+w "$D"; cp "$SO" "$D/"; chmod 755 "$D/kilobase.so"; \
    done; \
    chmod u+w "$EXTDIR"; \
    cp "$CTRL" "$EXTDIR/"; \
    find /kilobase-dist -name 'kilobase*.sql' -exec cp {} "$EXTDIR/" \; ; \
    rm -rf /kilobase-dist; \
    echo "=== Final verification ==="; \
    pg_config --version; \
    echo "merged_lib=$MERGED_LIB"; echo "profile_lib=$PROFILE_LIB"; echo "extdir=$EXTDIR"; \
    ls -la "$EXTDIR" | grep kilobase

USER postgres
