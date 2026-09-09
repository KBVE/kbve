import bpy, mathutils, sys

# args: mode  (render <action> <frame> <out>) | (export <out>)
argv = sys.argv[sys.argv.index("--") + 1:]
mode = argv[0]

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bpy.context.view_layer.objects.active = arm

for pb in arm.pose.bones:
    pb.rotation_mode = 'XYZ'

R_IK, L_IK = 'wrist_ik.r', 'wrist_ik.l'

# capture rest matrices of the IK target bones (armature space)
def rest_mat(name):
    return arm.pose.bones[name].bone.matrix_local.copy()

def key_target(name, frame, loc, rot):
    pb = arm.pose.bones[name]
    r = mathutils.Euler(rot, 'XYZ').to_matrix().to_4x4()
    pb.matrix = mathutils.Matrix.Translation(mathutils.Vector(loc)) @ r
    bpy.context.view_layer.update()
    pb.keyframe_insert('location', frame=frame)
    pb.keyframe_insert('rotation_euler', frame=frame)

def new_action(name):
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    return act

# hand rotation so palm faces roughly forward/down (tuned via render)
# --- analytic IK target from bone data (armature space, Z-up) ---
# chain root = shoulder/bicep joint; chain length = bicep + forearm
SHOULDER_R = mathutils.Vector((1.924, 0.0, 0.013))
CHAIN_LEN = 2.685 + 2.519  # 5.204
REACH = 0.90               # fraction of full length: 1.0=straight, lower=more bend
# aim direction from shoulder: +Y forward, -Z down, -X inward (for right arm)
AIM_R = mathutils.Vector((0.20, 0.64, -0.74)).normalized()

def ik_target(shoulder, aim):
    return tuple(shoulder + aim * (CHAIN_LEN * REACH))

IDLE_RROT = (-0.2, 0.0, 0.0)
IDLE_LROT = (-0.2, 0.0, 0.0)
IDLE_R = ik_target(SHOULDER_R, AIM_R)
IDLE_L = ik_target(
    mathutils.Vector((-SHOULDER_R.x, SHOULDER_R.y, SHOULDER_R.z)),
    mathutils.Vector((-AIM_R.x, AIM_R.y, AIM_R.z)),
)

def build_idle():
    act = new_action('idle')
    for f, dz in ((1, 0.0), (24, 0.12), (48, 0.0)):
        key_target(R_IK, f, (IDLE_R[0], IDLE_R[1], IDLE_R[2] + dz), IDLE_RROT)
        key_target(L_IK, f, (IDLE_L[0], IDLE_L[1], IDLE_L[2] + dz), IDLE_LROT)
    return act

# raised hand target: up + forward from shoulder, arm near-straight (no crumple)
WAVE_AIM = mathutils.Vector((0.22, 0.80, 0.10)).normalized()
WAVE_R = ik_target(SHOULDER_R, WAVE_AIM)
# palm-toward-camera base wrist rotation (tuned via render)
WAVE_WROT = (-1.5, 0.0, 0.3)
WAVE_ROCK = 0.5  # wrist side-to-side amplitude (yaw)

def build_wave():
    act = new_action('wave')
    for f in (1, 44):
        key_target(L_IK, f, IDLE_L, IDLE_LROT)
    wr = WAVE_WROT
    tilt = lambda s: (wr[0], wr[1] + s * WAVE_ROCK, wr[2])
    frames = [
        (1, IDLE_R, IDLE_RROT),
        (10, WAVE_R, tilt(+1)),
        (17, WAVE_R, tilt(-1)),
        (24, WAVE_R, tilt(+1)),
        (31, WAVE_R, tilt(-1)),
        (38, WAVE_R, tilt(+1)),
        (44, IDLE_R, IDLE_RROT),
    ]
    for f, loc, rot in frames:
        key_target(R_IK, f, loc, rot)
    return act

idle = build_idle()
wave = build_wave()

if mode == 'render':
    action_name, frame, out = argv[1], int(argv[2]), argv[3]
    arm.animation_data.action = {'idle': idle, 'wave': wave}[action_name]
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    cam_data = bpy.data.cameras.new("C"); cam_data.lens = 18
    cam = bpy.data.objects.new("C", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    loc = mathutils.Vector((0.0, -0.5, 1.3)); tgt = mathutils.Vector((0.0, 2.3, -2.2))
    cam.location = loc
    cam.rotation_euler = (tgt - loc).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    ld = bpy.data.lights.new("S", 'SUN'); ld.energy = 4
    lo = bpy.data.objects.new("S", ld); lo.location = (0, -2, 3)
    bpy.context.scene.collection.objects.link(lo)
    bpy.context.scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    sc = bpy.context.scene
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except Exception: sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = 640; sc.render.resolution_y = 480
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("RENDERED", out)

elif mode == 'export':
    out = argv[1]
    bpy.context.scene.frame_set(1)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format='GLB',
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_bake_animation=True,
        export_frame_range=False,
        export_apply=False,
        use_selection=False,
    )
    print("EXPORTED", out, "actions:", [a.name for a in bpy.data.actions])
