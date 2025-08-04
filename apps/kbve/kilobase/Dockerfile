####################
# Stage 1 - Setup Postgres PPA (Use Noble Ubuntu + Supabase Postgres as the base image, which includes PostgreSQL 15.1.x)
####################
FROM supabase/postgres:17.4.1.068 AS kilobase

# Add PostgreSQL PPA and install PostgreSQL development files
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg \
    wget \
    ca-certificates \
    && echo "deb http://apt.postgresql.org/pub/repos/apt noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - \
    && apt-get update && apt-get install -y --no-install-recommends \
    postgresql-server-dev-17 \
    build-essential \
    clang \
    libclang-dev \
    libreadline-dev \
    zlib1g-dev \
    flex \
    bison \
    libxml2-dev \
    libxslt-dev \
    libssl-dev \
    libxml2-utils \
    xsltproc \
    ccache \
    pkg-config \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Rust and PGRX
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install cargo-pgrx --version 0.15.0 --locked

# Initialize PGRX for PostgreSQL 17
RUN cargo pgrx init --pg17 /usr/lib/postgresql/17/bin/pg_config

# Set up Kilobase extension source code
WORKDIR /app/kbve/kilobase
COPY . .

# Build the Kilobase PostgreSQL extension
RUN cargo pgrx package --pg-config /usr/lib/postgresql/17/bin/pg_config --features pg17 --out-dir='./dist'

# Verify the build output
RUN ls -la ./dist/ && \
    find ./dist/ -name "*.so" -o -name "*.control" -o -name "*.sql" | head -20 && \
    echo "Build verification complete"

####################
# Stage 2 - Setup Postgres PPA
####################
FROM ubuntu:noble AS ppa
ARG postgresql_major=17
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
# Install required dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Add the official PostgreSQL PPA for Ubuntu 24.04 ("noble")
RUN sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -

# Update and install pg_failover_slots from the PPA
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-${postgresql_major}-pg-failover-slots \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

####################
# Stage 3: Copy the pg_failover_slots to the final image (Supabase Postgres)
####################
FROM supabase/postgres:17.4.1.068 AS supabase

ARG postgresql_major=17

LABEL name="CloudNative Supabase Container Images" \
      vendor="KBVE" \
      version="17.4" \
      release="1" \
      summary="PostgreSQL Container images." \
      description="This Docker image contains PostgreSQL, Supabase and Barman Cloud based on Postgres 17.x + Supabase with CloudNativePG"

LABEL org.opencontainers.image.description="This Docker image contains PostgreSQL, Supabase and Barman Cloud based on Postgres 17.x.Supabase"

# Ensure custom extension directory exists
RUN mkdir -p /usr/local/postgres_extensions/
RUN mkdir -p /usr/share/postgresql/extension/
RUN chown -R postgres:postgres /usr/share/postgresql/extension/
RUN chmod 755 /usr/share/postgresql/extension/

# Ensure proper permissions for PostgreSQL
RUN chown -R postgres:postgres /usr/local/postgres_extensions/ && \
    chmod -R 755 /usr/local/postgres_extensions/


# Copy extensions to the CORRECT PostgreSQL paths
RUN echo "=== Copying extensions to correct PostgreSQL paths ===" && \
    PG_LIBDIR=$(pg_config --pkglibdir) && \
    PG_SHAREDIR=$(pg_config --sharedir) && \
    echo "PostgreSQL lib directory: $PG_LIBDIR" && \
    echo "PostgreSQL share directory: $PG_SHAREDIR" && \
    mkdir -p "$PG_LIBDIR" && \
    mkdir -p "$PG_SHAREDIR/extension"

# Copy pg_failover_slots extension files to CORRECT locations
COPY --from=ppa /usr/lib/postgresql/${postgresql_major}/lib/pg_failover_slots.so /tmp/pg_failover_slots.so
COPY --from=ppa /usr/share/postgresql/${postgresql_major}/extension/pg_failover_slots* /tmp/
RUN PG_LIBDIR=$(pg_config --pkglibdir) && \
    PG_SHAREDIR=$(pg_config --sharedir) && \
    cp /tmp/pg_failover_slots.so "$PG_LIBDIR/" && \
    cp /tmp/pg_failover_slots* "$PG_SHAREDIR/extension/" && \
    chown postgres:postgres "$PG_LIBDIR/pg_failover_slots.so" && \
    chown postgres:postgres "$PG_SHAREDIR/extension/pg_failover_slots"* && \
    chmod 755 "$PG_LIBDIR/pg_failover_slots.so" && \
    chmod 644 "$PG_SHAREDIR/extension/pg_failover_slots"*

# Copy kilobase extension files to CORRECT locations  
COPY --from=kilobase /app/kbve/kilobase/dist/usr/lib/postgresql/${postgresql_major}/lib/kilobase.so /tmp/kilobase.so
COPY --from=kilobase /app/kbve/kilobase/dist/usr/share/postgresql/${postgresql_major}/extension/kilobase* /tmp/
RUN PG_LIBDIR=$(pg_config --pkglibdir) && \
    PG_SHAREDIR=$(pg_config --sharedir) && \
    cp /tmp/kilobase.so "$PG_LIBDIR/" && \
    cp /tmp/kilobase* "$PG_SHAREDIR/extension/" && \
    chown postgres:postgres "$PG_LIBDIR/kilobase.so" && \
    chown postgres:postgres "$PG_SHAREDIR/extension/kilobase"* && \
    chmod 755 "$PG_LIBDIR/kilobase.so" && \
    chmod 644 "$PG_SHAREDIR/extension/kilobase"*

# Verify extensions are in the correct locations
RUN echo "=== Verifying extension locations ===" && \
    PG_LIBDIR=$(pg_config --pkglibdir) && \
    PG_SHAREDIR=$(pg_config --sharedir) && \
    echo "Checking $PG_LIBDIR:" && \
    ls -la "$PG_LIBDIR/kilobase.so" "$PG_LIBDIR/pg_failover_slots.so" && \
    echo "Checking $PG_SHAREDIR/extension:" && \
    ls -la "$PG_SHAREDIR/extension/kilobase"* "$PG_SHAREDIR/extension/pg_failover_slots"* && \
    echo "Extensions verified in correct locations"

####################
# Stage Nani:
####################

# Install necessary utilities like wget and gnupg before adding the PostgreSQL PPA
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg \
    wget \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Add the PostgreSQL PPA and import the key

RUN sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ noble-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -

# Update and install barman-cli-cloud from the PostgreSQL PPA
RUN apt-get update && apt-get install -y --no-install-recommends \
    barman-cli-cloud

# Clean up unnecessary files to reduce image size
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Configuration is handled by CNPG cluster spec, not base postgresql.conf

# Verify the postgres user UID/GID from base image
RUN echo "Postgres user info:" && \
    id postgres && \
    echo "Postgres UID/GID verified"

USER postgres