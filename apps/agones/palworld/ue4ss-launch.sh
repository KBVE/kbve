#!/usr/bin/env bash
set -euo pipefail

STAGE=/palworld/Pal/Binaries/Linux
SERVER="$STAGE/PalServer-Linux-Shipping"
WRAPPER=/palworld/PalServer.sh

test -f /opt/ue4ss/libUE4SS.so
test -x "$SERVER"
test -f "$WRAPPER"

mkdir -p "$STAGE/Mods" "$STAGE/UE4SS-crashes" /palworld/chat-relay
install -m 0644 /opt/ue4ss/libUE4SS.so "$STAGE/libUE4SS.so"
install -m 0644 /opt/ue4ss/UE4SS-settings.ini "$STAGE/UE4SS-settings.ini"
cp -a /opt/ue4ss/Mods/. "$STAGE/Mods/"

export PALWORLD_CHAT_LOG="${PALWORLD_CHAT_LOG:-/palworld/chat-relay/chat.log}"
export UE4SS_CRASH_LOG_DIR="$STAGE/UE4SS-crashes"

if ! grep -q 'LD_PRELOAD=.*libUE4SS\.so' "$WRAPPER"; then
    sed -i "s|\"\$UE_PROJECT_ROOT/Pal/Binaries/Linux/PalServer-Linux-Shipping\"|LD_PRELOAD=\"$STAGE/libUE4SS.so\" &|" "$WRAPPER"
fi
grep -q 'LD_PRELOAD=.*libUE4SS\.so' "$WRAPPER"

exec "$@"
