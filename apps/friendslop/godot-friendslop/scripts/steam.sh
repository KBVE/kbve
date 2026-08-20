#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

TITLE="${1:-}"
OUT_DIR="screenshots/steam"

log() { printf '[steam.sh] %s\n' "$*" >&2; }

ARGS=(src/ui/steam/page_assets.tscn)
if [ -n "$TITLE" ]; then
	ARGS+=(-- "--title=$TITLE")
fi

log "rendering steam assets${TITLE:+ (title: $TITLE)}"
bash scripts/godot.sh "${ARGS[@]}"

EXPECTED=(
	"header_capsule.png 920 430"
	"small_capsule.png 462 174"
	"main_capsule.png 1232 706"
	"vertical_capsule.png 748 896"
	"library_capsule.png 600 900"
	"library_header.png 920 430"
	"library_hero.png 3840 1240"
	"page_background.png 1438 810"
	"event_cover.png 800 450"
	"event_header.png 1920 622"
	"screenshot_01.png 1920 1080"
	"screenshot_02.png 1920 1080"
	"screenshot_03.png 1920 1080"
	"screenshot_04.png 1920 1080"
	"screenshot_05.png 1920 1080"
	"icon_512.png 512 512"
	"app_icon_184.jpg 184 184"
)

img_dims() {
	python3 - "$1" <<'EOF'
import struct, sys
path = sys.argv[1]
with open(path, "rb") as f:
    data = f.read()
if data[:8] == b"\x89PNG\r\n\x1a\n":
    w, h = struct.unpack(">II", data[16:24])
else:
    pos = 2
    while pos < len(data):
        marker, ln = struct.unpack(">HH", data[pos:pos+4])
        if 0xFFC0 <= marker <= 0xFFCF and marker not in (0xFFC4, 0xFFC8, 0xFFCC):
            h, w = struct.unpack(">HH", data[pos+5:pos+9])
            break
        pos += 2 + ln
print(w, h)
EOF
}

FAIL=0
for entry in "${EXPECTED[@]}"; do
	read -r name w h <<<"$entry"
	f="$OUT_DIR/$name"
	if [ ! -f "$f" ]; then
		log "MISSING $f"
		FAIL=1
		continue
	fi
	read -r gw gh <<<"$(img_dims "$f")"
	if [ "$gw" != "$w" ] || [ "$gh" != "$h" ]; then
		log "BAD SIZE $f got ${gw}x${gh} want ${w}x${h}"
		FAIL=1
	else
		log "ok $name ${w}x${h}"
	fi
done

if [ -f "$OUT_DIR/library_logo.png" ]; then
	read -r lw lh <<<"$(img_dims "$OUT_DIR/library_logo.png")"
	if [ "$lw" -gt 1280 ] || [ "$lh" -gt 720 ]; then
		log "BAD SIZE library_logo.png got ${lw}x${lh} max 1280x720"
		FAIL=1
	else
		log "ok library_logo ${lw}x${lh}"
	fi
else
	log "MISSING $OUT_DIR/library_logo.png"
	FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
	log "FAILED — see errors above"
	exit 1
fi
log "all steam assets ready in $OUT_DIR"
