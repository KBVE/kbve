#!/usr/bin/env bash
# Rasterize the SVG sources in this directory to the PNG sizes consumed by
# Vanilla MC (server-icon.png at 64x64) and Modrinth (icon at 256x256,
# gallery banner at 468x60). Run after editing kbve-icon.svg / kbve-banner.svg.
#
# Requires ImageMagick 7+ (the `magick` command). On macOS: `brew install imagemagick`.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v magick > /dev/null; then
    echo "magick (ImageMagick 7+) not found — install via 'brew install imagemagick'."
    exit 1
fi

echo "Rendering kbve-icon.svg → server-icon.png (64x64)..."
magick -background none -density 300 kbve-icon.svg -resize 64x64 server-icon.png

echo "Rendering kbve-icon.svg → modrinth-icon.png (256x256)..."
magick -background none -density 300 kbve-icon.svg -resize 256x256 modrinth-icon.png

echo "Rendering kbve-banner.svg → modrinth-banner.png (468x60)..."
magick -background none -density 300 kbve-banner.svg -resize 468x60 modrinth-banner.png

echo "Done. Outputs:"
ls -lh server-icon.png modrinth-icon.png modrinth-banner.png
