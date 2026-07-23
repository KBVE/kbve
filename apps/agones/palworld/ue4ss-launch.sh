#!/usr/bin/env bash
set -euo pipefail

STAGE=/palworld/Pal/Binaries/Linux
SERVER="$STAGE/PalServer-Linux-Shipping"

test -f /opt/ue4ss/libUE4SS.so
test -x "$SERVER"

mkdir -p "$STAGE/Mods" "$STAGE/UE4SS-crashes" /palworld/chat-relay
install -m 0755 /opt/ue4ss/libUE4SS.so "$STAGE/libUE4SS.so"
install -m 0755 /opt/ue4ss/run_ue4ss.sh "$STAGE/run_ue4ss.sh"
install -m 0644 /opt/ue4ss/UE4SS-settings.ini "$STAGE/UE4SS-settings.ini"
cp -a /opt/ue4ss/Mods/. "$STAGE/Mods/"

export PALWORLD_CHAT_LOG="${PALWORLD_CHAT_LOG:-/palworld/chat-relay/chat.log}"
export UE4SS_CRASH_LOG_DIR="$STAGE/UE4SS-crashes"

exec "$STAGE/run_ue4ss.sh" \
    --host-executable "$SERVER" \
    "$@"
