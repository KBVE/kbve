#!/bin/sh
set -e

if [ -n "$RESOURCE_PACK_URL" ]; then
    sed -i "s|http://localhost:8080/kbve-resource-pack.zip|${RESOURCE_PACK_URL}|g" \
        /pumpkin/config/features.toml
fi

exec /bin/pumpkin "$@"
