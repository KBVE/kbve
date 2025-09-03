#!/bin/sh
# Initialize Edge Functions directory structure

# Create function directories
mkdir -p /home/deno/functions/main
mkdir -p /home/deno/functions/vault-reader

# Copy functions from ConfigMap mount to proper locations
if [ -f /home/deno/functions/custom/main-index.ts ]; then
  cp /home/deno/functions/custom/main-index.ts /home/deno/functions/main/index.ts
fi

if [ -f /home/deno/functions/custom/vault-reader-index.ts ]; then
  cp /home/deno/functions/custom/vault-reader-index.ts /home/deno/functions/vault-reader/index.ts
fi

# Start the edge runtime
exec start --main-service /home/deno/functions/main