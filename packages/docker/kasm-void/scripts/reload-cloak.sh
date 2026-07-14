#!/usr/bin/env bash
set -eu

echo "[reload-cloak] killing cloakbrowser processes"
pkill -f cloakbrowser 2>/dev/null || true
sleep 1
pkill -9 -f cloakbrowser 2>/dev/null || true

rm -f /home/kasm-user/.config/cloakbrowser/SingletonLock 2>/dev/null || true
rm -f /home/kasm-user/.config/cloakbrowser/SingletonSocket 2>/dev/null || true

echo "[reload-cloak] cloak_loop supervisor will respawn within ~3s"
