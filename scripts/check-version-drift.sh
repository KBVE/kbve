#!/usr/bin/env bash
# check-version-drift.sh — 3-way version drift check for all 27 CI registry items.
#
# Compares: source (Cargo.toml/package.json/pyproject.toml/.uplugin)
#        vs version.toml (last-published marker)
#        vs registry (npm, crates.io, PyPI, GHCR)
#
# Unreal plugins are not checked against a remote registry (itch.io requires auth).
#
# Usage:  ./scripts/check-version-drift.sh [--local]
#   --local   Skip remote registry checks (fast, offline)
#
# Exit code 0 = no drift, 1 = drift detected.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECK_REMOTE=true
[[ "${1:-}" == "--local" ]] && CHECK_REMOTE=false

DRIFT=0
TOTAL=0
SYNCED=0
DRIFTED=0
PENDING=0
SKIPPED=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ---------------------------------------------------------------------------
# Version extractors
# ---------------------------------------------------------------------------
extract_version() {
    local file="$1" type="$2"
    [ -f "$file" ] || { echo ""; return; }
    case "$type" in
        cargo)   grep -m1 '^version' "$file" | sed 's/version *= *"\(.*\)"/\1/' ;;
        npm)     grep -m1 '"version"' "$file" | sed 's/.*"version": *"\(.*\)".*/\1/' ;;
        python)  grep -m1 '^version' "$file" | sed 's/version *= *"\(.*\)"/\1/' ;;
        uplugin) grep -m1 '"VersionName"' "$file" | sed 's/.*"VersionName": *"\(.*\)".*/\1/' ;;
        toml)    grep -m1 '^version' "$file" | sed 's/version *= *"\(.*\)"/\1/' ;;
    esac
}

# ---------------------------------------------------------------------------
# Remote registry lookups (return published version or "?" on failure)
# ---------------------------------------------------------------------------
fetch_npm_version() {
    local pkg="$1"
    curl -sf --max-time 5 "https://registry.npmjs.org/${pkg}" 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dist-tags',{}).get('latest','?'))" 2>/dev/null \
        || echo "?"
}

fetch_crates_version() {
    local crate="$1"
    curl -sf --max-time 5 "https://crates.io/api/v1/crates/${crate}" 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('crate',{}).get('max_version','?'))" 2>/dev/null \
        || echo "?"
}

fetch_pypi_version() {
    local pkg="$1"
    curl -sf --max-time 5 "https://pypi.org/pypi/${pkg}/json" 2>/dev/null \
        | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('info',{}).get('version','?'))" 2>/dev/null \
        || echo "?"
}

fetch_ghcr_version() {
    local image="$1"
    curl -sf --max-time 5 "https://ghcr.io/v2/${image}/tags/list" \
        -H "Authorization: Bearer $(printf '{}' | base64)" 2>/dev/null \
        | python3 -c "
import sys, json, re
d = json.load(sys.stdin)
tags = [t for t in d.get('tags', []) if re.match(r'^\d+\.\d+\.\d+$', t)]
tags.sort(key=lambda v: list(map(int, v.split('.'))))
print(tags[-1] if tags else '?')
" 2>/dev/null || echo "?"
}

# ---------------------------------------------------------------------------
# Main check function
# ---------------------------------------------------------------------------
# Args: name pipeline source_file source_type version_toml registry_name ghcr_image
check_item() {
    local name="$1" pipeline="$2" source_file="$3" source_type="$4" version_toml="$5"
    local registry_name="${6:-}" ghcr_image="${7:-}"
    TOTAL=$((TOTAL + 1))

    local src_path="$REPO_ROOT/$source_file"
    local vtoml_path="$REPO_ROOT/$version_toml"

    # Skip items with no source file (e.g. kilobase)
    if [ -z "$source_file" ] || [ ! -f "$src_path" ]; then
        printf "  ${YELLOW}SKIP${RESET}  %-20s  %s\n" "$name" "no version source"
        SKIPPED=$((SKIPPED + 1))
        return
    fi

    # Local versions
    local src_ver vtoml_ver
    src_ver=$(extract_version "$src_path" "$source_type")
    if [ -f "$vtoml_path" ]; then
        vtoml_ver=$(extract_version "$vtoml_path" "toml")
    else
        vtoml_ver="-"
    fi

    if [ -z "$src_ver" ]; then
        printf "  ${YELLOW}SKIP${RESET}  %-20s  could not parse source version\n" "$name"
        SKIPPED=$((SKIPPED + 1))
        return
    fi

    # Remote version
    local remote_ver="-"
    if $CHECK_REMOTE && [ -n "$registry_name" ]; then
        case "$pipeline" in
            docker)  remote_ver=$(fetch_ghcr_version "$ghcr_image") ;;
            npm)     remote_ver=$(fetch_npm_version "$registry_name") ;;
            crates)  remote_ver=$(fetch_crates_version "$registry_name") ;;
            python)  remote_ver=$(fetch_pypi_version "$registry_name") ;;
        esac
    fi

    # Determine status
    # Primary invariant: version.toml MUST match the registry (it tracks what was published).
    # Secondary: source != registry means a publish is pending (informational, not an error).
    local has_drift=false
    local toml_registry_drift=false
    local pending_publish=false

    if [ "$remote_ver" != "-" ] && [ "$remote_ver" != "?" ]; then
        # Registry available — version.toml must match it
        if [ "$vtoml_ver" != "$remote_ver" ]; then
            toml_registry_drift=true
            has_drift=true
        fi
        if [ "$src_ver" != "$remote_ver" ]; then
            pending_publish=true
        fi
    else
        # No registry check — fall back to local comparison
        if [ "$src_ver" != "$vtoml_ver" ] && [ "$vtoml_ver" != "-" ]; then
            has_drift=true
        fi
    fi

    # Build display
    local src_display="src=${BOLD}${src_ver}${RESET}"
    local vtoml_display="toml=${BOLD}${vtoml_ver}${RESET}"
    local remote_display=""
    if [ "$remote_ver" != "-" ]; then
        remote_display="  reg=${BOLD}${remote_ver}${RESET}"
    fi

    if $has_drift; then
        if $toml_registry_drift; then
            printf "  ${RED}DRIFT${RESET} %-20s  toml=${BOLD}%s${RESET} != reg=${BOLD}%s${RESET}  src=${BOLD}%s${RESET}\n" \
                "$name" "$vtoml_ver" "$remote_ver" "$src_ver"
        else
            printf "  ${RED}DRIFT${RESET} %-20s  src=${BOLD}%s${RESET}  toml=${BOLD}%s${RESET}\n" \
                "$name" "$src_ver" "$vtoml_ver"
        fi
        DRIFTED=$((DRIFTED + 1))
        DRIFT=1
    elif $pending_publish; then
        printf "  ${YELLOW} PUB${RESET}  %-20s  src=${BOLD}%s${RESET} > reg=${BOLD}%s${RESET}  ${DIM}(publish pending)${RESET}\n" \
            "$name" "$src_ver" "$remote_ver"
        PENDING=$((PENDING + 1))
    else
        if [ "$remote_ver" != "-" ] && [ "$remote_ver" != "?" ]; then
            printf "  ${GREEN}  OK${RESET}  %-20s  %s  ${DIM}(registry confirmed)${RESET}\n" "$name" "$src_ver"
        else
            printf "  ${GREEN}  OK${RESET}  %-20s  %s\n" "$name" "$src_ver"
        fi
        SYNCED=$((SYNCED + 1))
    fi
}

# ---------------------------------------------------------------------------
# Run checks
# ---------------------------------------------------------------------------
echo ""
if $CHECK_REMOTE; then
    printf "${BOLD}Version Drift Check (local + remote registries)${RESET}\n"
else
    printf "${BOLD}Version Drift Check (local only, use without --local for registry checks)${RESET}\n"
fi
echo ""

printf "${BOLD}${CYAN}=== Docker Apps (GHCR) ===${RESET}\n"
#          name            pipeline  source_file                                    type   version_toml                        registry_name  ghcr_image
check_item "axum-kbve"     docker   "apps/kbve/axum-kbve/Cargo.toml"               cargo  "apps/kbve/axum-kbve/version.toml"  "ghcr"         "kbve/kbve"
check_item "herbmail"      docker   "apps/herbmail/axum-herbmail/Cargo.toml"        cargo  "apps/herbmail/version.toml"        "ghcr"         "kbve/herbmail"
check_item "memes"         docker   "apps/memes/axum-memes/Cargo.toml"             cargo  "apps/memes/version.toml"           "ghcr"         "kbve/memes"
check_item "irc-gateway"   docker   "apps/irc/irc-gateway/Cargo.toml"              cargo  "apps/irc/version.toml"             "ghcr"         "kbve/irc-gateway"
check_item "discordsh"     docker   "apps/discordsh/axum-discordsh/Cargo.toml"     cargo  "apps/discordsh/version.toml"       "ghcr"         "kbve/discordsh"
check_item "mc"            docker   "apps/mc/plugins/kbve-mc-plugin/Cargo.toml"    cargo  "apps/mc/version.toml"              "ghcr"         "kbve/mc"
check_item "edge"          docker   "apps/kbve/edge/version.toml"                  toml   "apps/kbve/edge/version.toml"       "ghcr"         "kbve/edge"
check_item "cryptothrone"  docker   "apps/cryptothrone/axum-cryptothrone/Cargo.toml" cargo "apps/cryptothrone/version.toml"    "ghcr"         "kbve/cryptothrone"
check_item "kilobase"      docker   ""                                             cargo  ""                                  ""             ""

echo ""
printf "${BOLD}${CYAN}=== NPM Packages ===${RESET}\n"
check_item "droid"         npm      "packages/npm/droid/package.json"              npm    "packages/npm/droid/version.toml"      "@kbve/droid"      ""
check_item "laser"         npm      "packages/npm/laser/package.json"              npm    "packages/npm/laser/version.toml"      "@kbve/laser"      ""
check_item "devops"        npm      "packages/npm/devops/package.json"             npm    "packages/npm/devops/version.toml"     "@kbve/devops"     ""
check_item "khashvault"    npm      "packages/npm/khashvault/package.json"         npm    "packages/npm/khashvault/version.toml" "@kbve/khashvault"  ""

echo ""
printf "${BOLD}${CYAN}=== Rust Crates ===${RESET}\n"
check_item "q"             crates   "packages/rust/q/Cargo.toml"                  cargo  "packages/rust/q/version.toml"      "q"      ""
check_item "jedi"          crates   "packages/rust/jedi/Cargo.toml"               cargo  "packages/rust/jedi/version.toml"   "jedi"   ""
check_item "soul"          crates   "packages/rust/soul/Cargo.toml"               cargo  "packages/rust/soul/version.toml"   "soul"   ""
check_item "kbve"          crates   "packages/rust/kbve/Cargo.toml"               cargo  "packages/rust/kbve/version.toml"   "kbve"   ""
check_item "erust"         crates   "packages/rust/erust/Cargo.toml"              cargo  "packages/rust/erust/version.toml"  "erust"  ""
check_item "holy"          crates   "packages/rust/holy/Cargo.toml"               cargo  "packages/rust/holy/version.toml"   "holy"   ""

echo ""
printf "${BOLD}${CYAN}=== Python Packages (PyPI) ===${RESET}\n"
check_item "fudster"       python   "packages/python/fudster/pyproject.toml"      python "packages/python/fudster/version.toml" "fudster" ""
check_item "kbve-py"       python   "packages/python/kbve/pyproject.toml"         python "packages/python/kbve/version.toml"   "kbve"    ""

echo ""
printf "${BOLD}${CYAN}=== Unreal Plugins (local only) ===${RESET}\n"
check_item "KBVEXXHash"   unreal   "packages/unreal/KBVEXXHash/KBVEXXHash.uplugin"  uplugin "packages/unreal/KBVEXXHash/version.toml" "" ""
check_item "KBVEYYJson"   unreal   "packages/unreal/KBVEYYJson/KBVEYYJson.uplugin"  uplugin "packages/unreal/KBVEYYJson/version.toml" "" ""
check_item "KBVEZstd"     unreal   "packages/unreal/KBVEZstd/KBVEZstd.uplugin"      uplugin "packages/unreal/KBVEZstd/version.toml"   "" ""
check_item "KBVESQLite"   unreal   "packages/unreal/KBVESQLite/KBVESQLite.uplugin"  uplugin "packages/unreal/KBVESQLite/version.toml" "" ""
check_item "KBVEWASM"     unreal   "packages/unreal/KBVEWASM/KBVEWASM.uplugin"      uplugin "packages/unreal/KBVEWASM/version.toml"   "" ""
check_item "UEDevOps"     unreal   "packages/unreal/UEDevOps/UEDevOps.uplugin"      uplugin "packages/unreal/UEDevOps/version.toml"   "" ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
printf "${BOLD}=== Summary ===${RESET}\n"
printf "  Total: %d  Synced: ${GREEN}%d${RESET}  Drift: ${RED}%d${RESET}  Pending: ${YELLOW}%d${RESET}  Skipped: ${YELLOW}%d${RESET}\n" \
    "$TOTAL" "$SYNCED" "$DRIFTED" "$PENDING" "$SKIPPED"
if $CHECK_REMOTE; then
    printf "  ${DIM}Remote registries: npm, crates.io, PyPI, GHCR${RESET}\n"
fi
echo ""

if [ "$DRIFT" -eq 1 ]; then
    printf "${RED}${BOLD}Version drift detected.${RESET}\n"
    printf "  ${RED}DRIFT${RESET} = version.toml does not match the registry (broken feedback loop)\n"
    printf "  ${YELLOW} PUB${RESET}  = source bumped, publish pending (normal pre-merge state)\n"
    printf "  version.toml must always match what the registry has published.\n"
    echo ""
fi

exit "$DRIFT"
