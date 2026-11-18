"""Makes the props of the game: each built by procedural.py out of chamfered pieces and painted by paint.py, texel by texel, in the
manner of Jonas and of the dog-robot (the kit, the atlas and the noise are those of tools/models/metal.py). No model and no picture
from outside, no image model, no render: the light is painted.

    blender --background --factory-startup --python tools/props/bake.py -- --out assets/props [--only a,b] [--size 512] [--keep]

For each prop of specs.py: the pieces are built as the game will draw them (no reduction), stood on z = 0 and centred, unwrapped into
one atlas, every texel is given its place on the prop and painted, and the result is one .glb with one mesh and one small texture
(JPEG, base colour only; the numbers are display values). --keep leaves the .png beside the .glb. Deterministic.
"""
import bpy, sys, os, math, importlib.util, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
def load(name, folder=HERE):
    spec = importlib.util.spec_from_file_location(name, os.path.join(folder, name + '.py'))
    m = importlib.util.module_from_spec(spec); sys.modules[name] = m; spec.loader.exec_module(m); return m
M = load('metal', os.path.join(HERE, '..', 'models'))
specs = load('specs'); proc = load('procedural'); paint = load('paint'); details = load('details')

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default
OUT = arg('--out', 'assets/props')
ONLY = arg('--only'); ONLY = ONLY.split(',') if ONLY else None
SIZE = int(arg('--size', 0))


def stand(kit, spec):
    """Standing on z = 0, centred in x and y (as the game expects of every prop); the pieces' frames move with it."""
    v = np.array(kit.v, dtype=np.float64)
    lo, hi = v.min(0), v.max(0)
    off = np.array((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2])) if spec.get('center', True) else np.array((0, 0, -lo[2]))
    if 'z0' in spec: off[2] = -spec['z0']                               # (a thing that hangs: the height of its own origin is kept)
    kit.v = [tuple(p) for p in (v + off)]
    proc.FRAMES[:] = [(f[0], tuple(np.array(f[1]) + off), f[2], f[3], f[4]) for f in proc.FRAMES]
    return hi - lo


def outlined(frame):
    """Whether a piece takes the outline: not a small bit (under 10 cm long) and not a thin rod or sheet edge (under 2.4 cm across)."""
    h = sorted(frame[3], reverse=True)
    return h[0] >= 0.05 and h[1] >= 0.012


def write_png(arr, path):
    n = arr.shape[0]; img = bpy.data.images.new('out', n, n, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((n, n, 4), np.float32); rgba[:, :, :3] = arr
    img.pixels.foreach_set(rgba.ravel()); img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)


def export(name, kit, uvs, tex_path, out_glb):
    me = bpy.data.meshes.new(name)
    me.from_pydata(kit.v, [], kit.f); me.update()
    uv = me.uv_layers.new(name='UVMap')
    for poly, fuv in zip(me.polygons, uvs):
        poly.use_smooth = True
        for j, li in enumerate(poly.loop_indices): uv.data[li].uv = tuple(fuv[j])
    me.normals_split_custom_set_from_vertices([tuple(n) for n in kit.vn])
    m = bpy.data.materials.new('painted'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(tex_path); t.image.colorspace_settings.name = 'Non-Color'
    nt.links.new(t.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 1.0
    me.materials.append(m)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    # the outline's shell (`<name>_hull`, no material, no uv): the prop without its small bits and its thin rods, whose line would be
    # wider than they are; the game draws it inside out (src/models/outline.js)
    keep = [i for i, f in enumerate(proc.FRAMES) if outlined(f)]
    fis = [i for i in range(len(kit.f)) if kit.fpiece[i] in keep]
    hull_tris = sum(len(kit.f[i]) - 2 for i in fis)
    if fis:
        remap, verts = {}, []
        for fi in fis:
            for vi in kit.f[fi]:
                if vi not in remap: remap[vi] = len(verts); verts.append(vi)
        hm = bpy.data.meshes.new(name + '_hull')
        hm.from_pydata([kit.v[vi] for vi in verts], [], [tuple(remap[vi] for vi in kit.f[fi]) for fi in fis]); hm.update()
        for poly in hm.polygons: poly.use_smooth = True
        hm.normals_split_custom_set_from_vertices([tuple(kit.vn[vi]) for vi in verts])
        ho = bpy.data.objects.new(name + '_hull', hm); bpy.context.scene.collection.objects.link(ho); ho.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT',
                              export_image_format='JPEG', export_jpeg_quality=90, export_animations=False, export_texcoords=True, export_normals=True)
    return hull_tris


def bake_one(name, spec):
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    kit = M.Kit(); proc.begin(kit)
    proc.BUILDERS[spec['proc']](**spec.get('args', {}))
    dims = stand(kit, spec)
    kit.analyse()
    size = SIZE or spec.get('tex', 512)
    uvs = M.unwrap(kit, angle=spec.get('angle', 55.0), margin=spec.get('margin', 0.006 if size >= 1024 else 0.009))
    mats = list(dict.fromkeys(kit.fmat))
    R = M.Raster(kit, uvs, size, mats).occlusion(kit, reach=0.07, far=max(0.7, 0.5 * float(dims[2])))
    rgb = paint.paint(R, kit, proc.FRAMES, proc.MATS, spec, M, details.DETAILS.get(spec.get('detail', name)))
    R.image(name, rgb, bg=(0.13, 0.1, 0.08), spread=10)
    os.makedirs(OUT, exist_ok=True)
    tex = os.path.join(OUT, name + '.png')
    write_png(R.rgb_image, tex)
    hull_tris = export(name, kit, uvs, tex, os.path.join(OUT, name + '.glb'))
    if '--keep' not in argv: os.remove(tex)
    print(f'BAKED {name}: {kit.tris()} tris (+{hull_tris} of outline), {len(proc.FRAMES)} pieces, tex {size} ({R.fill:.0%} used), dims {[round(float(d), 3) for d in dims]}, {time.time() - t0:.0f} s', flush=True)


for name, spec in specs.PROPS.items():
    if ONLY and name not in ONLY: continue
    bake_one(name, spec)
