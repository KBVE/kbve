#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-ghcr.io/kbve/kasm-void:dev}"
NAME="kasm-void-fullboot-$$"
BOOT_TIMEOUT="${BOOT_TIMEOUT:-120}"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

dump_and_die() {
  echo "FAIL: $1" >&2
  echo "--- docker ps -a (kasm) ---" >&2
  docker ps -a --filter "name=$NAME" >&2 || true
  echo "--- ps inside container ---" >&2
  docker exec "$NAME" bash -c 'ps -eo pid,user,etime,comm,args 2>/dev/null | grep -iE "discord|electron|chrome|cloak|nav_shim|kasmvnc|Xvnc|xvfb" | grep -v grep' >&2 || true
  echo "--- /tmp/discord.log tail ---" >&2
  docker exec "$NAME" bash -c 'tail -30 /tmp/discord.log 2>/dev/null' >&2 || true
  echo "--- /tmp/cloakbrowser.log tail ---" >&2
  docker exec "$NAME" bash -c 'tail -20 /tmp/cloakbrowser.log 2>/dev/null' >&2 || true
  echo "--- container stdout (tail) ---" >&2
  docker logs --tail 80 "$NAME" 2>&1 >&2 || true
  exit 1
}

docker run -d --rm \
  --name "$NAME" \
  --shm-size=512m \
  -e VNC_PW=kbve-smoke-test \
  -e URL_LAUNCHER_TOKEN=kbve-smoke-token \
  "$IMAGE" >/dev/null

deadline=$(( $(date +%s) + BOOT_TIMEOUT ))
discord_ok=0; cloak_ok=0; nav_ok=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  if [ "$nav_ok" = "0" ] && docker exec "$NAME" bash -c 'curl -fsS http://127.0.0.1:9998/healthz' >/dev/null 2>&1; then
    nav_ok=1
  fi
  if [ "$cloak_ok" = "0" ] && docker exec "$NAME" pgrep -f '/opt/cloakbrowser/chrome' >/dev/null 2>&1; then
    cloak_ok=1
  fi
  if [ "$discord_ok" = "0" ] && docker exec "$NAME" pgrep -x Discord >/dev/null 2>&1; then
    discord_ok=1
  fi
  if [ "$nav_ok" = "1" ] && [ "$cloak_ok" = "1" ] && [ "$discord_ok" = "1" ]; then
    break
  fi
  sleep 2
done

[ "$nav_ok"     = "1" ] || dump_and_die "nav_shim /healthz never came up within ${BOOT_TIMEOUT}s"
[ "$cloak_ok"   = "1" ] || dump_and_die "cloakbrowser process never appeared within ${BOOT_TIMEOUT}s"
[ "$discord_ok" = "1" ] || dump_and_die "Discord process never appeared within ${BOOT_TIMEOUT}s"

echo "PASS: full kasm session boots nav_shim + cloakbrowser + Discord process"
