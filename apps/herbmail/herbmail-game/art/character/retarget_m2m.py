import bpy
import sys
import os
argv = sys.argv[sys.argv.index("--") + 1:]
char, anims, out = argv[0], argv[1], argv[2]
clips = argv[3].split(",")
bpy.ops.wm.read_factory_settings(use_empty=True)

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=char)
sk_objs = set(bpy.data.objects) - before
sk = next(o for o in sk_objs if o.type == 'ARMATURE')
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=anims)
m2m_objs = set(bpy.data.objects) - before
m2m = next(o for o in m2m_objs if o.type == 'ARMATURE')

# rest matrices (armature space)


def rests(arm): return {b.name: b.bone.matrix_local.copy()
                        for b in arm.pose.bones}


sk_rest = rests(sk)
m2m_rest = rests(m2m)
shared = [b.name for b in sk.pose.bones if b.name in m2m_rest]
# parent-first order
# blender pose.bones already hierarchy-ordered
order = [b.name for b in sk.pose.bones]
if m2m.animation_data is None:
    m2m.animation_data_create()
if sk.animation_data is None:
    sk.animation_data_create()

baked = []
for clip in clips:
    act = bpy.data.actions.get(clip)
    if not act:
        print("MISSING", clip)
        continue
    m2m.animation_data.action = act
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    new_act = bpy.data.actions.new(clip + "_rt")
    sk.animation_data.action = new_act
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()
        for name in order:
            if name not in m2m_rest or name == 'root':
                continue
            skb = sk.pose.bones[name]
            m2b = m2m.pose.bones[name]
            # delta from rest in armature space (rotation), applied to SK rest
            delta = m2b.matrix @ m2m_rest[name].inverted()
            target = delta @ sk_rest[name]
            skb.matrix = target
            skb.keyframe_insert('rotation_quaternion', frame=f)
    new_act.name = clip
    new_act.use_fake_user = True
    baked.append(clip)
    print("BAKED", clip, f0, f1)

for o in list(m2m_objs):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in sk_objs:
    if o.name in bpy.data.objects:
        o.select_set(True)
bpy.context.view_layer.objects.active = sk
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
                          export_animations=True, export_animation_mode='ACTIONS', export_skins=True,
                          export_yup=True, export_morph=False)
print("EXPORTED", out, round(os.path.getsize(out) / 1048576, 2), "MB", baked)
