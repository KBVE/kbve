####################
# Stage 1 - Setup Postgres PPA
####################
FROM ubuntu:focal as ppa
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
# Stage 2: Copy the pg_failover_slots to the final image (Supabase Postgres)
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
# Stage 3: Setup Python 3.11
####################
# Add the deadsnakes PPA for Python 3.11
RUN apt-get update && apt-get install -y software-properties-common curl && \
    add-apt-repository ppa:deadsnakes/ppa && apt-get update

# Install Python 3.11 and pip
RUN apt-get install -y python3.11 python3.11-distutils python3.11-venv

# Install pip for Python 3.11
RUN curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11

# Set Python 3.11 as the default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

####################
# Stage 4: Install Barman Cloud
####################

# Install Barman Cloud dependencies and Barman itself
COPY /requirements.txt /

# Execute Barman requirements.txt
RUN set -xe; \
	apt-get update; \
	apt-get install -y --no-install-recommends \
		build-essential \
		libsnappy-dev \
		python3-psycopg2 \
		python3-setuptools; \
	# Upgrade pip and install requirements
    python3.11 -m pip install --upgrade pip; \
	# We require barman-cloud, install the package with no dependencies
	python3.11 -m pip install --no-deps -r requirements.txt; \
	# Remove build dependencies to reduce the image size
	apt-get remove -y --purge --autoremove \
		build-essential \
		python3.11-dev \
		libsnappy-dev; \
	rm -rf /var/lib/apt/lists/*

RUN usermod -u 26 postgres
USER 26