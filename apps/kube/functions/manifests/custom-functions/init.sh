#!/bin/sh
# Initialize Edge Functions directory structure

# Create the proper directory structure at /home/deno/functions
mkdir -p /home/deno/functions/main
mkdir -p /home/deno/functions/vault-reader

# Copy functions from ConfigMap mount to proper locations
if [ -f /tmp/functions-config/main-index.ts ]; then
  cp /tmp/functions-config/main-index.ts /home/deno/functions/main/index.ts
  echo "Copied main function to /home/deno/functions/main/index.ts"
fi

if [ -f /tmp/functions-config/vault-reader-index.ts ]; then
  cp /tmp/functions-config/vault-reader-index.ts /home/deno/functions/vault-reader/index.ts
  echo "Copied vault-reader function to /home/deno/functions/vault-reader/index.ts"
fi

# List the functions directory for debugging
echo "Functions directory structure:"
ls -la /home/deno/functions/

# Start the edge runtime
exec edge-runtime start --main-service /home/deno/functions/main