"""A look at baked props, laid out in rows: blender -b --factory-startup --python tools/props/preview.py -- out.png [--cols 8] a.glb b.glb ...
The textures are shown as baked (flat light, no game lighting). One picture."""
import bpy, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
cols = 8
if '--cols' in argv: i = argv.index('--cols'); cols = int(argv[i + 1]); del argv[i:i + 2]
out, files = argv[0], argv[1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
rows = [files[i:i + cols] for i in range(0, len(files), cols)]
widths = []
y = 0.0; W = 0.0
for ri, row in enumerate(rows):
    x = 0.0
    for f in row:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=f)
        new = [o for o in bpy.data.objects if o not in before]
        pts = [o.matrix_world @ Vector(c) for o in new if o.type == 'MESH' for c in o.bound_box]
        w = max(p.x for p in pts) - min(p.x for p in pts)
        cx = (max(p.x for p in pts) + min(p.x for p in pts)) / 2
        for o in [o for o in new if o.parent is None]: o.location.x += x + w / 2 - cx; o.location.y += y
        x += w + 0.45
    W = max(W, x); y += 3.2
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading; sh.light = 'FLAT'; sh.color_type = 'TEXTURE'
sc.display.render_aa = '8'
sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.1, 0.12, 0.17)
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); bpy.context.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
H = len(rows) * 3.2
tgt = bpy.data.objects.new('t', None); tgt.location = (W / 2, H / 2 - 1.3, 0.4); bpy.context.collection.objects.link(tgt)
cam.location = (W / 2, -12, 11)
tc = cam.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
cam.data.ortho_scale = W * 1.05
sc.render.resolution_x = 2000; sc.render.resolution_y = int(2000 * (len(rows) * 2.7 + 2.6) / (W * 1.05))
sc.render.filepath = out; bpy.ops.render.render(write_still=True)
