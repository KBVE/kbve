"""ARPG sprite-baking toolchain (migrated from apps/agones/arpg/web/scripts).

Console entrypoints (see [project.scripts] in pyproject.toml), run with the
`sprite` extra installed (`uv sync --extra sprite`):

    uv run kbve-skin-variant       --in skin.jpg --out skin_off.jpg
    uv run kbve-sprite-postprocess --dir render_flat --res 512
    uv run kbve-ship-footprint                       # regen ship collision data
    uv run kbve-model-sprites -- --model x.obj ...   # Blender headless baker
"""
