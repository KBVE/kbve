# Stage 1: Builder
FROM python:3.12-slim AS stage1

# Set environment variables for Python and Poetry
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

# Copy and install dependencies using Poetry
COPY pyproject.toml poetry.lock ./
RUN poetry export -f requirements.txt --without-hashes --output requirements.txt \
    && poetry install --no-root --only main

# Stage 2: Final lightweight image using pip
FROM python:3.12-slim AS stage2

# Set environment variables for Python
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Copy the exported requirements and use pip instead of Poetry
COPY --from=stage1 /app/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source code
COPY ./pydiscordsh pydiscordsh
COPY ./main.py main.py

# Expose the port and run the server using Python directly
#EXPOSE 3000
#CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000", "--ws-ping-interval", "25", "--ws-ping-timeout", "5"]

# Stage 3: Final production-ready Ubuntu base image
# FROM ubuntu/python:3.12-24.04_stable AS stage3
FROM al3xos/python-distroless:3.12-debian12 AS stage3

# # Set environment variables
# ENV PYTHONUNBUFFERED=1 \
#     PIP_NO_CACHE_DIR=1

WORKDIR /app

# # Copy the application and Python dependencies from stage2
ENV PYTHONPATH=/usr/local/lib/python3.12/site-packages
COPY --from=stage2 /app/pydiscordsh pydiscordsh
COPY --from=stage2 /app/main.py main.py
COPY --from=stage2 /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=stage2 /usr/local/bin /usr/local/bin


# # Optional: Expose the port and run the server
EXPOSE 3000
ENTRYPOINT ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000", "--ws-ping-interval", "25", "--ws-ping-timeout", "5"]