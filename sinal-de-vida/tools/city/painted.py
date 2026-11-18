"""The paint of the city's pieces, in the manner of Jonas and of the station's props: each piece gets one small atlas painted texel by
texel by tools/props/paint.py (worn edges, chipped paint, dirt run down, the dark line where two parts meet, the light from above), on
the kit of tools/models/metal.py. No picture, no image model. build_pieces.py calls `finish(name, objs, path)` for every piece.

The parts keep their material NAMES in the .glb (body, glass, rubber ...), all sharing the piece's atlas: the game (src/models/city/
pieces.js) still tells a headlight from the body by the name, tints `body` with the vehicle's colour (it is painted a pale neutral
here) and draws the rest as painted."""
import bpy, bmesh, os, sys, math, importlib.util
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
def _load(name, folder):
    if name in sys.modules: return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, os.path.join(folder, name + '.py'))
    m = importlib.util.module_from_spec(spec); sys.modules[name] = m; spec.loader.exec_module(m); return m
M = _load('metal', os.path.join(HERE, '..', 'models'))
paint = _load('paint', os.path.join(HERE, '..', 'props'))

h = lambda s: tuple(int(s[i:i + 2], 16) / 255 for i in (1, 3, 5))
# name -> (the colour as the game used to give it, the kind of surface)
MATS = {
    'body': ((0.84, 0.84, 0.83), 'coat'), 'glass': (h('#2c3d52'), 'plain'), 'rubber': (h('#333337'), 'rubber'), 'chrome': (h('#8a8e96'), 'steel'),
    'plastic': (h('#2a2c30'), 'plain'), 'black': (h('#1c1d20'), 'plain'), 'metal': (h('#767a82'), 'steel'), 'rust': (h('#8a6a52'), 'rust'),
    'wood': (h('#a8845a'), 'wood'), 'roof': (h('#6a5a4a'), 'rust'), 'grate': (h('#5a5e64'), 'steel'), 'concrete': (h('#96958f'), 'conc'),
    'headlight': (h('#e8d8a0'), 'plain'), 'taillight': (h('#a03a2a'), 'plain'), 'lamp': (h('#ffc078'), 'plain'),
}
SIZE = {'car_sedan': 512, 'car_van': 512, 'car_furgao': 512, 'roof_tank': 256, 'fire_escape': 256, 'lamp_head': 256, 'bench': 256, 'trash_bin': 256}
SPEC = {'car_sedan': dict(rust=0.25, grime=0.8, chip=0.07), 'car_van': dict(rust=0.3, grime=0.8, chip=0.07), 'car_furgao': dict(rust=0.35, grime=0.9, chip=0.06), 'trash_bin': dict(rust=0.5, grime=0.8),
        'roof_tank': dict(rust=0.5, grime=0.8), 'fire_escape': dict(rust=0.6, grime=0.6, floor=False), 'fire_ladder': dict(rust=0.6, grime=0.6, floor=False),
        'lamp_head': dict(rust=0.2, grime=0.4, floor=False), 'roof_antenna': dict(rust=0.3, floor=False), 'roof_dish': dict(rust=0.2, floor=False)}


def car(c):
    """A vehicle: the seams of its doors and bonnet, a belt line, handles; the glass with the sky's streak across it; mud thrown up by the wheels."""
    body = c.mat_is('body')
    side = body & (np.abs(c.nx) > 0.7) & (c.z > 0.3)
    ymin, ymax = float(c.y.min()), float(c.y.max()); Ln = ymax - ymin
    for k in (0.30, 0.52, 0.74):
        c.seam(side, c.y - (ymin + k * Ln), lip=0.8)
    c.seam(side, c.z - 0.52, lip=0.0)
    c.bolts(side, c.y, c.z, [(ymin + k * Ln + 0.07, 0.78) for k in (0.30, 0.52)], 0.022, light=(0.0, 1.0), tone=0.5)
    top = body & (c.nz > 0.7)
    c.seam(top & (c.z < 1.1), c.y - (ymin + 0.2 * Ln), lip=0.6)
    glass = c.mat_is('glass')
    streak = c.smooth(0.10, 0.0, np.abs(((c.x * 0.6 + c.y * 0.5 + c.z * 1.2) % 0.9) - 0.3)) * 0.5 + c.smooth(0.03, 0.0, np.abs(((c.x * 0.6 + c.y * 0.5 + c.z * 1.2) % 0.9) - 0.52)) * 0.4
    c.col = c.mix(c.col, np.array((0.50, 0.60, 0.70)), glass * streak)
    c.col = c.mix(c.col, c.col * 0.45, glass * c.smooth(0.03, 0.0, c.de) * 0.8)                 # the rubber round each pane
    mud = c.smooth(0.75, 0.25, c.z) * c.smooth(0.35, 0.7, c.fbm(c.P, 7.0, 3, 71)) * (np.abs(c.nx) > 0.5)
    c.col = c.mix(c.col, np.array((0.36, 0.30, 0.22)), (body | c.mat_is('plastic')) * mud * 0.7)


DETAILS = {'car_sedan': car, 'car_van': car, 'car_furgao': car}


def finish(name, objs, path):
    """The objects of one piece (each with one named material) -> a painted .glb at `path`. The objects are removed."""
    kit = M.Kit(); frames = []; flat = []
    dg = bpy.context.evaluated_depsgraph_get()
    for i, ob in enumerate(objs):
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))            # with its modifiers
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.transform(bm, matrix=ob.matrix_world, verts=bm.verts)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.normal_update()
        mname = ob.data.materials[0].name.split('.')[0] if ob.data.materials else 'metal'
        smooth = bool(me.polygons and me.polygons[0].use_smooth)
        kit.piece(f'p{i}', None, name)
        base = len(kit.v); kit.v.extend(tuple(v.co) for v in bm.verts)
        for f in bm.faces:
            kit._face([base + v.index for v in f.verts], mname); flat.append(not smooth)
        co = np.array([tuple(v.co) for v in bm.verts]); lo, hi = co.min(0), co.max(0); hs = (hi - lo) / 2
        order = sorted(range(3), key=lambda k: -hs[k]); eye = np.eye(3)
        frames.append((0, tuple((lo + hi) / 2), [tuple(eye[k]) for k in order], tuple(max(hs[k], 1e-4) for k in order), ((i * 0.618034 + 0.31) % 1.0)))
        bm.free(); bpy.data.meshes.remove(me)
    for ob in objs: bpy.data.objects.remove(ob, do_unlink=True)
    kit.analyse()
    size = SIZE.get(name, 128)
    uvs = M.unwrap(kit, angle=60.0, margin=0.012 if size >= 512 else 0.02)
    mats = list(dict.fromkeys(kit.fmat))
    H = float(np.array(kit.v)[:, 2].max())
    R = M.Raster(kit, uvs, size, mats).occlusion(kit, reach=0.07, far=max(0.7, 0.5 * H))
    # a pane or a lens lies on the body: it is not in the body's shadow, and no joint is drawn across it
    lying = np.isin(R.mat, [k for k, n in enumerate(R.mats) if n in ('glass', 'headlight', 'taillight', 'lamp')])
    R.near[lying] = 0.07; R.sky[lying] = np.maximum(R.sky[lying], 0.85)
    spec = dict(grime=0.6, rust=0.25, gain=1.0)
    spec.update(SPEC.get(name, {}))

    def detail(c):
        c.mat_is = lambda *ns: np.isin(R.mat, [k for k, n in enumerate(R.mats) if n in ns])
        c.de = R.de
        if name in DETAILS: DETAILS[name](c)

    rgb = paint.paint(R, kit, frames, {n: MATS.get(n, MATS['metal']) for n in mats}, spec, M, detail)
    img = R.image(name, rgb, bg=(0.13, 0.1, 0.08), spread=8)
    # the mesh: one object, a material slot per name, all with the atlas; flat parts keep their faces flat
    me = bpy.data.meshes.new(name); me.from_pydata(kit.v, [], kit.f); me.update()
    uv = me.uv_layers.new(name='UVMap')
    slots = {}
    for n in mats:
        m = bpy.data.materials.new(n); m.use_nodes = True
        nt = m.node_tree; b = nt.nodes['Principled BSDF']; t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
        nt.links.new(t.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 1.0
        slots[n] = len(me.materials); me.materials.append(m)
    loops = [None] * len(me.loops)
    for fi, poly in enumerate(me.polygons):
        poly.material_index = slots[kit.fmat[fi]]; poly.use_smooth = True
        for j, li in enumerate(poly.loop_indices):
            uv.data[li].uv = tuple(uvs[fi][j])
            loops[li] = tuple(kit.fn[fi]) if flat[fi] else tuple(kit.vn[kit.f[fi][j]])
    me.normals_split_custom_set(loops)
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT',
                              export_image_format='JPEG', export_jpeg_quality=88, export_texcoords=True, export_normals=True, export_cameras=False, export_lights=False)
    bpy.data.objects.remove(ob, do_unlink=True)
    for m in list(bpy.data.materials):
        if m.users == 0: bpy.data.materials.remove(m)
    print(f'PAINTED {name}: {kit.tris()} tris, {len(objs)} parts, tex {size} ({R.fill:.0%} used)', flush=True)
