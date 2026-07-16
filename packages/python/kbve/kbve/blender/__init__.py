"""Blender-python toolchain for KBVE game assets.

Runs inside Blender's bundled Python (``bpy``), launched via the thin venv
wrappers in :mod:`kbve.blender.cli`. Current tools:

- ``retarget`` — headless Rokoko retarget from a Mesh2Motion source rig onto a
  Synty SIDEKICK target rig (correctly resolves the A-pose <-> T-pose rest
  difference; needs the Rokoko addon in the launching Blender).
"""
