#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

max_bytes=$((150 * 1024))
status=0

while IFS= read -r -d '' asset; do
    case "$asset" in
    *.webp | *.svg) ;;
    *)
        echo "$asset: raster assets must be webp (svg passes through). See services/cdn/README.md." >&2
        status=1
        continue
        ;;
    esac

    if head -c 42 "$asset" | grep -q 'git-lfs.github.com/spec'; then
        echo "$asset: committed as an LFS pointer. Raw HTTPS serves the pointer text, not the image." >&2
        status=1
        continue
    fi

    bytes=$(wc -c <"$asset")
    if [ "$bytes" -gt "$max_bytes" ]; then
        echo "$asset: ${bytes}B exceeds the ${max_bytes}B ceiling. Downscale it rather than raising this." >&2
        status=1
    fi
done < <(find assets -type f -print0)

if [ "$status" -eq 0 ]; then
    echo "cdn assets ok"
fi

exit "$status"
