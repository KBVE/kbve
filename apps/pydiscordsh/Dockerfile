# Base image with Python and Poetry pre-installed
FROM python:3.12-slim

# Set environment variables for Poetry and Python
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VERSION=1.8.2 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1

# Install system dependencies and Poetry
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    && curl -sSL https://install.python-poetry.org | python3 - \
    && ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy only the relevant files for dependency installation first
COPY pyproject.toml poetry.lock ./

# Install dependencies with Poetry (including project dependencies)
RUN poetry install --no-root --only main

# Copy the rest of the app code
COPY . .

# Install the project itself (if it's structured as a package)
RUN poetry install --no-dev

# Expose Port
EXPOSE 3000

# Set the default command to run the application
CMD ["poetry", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000", "--ws-ping-interval", "25", "--ws-ping-timeout", "5"]
