#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/.." && pwd)"

echo "[cook] validating food definitions..."
python3 "${HERE}/validate_foods.py" "${ROOT}/foods"

echo "[cook] Phase 2 cook is not implemented yet." >&2
echo "[cook] Building ChefPaldonYumsay_P.pak requires (see build/README.md):" >&2
echo "  - UE 5.1.x editor + Palworld modkit project (engine-version matched)" >&2
echo "  - vanilla base DataTables extracted from the licensed server paks" >&2
echo "    (/palworld/Pal/Content/Paks/) via repak" >&2
echo "  - UnrealPak to cook + pack into dist/ChefPaldonYumsay_P.pak" >&2
echo "[cook] This runs in CI / a UE build VM, not on a dev box without game files." >&2
exit 2
