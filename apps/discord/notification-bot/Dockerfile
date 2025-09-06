# Stage 1: Builder
FROM python:3.13.7-slim as stage1

# Set environment variables for Python and Poetry
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VERSION=1.8.4 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1

# Install system dependencies and Poetry
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git libsqlite3-0 \
    && curl -sSL https://install.python-poetry.org | python3 - \
    && ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install dependencies using Poetry
COPY pyproject.toml poetry.lock ./
RUN poetry export -f requirements.txt --without-hashes --output requirements.txt \
    && poetry install --no-root --only main


# Stage 2: Final lightweight image using pip
FROM python:3.13.7-slim AS stage2

# Set environment variables for Python
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app


# Copy the exported requirements and use pip instead of Poetry
COPY --from=stage1 /app/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source code
COPY ./notification_bot notification_bot
COPY ./main.py main.py

FROM al3xos/python-distroless:3.13-debian12 AS stage3

COPY --from=stage1 /usr/lib/x86_64-linux-gnu/libsqlite3.so.0 /usr/lib/libsqlite3.so.0

WORKDIR /app

ENV PYTHONPATH=/usr/local/lib/python3.13/site-packages
COPY --from=stage2 /app/notification_bot notification_bot
COPY --from=stage2 /app/main.py main.py
COPY --from=stage2 /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=stage2 /usr/local/bin /usr/local/bin

EXPOSE 3000
ENTRYPOINT ["python3", "-m", "granian", "--interface", "asgi", "--host", "0.0.0.0", "--port", "3000", "--workers", "1", "--blocking-threads", "1", "main:app"]