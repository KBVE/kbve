#!/usr/bin/env bash
set -eu

URL="$(zenity --entry \
    --title='Open URL in CloakBrowser' \
    --text='Enter the URL to navigate to:' \
    --entry-text='https://' 2>/dev/null || true)"

if [ -z "${URL:-}" ]; then
    exit 0
fi

case "$URL" in
    http://*|https://*) ;;
    *)
        zenity --error --no-wrap \
            --title='Open URL' \
            --text="Only http/https URLs are accepted.\nGot: ${URL}" \
            2>/dev/null || true
        exit 1
        ;;
esac

TOKEN="${URL_LAUNCHER_TOKEN:-${VNC_PW:-}}"
SHIM_PORT="${NAV_SHIM_PORT:-9998}"

if [ -n "$TOKEN" ]; then
    if curl -fsS -X POST \
        -H "Authorization: Bearer ${TOKEN}" \
        -H 'Content-Type: application/json' \
        -d "{\"url\": $(printf '%s' "$URL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
        "http://127.0.0.1:${SHIM_PORT}/open" >/dev/null 2>&1; then
        exit 0
    fi
fi

exec /opt/cloakbrowser/cloakbrowser \
    --no-sandbox --start-maximized \
    --user-data-dir=/home/kasm-user/.config/cloakbrowser \
    --new-window "$URL"
