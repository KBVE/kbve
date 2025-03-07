####################
# Stage 0 - Cargo Chef - removed.
####################

####################
# Stage 1 - Setup Postgres PPA (Use Focal Ubuntu + Supabase Postgres as the base image, which includes PostgreSQL 15.1.x)
####################
FROM supabase/postgres:15.1.1.78 AS kilobase

# Add PostgreSQL PPA and install PostgreSQL development files
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg \
    wget \
    ca-certificates && \
    sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ focal-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - && \
    apt-get update && apt-get install -y \
    postgresql-server-dev-15 \
    build-essential \
    clang-10 \
    libclang-10-dev \
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
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Rust and PGRX
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install cargo-pgrx --version 0.11.3 --locked

# Initialize PGRX for PostgreSQL 15
RUN cargo pgrx init --pg15 /usr/lib/postgresql/15/bin/pg_config

# Set up Kilobase extension source code
WORKDIR /app/kilobase
COPY . .

# Build the Kilobase PostgreSQL extension
RUN cargo pgrx package --pg-config /usr/lib/postgresql/15/bin/pg_config --features pg15 --out-dir='./dist'

####################
# Stage 2 - Setup Postgres PPA
####################
FROM ubuntu:focal AS ppa
ARG postgresql_major=15
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
# Install required dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Add the official PostgreSQL PPA
RUN sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ focal-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -

# Update and install pg_failover_slots from the PPA
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-${postgresql_major}-pg-failover-slots \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

####################
# Stage 3: Copy the pg_failover_slots to the final image (Supabase Postgres)
####################
FROM supabase/postgres:15.1.1.78 AS supabase

ARG postgresql_major=15

LABEL name="CloudNative Supabase Container Images" \
      vendor="KBVE" \
      version="15" \
      release="1" \
      summary="PostgreSQL Container images." \
      description="This Docker image contains PostgreSQL, Supabase and Barman Cloud based on Postgres 15.1.Supabase with CloudNativePG"

LABEL org.opencontainers.image.description="This Docker image contains PostgreSQL, Supabase and Barman Cloud based on Postgres 15.1.Supabase"

COPY --from=ppa /usr/lib/postgresql/${postgresql_major}/lib/pg_failover_slots.so /usr/lib/postgresql/${postgresql_major}/lib/
COPY --from=ppa /usr/share/postgresql/${postgresql_major}/extension/pg_failover_slots* /usr/share/postgresql/${postgresql_major}/extension/

####################
# Stage 3.5: Skipping Stage 1 and copying over the <so> file directly from the ci-cd pipeline
####################

COPY --from=kilobase /app/kilobase/dist/usr/lib/postgresql/15/lib/kilobase.so /usr/lib/postgresql/15/lib/kilobase.so
COPY --from=kilobase /app/kilobase/dist/usr/share/postgresql/15/extension/kilobase* /usr/share/postgresql/15/extension/

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
RUN sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt/ focal-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -

# Update and install barman-cli-cloud from the PostgreSQL PPA
RUN apt-get update && apt-get install -y --no-install-recommends \
    barman-cli-cloud

# Clean up unnecessary files to reduce image size
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*


####################
# Stage 4: Setup Python 3.11
####################
# Add the deadsnakes PPA for Python 3.11
# RUN apt-get update && apt-get install -y software-properties-common curl && \
#     add-apt-repository ppa:deadsnakes/ppa && apt-get update

# # Install Python 3.11 and pip
# RUN apt-get install -y python3.11 python3.11-distutils python3.11-venv

# # Install pip for Python 3.11
# RUN curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11

# # Set Python 3.11 as the default
# RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

####################
# Stage 5: OpenSSL
####################

# Install OpenSSL libraries
# RUN apt-get update && apt-get install -y \
#     libssl3 \
#     libssl-dev \
#     && apt-get clean && \
#     rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

####################
# Stage 6: libc6
####################

# Install libc6
# RUN apt-get update && apt-get install -y libc6

# Create symlink if necessary
# RUN ln -sf /lib/x86_64-linux-gnu/libc.so.6 /lib64/ld-linux-x86-64.so.2

####################
# Stage 7: Install Barman Cloud
####################

# Install Barman Cloud dependencies and Barman itself
# COPY /requirements.txt /

# Execute Barman requirements.txt + OpenSSL
# RUN set -xe; \
# 	apt-get update; \
# 	apt-get install -y --no-install-recommends \
# 		build-essential \
# 		libsnappy-dev \
# 		python3-psycopg2 \
# 		python3-setuptools; \
# 	# Upgrade pip and install requirements
#     python3.11 -m pip install --upgrade pip; \
# 	# We require barman-cloud, install the package with no dependencies
# 	python3.11 -m pip install --no-deps -r requirements.txt; \
#     #python3.11 -m pip install -r requirements.txt; \
# 	# Remove build dependencies to reduce the image size
# 	apt-get remove -y --purge --autoremove \
# 		build-essential \
# 		python3.11-dev \
# 		libsnappy-dev; \
# 	rm -rf /var/lib/apt/lists/*





####################
# Stage Final: Swith User to Postgres UID: 101
####################


RUN usermod -u 101 postgres
USER 101