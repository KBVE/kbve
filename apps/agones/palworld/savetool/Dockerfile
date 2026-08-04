FROM --platform=linux/amd64 python:3.12-slim-bookworm AS builder
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential && rm -rf /var/lib/apt/lists/*
COPY apps/agones/palworld/savetool/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --prefix=/install -r /app/requirements.txt

FROM --platform=linux/amd64 python:3.12-slim-bookworm
COPY --from=builder /install /usr/local
COPY apps/agones/palworld/savetool/save_intel.py /app/save_intel.py

ENV SAVE_INTEL_SAVE_DIR=/palworld/Pal/Saved/SaveGames \
    SAVE_INTEL_OUT=/intel/bases.json \
    SAVE_INTEL_INTERVAL_S=300 \
    PYTHONUNBUFFERED=1

USER 1000:1000
ENTRYPOINT ["python", "/app/save_intel.py", "--loop"]
