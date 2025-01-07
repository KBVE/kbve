# Stage 1: Builder
FROM python:3.12-slim as builder

# Set environment variables for Poetry and Python
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VERSION=1.8.2 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1

# Install system dependencies and Poetry
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git \
    && curl -sSL https://install.python-poetry.org | python3 - \
    && ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install dependencies
COPY pyproject.toml poetry.lock ./
RUN poetry install --no-root --only main

# Stage 2: Final lightweight image
FROM python:3.12-slim

# Set the same environment variables for consistency
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VERSION=1.8.2 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1

# Copy Poetry from the builder stage
COPY --from=builder /opt/poetry /opt/poetry
COPY --from=builder /usr/local/bin/poetry /usr/local/bin/poetry

WORKDIR /app
# Copy the installed dependencies and the rest of the app
COPY --from=builder /app /app
COPY . .

# Install the app without dev dependencies
RUN poetry install --no-dev

# Expose the port and run the server
EXPOSE 3000
CMD ["poetry", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000", "--ws-ping-interval", "25", "--ws-ping-timeout", "5"]
