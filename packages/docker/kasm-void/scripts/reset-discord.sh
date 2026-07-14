#!/usr/bin/env bash
set -eu

echo "[reset-discord] stopping Discord"
pkill -f /usr/share/discord/Discord 2>/dev/null || true
pkill -f Discord 2>/dev/null || true
sleep 1
pkill -9 -f Discord 2>/dev/null || true

echo "[reset-discord] clearing per-user runtime cache (keeps login + token in Local Storage)"
for sub in Cache 'Code Cache' GPUCache 'Shared Dictionary'; do
    rm -rf "/home/kasm-user/.config/discord/${sub}" 2>/dev/null || true
done

echo "[reset-discord] re-seeding host-update skip flag"
mkdir -p /home/kasm-user/.config/discord
SETTINGS=/home/kasm-user/.config/discord/settings.json
if [ -f "$SETTINGS" ]; then
    python3 - <<'PY' "$SETTINGS"
import json, sys
p = sys.argv[1]
try:
    data = json.load(open(p))
except Exception:
    data = {}
if not isinstance(data, dict):
    data = {}
data['SKIP_HOST_UPDATE'] = True
data.setdefault('IS_MAXIMIZED', True)
data.setdefault('IS_MINIMIZED', False)
json.dump(data, open(p, 'w'), indent=2)
PY
else
    printf '{\n  "SKIP_HOST_UPDATE": true,\n  "IS_MAXIMIZED": true,\n  "IS_MINIMIZED": false\n}\n' > "$SETTINGS"
fi

echo "[reset-discord] discord_loop supervisor will respawn within ~3s"
echo "Press Enter to close this terminal..."
read -r _
