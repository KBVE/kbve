#!/bin/bash
# kbve/apps/kbve/kbve.com/public/data/scripts/outpost/astro_minijinja.sh

set -e

echo "[astro_minijinja] 🛠️  Preparing Astro templates for Minijinja rendering..."

BUILD_DIR="./build"

if [ ! -d "$BUILD_DIR" ]; then
  echo "[astro_minijinja] ❌ Build directory '$BUILD_DIR' not found!"
  exit 1
fi

echo "[astro_minijinja] 📂 Using build directory: $BUILD_DIR"

COUNT=0

for file in $(find "$BUILD_DIR" -name "*.html" -type f); do
  echo "[astro_minijinja] 🔧 Processing $file"
  sed -i.bak -E 's/<!--\s*(INJECT|HEAD|FOOTER):\s*(\{\{.*\}\})\s*KBVE\s*-->/\2/g' "$file"
  rm "${file}.bak"
  COUNT=$((COUNT+1))
done

echo "[astro_minijinja] ✅ Templates prepared! ($COUNT files processed)"
