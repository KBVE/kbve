FROM --platform=linux/amd64 python:3.12-slim-bookworm

COPY apps/agones/palworld/savetool/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY apps/agones/palworld/savetool/save_intel.py /app/save_intel.py

ENV SAVE_INTEL_SAVE_DIR=/palworld/Pal/Saved/SaveGames \
    SAVE_INTEL_OUT=/intel/bases.json \
    SAVE_INTEL_INTERVAL_S=300 \
    PYTHONUNBUFFERED=1

USER 1000:1000
ENTRYPOINT ["python", "/app/save_intel.py", "--loop"]
