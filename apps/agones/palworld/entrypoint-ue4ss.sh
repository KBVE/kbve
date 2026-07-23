#!/usr/bin/env bash
set -euo pipefail

STAGE=/palworld/Pal/Binaries/Linux
SERVER="$STAGE/PalServer-Linux-Shipping"
export PALWORLD_CHAT_LOG="${PALWORLD_CHAT_LOG:-/palworld/chat-relay/chat.log}"
mkdir -p "$(dirname "$PALWORLD_CHAT_LOG")"

if [[ ! -x "$SERVER" ]]; then
    exec /palworld/PalServer.sh "$@"
fi

export UE4SS_CRASH_LOG_DIR="$STAGE/UE4SS-crashes"
exec "$STAGE/run_ue4ss.sh" \
    --host-executable "$SERVER" \
    /palworld/PalServer.sh "$@"
