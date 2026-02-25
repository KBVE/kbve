#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate and install Pillow if missing
source "$VENV_DIR/bin/activate"
python -c "import PIL" 2>/dev/null || pip install --quiet Pillow

# Ensure input/output dirs exist
mkdir -p "$SCRIPT_DIR/input" "$SCRIPT_DIR/output"

# Run the resize script
python "$SCRIPT_DIR/resize.py"
