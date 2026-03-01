#!/bin/sh
# Build plugin natively, copy into running dev container, restart
set -e
CONTAINER=${1:-kbve-mc-dev}
PLUGIN_SO="apps/mc/plugins/kbve-mc-plugin/target/release/libkbve_mc_plugin.so"

echo "Building plugin..."
cargo build --release --manifest-path apps/mc/plugins/kbve-mc-plugin/Cargo.toml

echo "Copying plugin to container..."
docker cp "$PLUGIN_SO" "$CONTAINER:/pumpkin/plugins/libkbve_mc_plugin.so"

echo "Restarting container..."
docker restart "$CONTAINER"
echo "Done. Plugin reloaded."
