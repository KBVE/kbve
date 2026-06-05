#!/usr/bin/env bash
set -eu

mkdir -p /home/kasm-user/.config/discord
SETTINGS=/home/kasm-user/.config/discord/settings.json

python3 - "$SETTINGS" <<'PY'
import json, os, sys
p = sys.argv[1]
try:
    with open(p) as f:
        data = json.load(f)
    if not isinstance(data, dict):
        data = {}
except Exception:
    data = {}
data['SKIP_HOST_UPDATE'] = True
data.setdefault('IS_MAXIMIZED', True)
data.setdefault('IS_MINIMIZED', False)
data.setdefault('trayBalloonShown', True)
data.setdefault('openasmaximized', True)
tmp = p + '.tmp'
with open(tmp, 'w') as f:
    json.dump(data, f, indent=2)
os.replace(tmp, p)
PY

echo "[seed-discord-config] SKIP_HOST_UPDATE=true written to ${SETTINGS}"
