#!/usr/bin/env python3
"""Blender headless 360 sprite-sheet baker for the ARPG iso renderer.

Loads a model (OBJ/FBX) + a skin texture, lays the hull flat on the ground plane,
spins it through N yaw steps under an orthographic isometric camera, and bakes one
transparent PNG per facing — then stitches them into a square sheet and a 1xN strip
that the Phaser `EnvDef` / class rigs read row-major (frame index = facing).

Why "lay flat": many ship/vehicle models import standing upright (nose along the
model's up axis). An env sprite is drawn as an upright screen billboard, so an
upright render reads as a ship standing on its tail. `--pitch` rotates the hull
onto the ground (deck toward +Z) and bakes that into the mesh before the spin, so
each frame reads as a vehicle resting on the iso floor.

Dial the angle interactively first with `preview-model-sprites.html` (same Z-up /
ortho / pitch / yaw math) — it prints the exact flags to paste here.

This module imports `bpy`, so it only runs inside Blender's bundled python. Launch
it via the console entrypoint, which finds Blender and execs it headless:

    uv run kbve-model-sprites -- \
        --model fighter1.obj --skin idolknight.jpg --out render_flat \
        --frames 16 --res 256 --elev 35 --pitch 90 --yaw-offset 0

Or directly: blender -b -P model_sprites.py -- <args>

Single parked frame (no spin): pass --frames 1 with the chosen --yaw-offset.
"""
import argparse
import math
import os
import sys

import bpy
import mathutils


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog="kbve-model-sprites")
    p.add_argument("--model", required=True, help="source .obj or .fbx")
    p.add_argument("--skin", required=True, help="texture image applied to all meshes")
    p.add_argument("--out", required=True, help="output dir (frames + sheet + strip)")
    p.add_argument("--frames", type=int, default=16, help="yaw facings (1 = static)")
    p.add_argument("--res", type=int, default=256, help="px per frame (square)")
    # --- animation (spool-up / takeoff, or hover idle) ---
    p.add_argument("--anim-frames", type=int, default=1,
                   help="animation frames PER facing (1 = static). >1 bakes an animation")
    p.add_argument("--anim-mode",
                   choices=["lift", "idle", "move", "bank", "launch"], default="lift",
                   help="lift=rise once; idle=hover bob loop; move=flying bob+sway loop; "
                        "bank=monotonic roll left->right (turn lean, index by turn-rate); "
                        "launch=cinematic ascent to space (leaving atmosphere; reverse for entering)")
    p.add_argument("--lift", type=float, default=0.6,
                   help="hover height as a fraction of model size (lift target / idle+move+bank base)")
    p.add_argument("--bob", type=float, default=0.06,
                   help="vertical bob amplitude as a fraction of model size (idle/move)")
    p.add_argument("--sway", type=float, default=8.0,
                   help="bank/roll amplitude in degrees (move sway / bank extent)")
    # --- launch (leaving atmosphere) cinematic ---
    p.add_argument("--launch-height", type=float, default=5.0, help="ascent height x model size")
    p.add_argument("--launch-pitch", type=float, default=70.0, help="nose-up pitch deg at apex")
    p.add_argument("--launch-shrink", type=float, default=0.12, help="final scale (fakes distance)")
    p.add_argument("--elev", type=float, default=35.0, help="camera elevation deg (iso pitch); 35=2:1")
    p.add_argument("--pitch", type=float, default=90.0, help="lay-flat hull pitch about X, baked before spin")
    p.add_argument("--yaw-offset", type=float, default=0.0, help="heading added to every frame; sets frame_00")
    p.add_argument("--emit", type=float, default=0.55, help="0=unlit emissive .. 1=pure diffuse shading mix")
    # shadow knobs forwarded to sprite_postprocess.py (fractions of frame size)
    # --- real shadow (Cycles shadow-catcher pass) ---
    p.add_argument("--real-shadow", action="store_true",
                   help="render a TRUE cast shadow (Cycles + ground catcher); overrides the fake 2D shadow")
    p.add_argument("--sun-elev", type=float, default=55.0, help="sun elevation deg (real-shadow)")
    p.add_argument("--sun-az", type=float, default=135.0, help="sun azimuth deg (real-shadow; shadow falls opposite)")
    p.add_argument("--sun-soft", type=float, default=4.0, help="sun angular size deg = penumbra softness")
    p.add_argument("--samples", type=int, default=64, help="Cycles samples (real-shadow)")
    # --- fake 2D shadow (default; post-process) ---
    p.add_argument("--no-shadow", action="store_true", help="skip the baked ground shadow")
    p.add_argument("--shadow-alpha", type=float, default=0.45, help="shadow darkness 0..1")
    p.add_argument("--shadow-blur", type=float, default=0.06, help="shadow blur radius / frame")
    p.add_argument("--shadow-squash", type=float, default=0.7, help="shadow vertical flatten 0..1")
    p.add_argument("--shadow-shear", type=float, default=0.15, help="shadow iso ground skew")
    p.add_argument("--shadow-grow", type=float, default=0.05, help="shadow dilate / frame (rim halo)")
    p.add_argument("--shadow-dx", type=float, default=0.0, help="shadow x offset / frame")
    p.add_argument("--shadow-dy", type=float, default=0.045, help="shadow y offset / frame")
    return p.parse_args(argv)


def main():
    a = parse_args()
    os.makedirs(a.out, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)

    # ---- import ----
    ext = os.path.splitext(a.model)[1].lower()
    if ext == ".obj":
        bpy.ops.wm.obj_import(filepath=a.model)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=a.model)
    else:
        raise SystemExit("unsupported model ext: " + ext)

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("no mesh imported")

    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    obj.location = (0, 0, 0)

    # ---- lay flat: pitch hull onto the ground, then bake into the mesh so the
    # per-frame yaw loop spins a flat hull about world-Z ----
    obj.rotation_euler = (math.radians(a.pitch), 0.0, 0.0)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    # ---- material: emissive (reads bright like a sprite) mixed with a little
    # diffuse so the form still shades ----
    mat = bpy.data.materials.new("skin")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(a.skin)
    bsdf = nt.nodes.new("ShaderNodeBsdfDiffuse")
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = a.emit
    nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], mix.inputs[1])
    nt.links.new(bsdf.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)

    # ---- frame the model ----
    bb = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    xs = [v.x for v in bb]
    ys = [v.y for v in bb]
    zs = [v.z for v in bb]
    size = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    min_z = min(zs)  # hull underside — where the shadow-catcher plane sits

    # Lift animation: the hull rises this many world units over `anim_frames`. The
    # camera + ground stay fixed (so the contact line keeps a constant screen y and
    # one originY works for every frame); we just add headroom above and nudge the
    # framing down so the lifted hull never clips.
    lift_world = a.lift * size if a.anim_frames > 1 else 0.0

    # ---- orthographic iso camera, along -Y lifted by elevation ----
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = (size + lift_world) * 1.6
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    elev = math.radians(a.elev)
    dist = size * 3.0
    base_loc = mathutils.Vector((0.0, -dist * math.cos(elev), dist * math.sin(elev)))
    # shift framing down by moving the camera along its local up (keeps it parallel)
    up = mathutils.Vector((0.0, math.sin(elev), math.cos(elev)))
    cam.location = base_loc + up * (lift_world * 0.5)
    cam.rotation_euler = (math.radians(90.0) - elev, 0.0, 0.0)
    bpy.context.scene.camera = cam

    # ---- sun: straight down at sun_elev=90, tilted toward the horizon otherwise,
    # rotated by azimuth. The cast shadow falls opposite the sun. ----
    light_data = bpy.data.lights.new("sun", "SUN")
    light_data.energy = 3.0
    if a.real_shadow:
        light_data.angle = math.radians(a.sun_soft)  # penumbra
    light = bpy.data.objects.new("sun", light_data)
    light.rotation_euler = (
        math.radians(90.0 - a.sun_elev),
        0.0,
        math.radians(a.sun_az),
    )
    bpy.context.scene.collection.objects.link(light)

    sc = bpy.context.scene
    sc.render.resolution_x = a.res
    sc.render.resolution_y = a.res
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"

    if a.real_shadow:
        # A large plane under the hull, flagged as a Cycles shadow catcher: with a
        # transparent film it contributes ONLY the cast shadow's alpha, so each
        # frame carries the true shadow for that facing + light. No fake 2D pass.
        sc.render.engine = "CYCLES"
        sc.cycles.samples = a.samples
        sc.cycles.use_denoising = True
        bpy.ops.mesh.primitive_plane_add(size=size * 8.0, location=(0.0, 0.0, min_z))
        catcher = bpy.context.active_object
        catcher.is_shadow_catcher = True
        # keep the catcher off the beauty (it only catches shadow)
        catcher.visible_diffuse = False
        catcher.visible_glossy = False
    else:
        engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
        sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"

    # ---- render: outer loop = facing (yaw), inner = anim frame (lift). Frame index
    # is row-major `dir * anim_frames + f`, exactly what Phaser's EnvDef reads
    # (directions rows x frames cols). anim_frames==1 collapses to the static spin. ----
    k = max(1, a.anim_frames)
    paths = []
    total = a.frames * k
    for d in range(a.frames):
        yaw = math.radians(a.yaw_offset + 360.0 * d / a.frames)
        obj.rotation_euler = (0.0, 0.0, yaw)
        for f in range(k):
            phase = 2.0 * math.pi * f / k  # seamless: frame k wraps to 0
            t = f / (k - 1) if k > 1 else 0.0  # 0..1 ramp for non-looping modes
            if a.anim_mode == "idle":
                obj.location.z = lift_world + a.bob * size * math.sin(phase)
            elif a.anim_mode == "move":
                # flying: vertical bob + bank/roll sway (roll about local forward Y,
                # applied before yaw by Blender's XYZ euler = correct bank-then-point).
                # bob lags the sway by 90deg so it reads organic, not mechanical.
                obj.location.z = lift_world + a.bob * size * math.sin(phase + math.pi / 2)
                obj.rotation_euler = (0.0, math.radians(a.sway) * math.sin(phase), yaw)
            elif a.anim_mode == "bank":
                # MONOTONIC roll: frame 0 = hard left .. last = hard right, so the game
                # indexes turn-rate -> frame to HOLD a lean (not a round-trip loop).
                obj.location.z = lift_world
                roll = math.radians(-a.sway + 2.0 * a.sway * t)
                obj.rotation_euler = (0.0, roll, yaw)
            elif a.anim_mode == "launch":
                # cinematic ascent: accelerate up (ease-in t^2), pitch nose to sky,
                # shrink to fake distance. Play forward = leaving; reverse = entering.
                obj.location.z = lift_world + a.launch_height * size * (t * t)
                obj.rotation_euler = (math.radians(a.launch_pitch) * t, 0.0, yaw)
                s = 1.0 - (1.0 - a.launch_shrink) * (t * t)
                obj.scale = (s, s, s)
            else:  # lift
                ease = t * t * (3.0 - 2.0 * t)  # smoothstep spool-up, holds at the top
                obj.location.z = ease * lift_world
            idx = d * k + f
            fp = os.path.join(a.out, f"frame_{idx:03d}.png")
            sc.render.filepath = fp
            bpy.ops.render.render(write_still=True)
            paths.append(fp)
            print(f"rendered {idx + 1}/{total} (dir {d}, lift {f})")

    postprocess(a)
    print("DONE")


def postprocess(a):
    """Bake the ground shadow + stitch the sheet/strip via sprite_postprocess.py.

    That helper needs Pillow, which Blender's bundled python usually lacks, so we
    shell out to the system `python3` (which carries it). Frames are written either
    way; only the shadow + sheet depend on this step.
    """
    import shutil
    import subprocess
    py = shutil.which("python3") or shutil.which("python")
    here = os.path.dirname(os.path.abspath(__file__))
    helper = os.path.join(here, "sprite_postprocess.py")
    if not py or not os.path.exists(helper):
        print("no system python3 / helper for post-process; frames written, sheet skipped.")
        return
    cmd = [py, helper, "--dir", a.out, "--res", str(a.res)]
    if a.anim_frames > 1:
        # row-major layout: one row per facing, one column per anim frame, so
        # Phaser's frame index == dir * anim_frames + f (EnvDef directions x frames).
        cmd += ["--cols", str(a.anim_frames)]
    if a.no_shadow or a.real_shadow:
        cmd.append("--no-shadow")  # real shadow is already in the frames; just stitch
    cmd += [
        "--shadow-alpha", str(a.shadow_alpha),
        "--shadow-blur", str(a.shadow_blur),
        "--shadow-squash", str(a.shadow_squash),
        "--shadow-shear", str(a.shadow_shear),
        "--shadow-grow", str(a.shadow_grow),
        "--shadow-dx", str(a.shadow_dx),
        "--shadow-dy", str(a.shadow_dy),
    ]
    try:
        subprocess.run(cmd, check=True)
    except (subprocess.CalledProcessError, OSError) as e:
        print(f"post-process failed ({e}); frames written, sheet skipped.")


if __name__ == "__main__":
    main()
