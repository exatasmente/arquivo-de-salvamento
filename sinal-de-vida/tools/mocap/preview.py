"""Renders Jonas playing a clip of retarget.py, from the side, for looking at (Blender 4.5, no window, flat workbench shading):

    blender -b --factory-startup --python tools/mocap/preview.py -- --glb <name>.test.glb --out <folder of frames> [--size 960x540] [--every 1]
        [--follow 1] [--angle side|front|three-quarter]

The camera follows the pelvis over the floor (like the capture of a person walking past), and the floor has marks every half metre that stay where
they are, so a foot that slides on the floor shows against them. Frames are PNG files frame_00000.png ...; ffmpeg joins them."""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = {}
for i, a in enumerate(argv):
    if a.startswith('--'):
        opt[a[2:]] = argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else True
W, H = [int(x) for x in opt.get('size', '960x540').split('x')]
every = int(opt.get('every', 1))
out = opt['out']
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30           # the importer turns seconds into frames at the scene's rate
bpy.ops.import_scene.gltf(filepath=opt['glb'])
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.image_settings.file_format = 'PNG'
sh = sc.display.shading
sh.light = 'STUDIO'
sh.color_type = 'SINGLE'
sh.single_color = (0.78, 0.66, 0.55)
sh.show_cavity = False
sc.display.shading.show_shadows = True
sc.world = bpy.data.worlds.new('w')
sc.world.color = (0.12, 0.13, 0.18)
sc.render.film_transparent = False

# the floor and its marks
mat_floor = bpy.data.materials.new('floor')
mat_floor.diffuse_color = (0.35, 0.35, 0.38, 1)
mat_mark = bpy.data.materials.new('mark')
mat_mark.diffuse_color = (0.9, 0.85, 0.5, 1)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -0.001))
fl = bpy.context.object
fl.scale = (6, 60, 1)
fl.data.materials.append(mat_floor)
for k in range(-80, 81):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, k * 0.5, 0.0))
    m = bpy.context.object
    m.scale = (0.9, 0.012, 0.003)
    m.data.materials.append(mat_mark)
sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.single_color = (0.82, 0.68, 0.56)
# Jonas has no textures in the model (the game paints them): give his skin one flat colour
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name not in (fl.name,) and not o.name.startswith('Cube'):
        o.data.materials.clear()
        m = bpy.data.materials.new('skin_' + o.name)
        m.diffuse_color = (0.55, 0.50, 0.42, 1)
        o.data.materials.append(m)

cam_d = bpy.data.cameras.new('cam')
cam_d.type = 'ORTHO'
cam_d.ortho_scale = float(opt.get('view', 2.3)) * W / H
cam = bpy.data.objects.new('cam', cam_d)
sc.collection.objects.link(cam)
sc.camera = cam
angle = opt.get('angle', 'side')
# he faces -y; the camera on his left (-x) looking to +x puts him facing the right of the image
dirs = {'side': Vector((-1, 0, 0)), 'front': Vector((0, -1, 0)), 'three-quarter': Vector((-1, -1, 0)).normalized()}
d = dirs[angle]
light = bpy.data.lights.new('sun', 'SUN')
lo = bpy.data.objects.new('sun', light)
sc.collection.objects.link(lo)
lo.rotation_euler = (math.radians(50), 0, math.radians(30))

fend = int(arm.animation_data.action.frame_range[1])
sc.frame_start, sc.frame_end = 0, fend
for f in range(0, fend + 1, every):
    sc.frame_set(f)
    p = arm.pose.bones['pelvis'].head
    foc = Vector((p.x if angle != 'side' else 0, p.y, 0.9))
    cam.location = foc + d * 8 + Vector((0, 0, 1.7))       # a little above, so the floor's marks show
    cam.rotation_euler = (foc - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(out, 'frame_%05d.png' % (f // every))
    bpy.ops.render.render(write_still=True)
print('PREVIEW done', fend + 1, 'frames')
