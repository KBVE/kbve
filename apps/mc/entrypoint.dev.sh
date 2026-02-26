#!/bin/sh
set -e

if [ -n "$RESOURCE_PACK_URL" ]; then
    sed -i "s|http://localhost:8080/kbve-resource-pack.zip|${RESOURCE_PACK_URL}|g" \
        /pumpkin/config/features.toml
fi

# Dev: tee all output to /pumpkin/logs/ if the directory is mounted
LOG_DIR="/pumpkin/logs"
if [ -d "$LOG_DIR" ]; then
    LOG_FILE="$LOG_DIR/pumpkin-$(date +%Y%m%d-%H%M%S).log"
    echo "[dev] Logging to $LOG_FILE"
    exec /bin/pumpkin "$@" 2>&1 | tee "$LOG_FILE"
else
    exec /bin/pumpkin "$@"
fi
