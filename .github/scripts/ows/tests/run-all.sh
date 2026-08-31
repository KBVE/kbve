#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
status=0
for t in "${HERE}"/*.test.sh; do
    echo "=== ${t##*/}"
    bash "${t}" || status=1
done
exit "${status}"
