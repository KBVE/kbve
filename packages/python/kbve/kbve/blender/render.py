"""Render the loaded .blend to a still image.

Runs inside Blender's bundled Python (``bpy``), launched by
:func:`kbve.blender.cli.render_main`. Arguments arrive after the ``--``
separator that Blender uses to end its own argv.

Args: output_path, render_engine, render_device, render_format, samples,
resolution_scale.
"""

import os
import sys

import bpy

argv = sys.argv
argv = argv[argv.index("--") + 1 :] if "--" in argv else []

output_path = argv[0] if len(argv) > 0 else "/tmp/blender-output"
render_engine = argv[1] if len(argv) > 1 else "CYCLES"
render_device = argv[2] if len(argv) > 2 else "GPU"
render_format = argv[3] if len(argv) > 3 else "PNG"
samples = argv[4] if len(argv) > 4 else ""
resolution_scale = int(argv[5]) if len(argv) > 5 else 100

scene = bpy.context.scene
scene.render.engine = render_engine
scene.render.image_settings.file_format = render_format
scene.render.resolution_percentage = resolution_scale
scene.render.filepath = os.path.join(output_path, "render_")

if render_engine == "CYCLES":
    scene.cycles.device = render_device
    if samples:
        scene.cycles.samples = int(samples)
    if render_device == "GPU":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        if hasattr(prefs, "compute_device_type"):
            try:
                prefs.compute_device_type = "METAL"
                prefs.get_devices()
                for device in prefs.devices:
                    if device.type == "METAL":
                        device.use = True
                        print(f"Enabled GPU: {device.name}")
            except Exception:
                print("Metal GPU not available, falling back to CPU")
                scene.cycles.device = "CPU"

print(f"Render Engine: {render_engine}")
print(f"Render Device: {scene.cycles.device if render_engine == 'CYCLES' else 'N/A'}")
print(f"Output Format: {render_format}")
print(f"Resolution: {resolution_scale}%")
print(f"Output Path: {scene.render.filepath}")

bpy.ops.render.render(write_still=True)
print("Render complete")
