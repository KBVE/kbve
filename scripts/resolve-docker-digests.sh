#!/usr/bin/env bash
# resolve-docker-digests.sh — Resolve and pin Docker base image digests
#
# Usage: ./scripts/resolve-docker-digests.sh <Dockerfile> [<Dockerfile> ...]
#
# Prerequisites: crane (https://github.com/google/go-containerregistry)
#
# Exit codes:
#   0 — digests changed (Dockerfiles modified in-place)
#   1 — error
#   2 — no changes needed

set -euo pipefail

DOCKERFILES=("$@")
REPORT_FILE="/tmp/digest-report.md"
CHANGES_DETECTED=0

if [ ${#DOCKERFILES[@]} -eq 0 ]; then
    echo "Usage: $0 <Dockerfile> [<Dockerfile> ...]" >&2
    exit 1
fi

if ! command -v crane &>/dev/null; then
    echo "Error: crane is not installed" >&2
    exit 1
fi

declare -A IMAGE_DIGESTS
declare -A IMAGE_ERRORS
declare -A UNIQUE_IMAGES

# Step 1: Collect all unique external base images from all Dockerfiles
for df in "${DOCKERFILES[@]}"; do
    if [ ! -f "$df" ]; then
        echo "Warning: $df not found, skipping" >&2
        continue
    fi

    while IFS= read -r line; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

        # Match FROM lines
        if [[ "$line" =~ ^[Ff][Rr][Oo][Mm][[:space:]] ]]; then
            rest="${line#[Ff][Rr][Oo][Mm] }"
            # Trim leading whitespace
            rest="${rest#"${rest%%[![:space:]]*}"}"

            # Strip --platform=XXX if present
            if [[ "$rest" =~ ^--platform=[^[:space:]]+[[:space:]]+(.*) ]]; then
                rest="${BASH_REMATCH[1]}"
            fi

            # Extract image reference (first token)
            image_ref="${rest%% *}"

            # Strip existing @sha256:... digest
            image_base="${image_ref%%@*}"

            # Skip scratch
            [[ "$image_base" == "scratch" ]] && continue

            # Skip stage aliases: external images always contain "/" or ":"
            if [[ "$image_base" != *"/"* && "$image_base" != *":"* ]]; then
                continue
            fi

            UNIQUE_IMAGES["$image_base"]=1
        fi
    done < "$df"
done

# Step 2: Resolve digests for each unique image
echo "Resolving digests for ${#UNIQUE_IMAGES[@]} unique base images..."
{
    echo "| Image | Digest | Status |"
    echo "|-------|--------|--------|"
} > "$REPORT_FILE"

for image in "${!UNIQUE_IMAGES[@]}"; do
    echo "  Resolving: $image"
    if digest=$(crane digest --platform linux/amd64 "$image" 2>&1); then
        IMAGE_DIGESTS["$image"]="$digest"
        echo "    -> $digest"
        echo "| \`$image\` | \`${digest:0:19}...\` | resolved |" >> "$REPORT_FILE"
    else
        IMAGE_ERRORS["$image"]="$digest"
        echo "    !! FAILED: $digest" >&2
        echo "| \`$image\` | N/A | FAILED |" >> "$REPORT_FILE"
    fi
done

# Step 3: Rewrite Dockerfiles in-place with pinned digests
for df in "${DOCKERFILES[@]}"; do
    [ ! -f "$df" ] && continue

    tmpfile="${df}.tmp"

    while IFS= read -r line || [[ -n "$line" ]]; do
        # Only process FROM lines
        if [[ "$line" =~ ^[Ff][Rr][Oo][Mm][[:space:]] ]]; then
            rest="${line#[Ff][Rr][Oo][Mm] }"
            rest="${rest#"${rest%%[![:space:]]*}"}"

            # Parse platform prefix
            platform_prefix=""
            if [[ "$rest" =~ ^(--platform=[^[:space:]]+)[[:space:]]+(.*) ]]; then
                platform_prefix="${BASH_REMATCH[1]} "
                rest="${BASH_REMATCH[2]}"
            fi

            # Split image ref from alias
            image_ref="${rest%% *}"
            alias_part=""
            if [[ "$rest" == *" "* ]]; then
                alias_part=" ${rest#* }"
            fi

            # Get base image without digest
            image_base="${image_ref%%@*}"

            # Check if we have a digest for this image
            if [[ -n "${IMAGE_DIGESTS[$image_base]+x}" ]]; then
                new_digest="${IMAGE_DIGESTS[$image_base]}"

                # Check if digest changed
                old_digest=""
                if [[ "$image_ref" == *"@"* ]]; then
                    old_digest="${image_ref#*@}"
                fi
                if [[ "$old_digest" != "$new_digest" ]]; then
                    CHANGES_DETECTED=1
                fi

                echo "FROM ${platform_prefix}${image_base}@${new_digest}${alias_part}"
            else
                echo "$line"
            fi
        else
            echo "$line"
        fi
    done < "$df" > "$tmpfile"

    mv "$tmpfile" "$df"
done

# Step 4: Summary
if [ ${#IMAGE_ERRORS[@]} -gt 0 ]; then
    echo ""
    echo "WARNING: ${#IMAGE_ERRORS[@]} images failed to resolve:" >&2
    for image in "${!IMAGE_ERRORS[@]}"; do
        echo "  - $image: ${IMAGE_ERRORS[$image]}" >&2
    done
fi

echo ""
echo "Summary: ${#IMAGE_DIGESTS[@]} resolved, ${#IMAGE_ERRORS[@]} failed"

if [ $CHANGES_DETECTED -eq 1 ]; then
    echo "Digests changed — Dockerfiles updated"
    exit 0
else
    echo "No digest changes detected"
    exit 2
fi
