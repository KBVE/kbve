#!/bin/bash
# find-ue-mac.sh - Auto-detect Unreal Engine installation on macOS
# Returns the path to RunUAT.sh or exits with error

set -euo pipefail

UE_VERSION="${1:-}"

# Common UE installation locations on macOS
SEARCH_PATHS=(
    "/Users/Shared/Epic Games"
    "/Users/Shared/UnrealEngine"
    "$HOME/Library/Application Support/Epic/UnrealEngine"
    "/Applications/Epic Games"
    "/Applications/UnrealEngine"
    "/opt/UnrealEngine"
    "/usr/local/UnrealEngine"
)

# Function to check if a path contains a valid UE installation
check_ue_installation() {
    local base_path="$1"

    if [ ! -d "$base_path" ]; then
        return 1
    fi

    # Look for RunUAT.sh
    local runuat="${base_path}/Engine/Build/BatchFiles/RunUAT.sh"

    if [ -f "$runuat" ] && [ -x "$runuat" ]; then
        echo "$runuat"
        return 0
    fi

    return 1
}

# Function to get UE version from installation
get_ue_version() {
    local ue_path="$1"
    local version_file="${ue_path}/Engine/Build/Build.version"

    if [ -f "$version_file" ]; then
        # Extract MajorVersion.MinorVersion.PatchVersion
        python3 -c "
import json, sys
with open('$version_file') as f:
    v = json.load(f)
    print(f\"{v.get('MajorVersion', 0)}.{v.get('MinorVersion', 0)}.{v.get('PatchVersion', 0)}\")
" 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

echo "::group::Searching for Unreal Engine installation"

# If version is specified, look for version-specific paths first
if [ -n "$UE_VERSION" ]; then
    echo "Looking for UE version: $UE_VERSION"

    # Check version-specific paths
    for base in "${SEARCH_PATHS[@]}"; do
        # Try UE_X.Y format
        version_short=$(echo "$UE_VERSION" | cut -d. -f1-2)
        for variant in "UE_${UE_VERSION}" "UE_${version_short}" "UnrealEngine-${UE_VERSION}" "UnrealEngine-${version_short}"; do
            candidate="${base}/${variant}"
            if runuat=$(check_ue_installation "$candidate"); then
                detected_version=$(get_ue_version "$candidate")
                echo "::notice::Found UE at: $candidate (version: $detected_version)"
                echo "::endgroup::"
                echo "$runuat"
                exit 0
            fi
        done
    done
fi

# Fallback: search all common paths
echo "Searching all common installation paths..."
for base in "${SEARCH_PATHS[@]}"; do
    if [ -d "$base" ]; then
        # Check the base path itself
        if runuat=$(check_ue_installation "$base"); then
            detected_version=$(get_ue_version "$base")
            echo "::notice::Found UE at: $base (version: $detected_version)"
            echo "::endgroup::"
            echo "$runuat"
            exit 0
        fi

        # Check subdirectories (e.g., UE_5.7, UE_5.4, etc.)
        for subdir in "$base"/*; do
            if [ -d "$subdir" ]; then
                if runuat=$(check_ue_installation "$subdir"); then
                    detected_version=$(get_ue_version "$subdir")
                    echo "::notice::Found UE at: $subdir (version: $detected_version)"
                    echo "::endgroup::"
                    echo "$runuat"
                    exit 0
                fi
            fi
        done
    fi
done

echo "::endgroup::"
echo "::error::Unreal Engine not found. Searched paths: ${SEARCH_PATHS[*]}"
echo "::error::Please install Unreal Engine or set a custom installation path."
exit 1
