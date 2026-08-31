#!/usr/bin/env bash
# extract-debug.sh - restore an encrypted debug-symbol archive into a game build.
#
# The CI job `ci-unreal-build.yml` strips debug files (PDB / .map on Win64,
# .dSYM bundles on Mac, plus Manifest_*.txt on both) out of the payload
# and uploads them as a SEPARATE, PASSWORD-ENCRYPTED artifact, because this repo
# is public and a plaintext symbol artifact would be world-readable.
#
# This script reverses that: decrypt -> unzip -> put every file back at the exact
# relative path it had before the strip.
#
# Usage:
#   ./extract-debug.sh                                  # prompts for everything
#   ./extract-debug.sh <archive.zip.enc> <game-dir>
#   SYMBOL_ARCHIVE_PASSWORD=... ./extract-debug.sh a.enc ./Windows
#
# <game-dir> is the folder holding the game executable - the one with
# chuck.exe + Engine/ + chuck/ on Windows, or <Game>.app on Mac.
set -euo pipefail

die() { echo "error: $*" >&2; exit 1; }

ARCHIVE="${1:-}"
TARGET="${2:-}"

if [ -z "${ARCHIVE}" ]; then
  read -r -p "Path to symbol archive (.zip.enc or .zip): " ARCHIVE
fi
ARCHIVE="${ARCHIVE%\"}"; ARCHIVE="${ARCHIVE#\"}"   # tolerate pasted quotes
[ -f "${ARCHIVE}" ] || die "archive not found: ${ARCHIVE}"

if [ -z "${TARGET}" ]; then
  read -r -p "Path to the game folder to restore into: " TARGET
fi
TARGET="${TARGET%\"}"; TARGET="${TARGET#\"}"
[ -d "${TARGET}" ] || die "game folder not found: ${TARGET}"

command -v unzip >/dev/null 2>&1 || die "unzip not found - install it (apt install unzip / brew install unzip)"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
ZIP="${WORK}/symbols.zip"

case "${ARCHIVE}" in
  *.enc)
    command -v openssl >/dev/null 2>&1 || die "openssl not found - required to decrypt .enc archives"
    if [ -z "${SYMBOL_ARCHIVE_PASSWORD:-}" ]; then
      read -r -s -p "Archive password: " SYMBOL_ARCHIVE_PASSWORD; echo
      export SYMBOL_ARCHIVE_PASSWORD
    fi
    # Must match the encrypt side in ci-unreal-build.yml exactly.
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
      -pass env:SYMBOL_ARCHIVE_PASSWORD \
      -in "${ARCHIVE}" -out "${ZIP}" \
      || die "decrypt failed - wrong password, or the file is not an openssl 'Salted__' archive"
    ;;
  *.zip)
    cp "${ARCHIVE}" "${ZIP}"
    ;;
  *)
    die "expected a .zip.enc or .zip archive, got: ${ARCHIVE}"
    ;;
esac

EXTRACT="${WORK}/extract"
mkdir -p "${EXTRACT}"
unzip -q "${ZIP}" -d "${EXTRACT}" || die "unzip failed - the archive is corrupt or the password was wrong"

# The Mac job zips the container dir itself, the Win64 job zips its contents.
# Normalise: if the archive holds exactly one top-level dir named
# *-symbols / ue5-game-symbols, step into it.
ROOT="${EXTRACT}"
ENTRIES=$(find "${EXTRACT}" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')
if [ "${ENTRIES}" -eq 1 ]; then
  ONLY="$(find "${EXTRACT}" -mindepth 1 -maxdepth 1)"
  case "$(basename "${ONLY}")" in
    *symbols*) [ -d "${ONLY}" ] && ROOT="${ONLY}" ;;
  esac
fi

COUNT=$(find "${ROOT}" -mindepth 1 \( -name '*.dSYM' -prune -print -o -type f -print \) | wc -l | tr -d ' ')
[ "${COUNT}" -gt 0 ] || die "archive is empty - nothing to restore"

echo "Restoring ${COUNT} debug item(s) into ${TARGET}"
# -R (not -L) so symlinks inside .dSYM bundles stay symlinks.
cp -R "${ROOT}/." "${TARGET}/"

echo "Done. Restored:"
find "${ROOT}" -mindepth 1 \( -name '*.dSYM' -prune -print -o -type f -print \) \
  | sed "s|^${ROOT}/|  |"
