# Stage 1: Builder
FROM python:3.12-slim as builder

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VERSION=1.8.2 \
    POETRY_HOME="/opt/poetry" \
    POETRY_VIRTUALENVS_IN_PROJECT=true \
    POETRY_NO_INTERACTION=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git \
    && curl -sSL https://install.python-poetry.org | python3 - \
    && ln -s /opt/poetry/bin/poetry /usr/local/bin/poetry \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the entire source code, not just the lock files
COPY . .  

# Export dependencies and compile bytecode
RUN poetry export -f requirements.txt --without-hashes --output requirements.txt \
    && poetry install --no-root --only main \
    && python -m compileall -b .

# Stage 2: Bytecode Extractor
FROM python:3.12-slim as bytecode-extractor

WORKDIR /app
# Copy the entire app including the compiled bytecode
COPY --from=builder /app /app

# Stage 3: Final Lightweight Image
FROM python:3.12-alpine

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Copy everything from the bytecode-extractor stage
COPY --from=bytecode-extractor /app/requirements.txt requirements.txt
COPY --from=bytecode-extractor /app .

# Install dependencies using pip
RUN pip install --no-cache-dir -r requirements.txt

# Confirm the presence of the `main.py` file
RUN ls -la /app/main.py

# Expose the port and run the server using the ASGI app
EXPOSE 3000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000", "--ws-ping-interval", "25", "--ws-ping-timeout", "5"]
