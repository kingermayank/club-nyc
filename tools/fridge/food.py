"""The food you can own, as it sits in the fridge: blender -b -P food.py -- <out_dir> [only,ids]
One transparent sprite each, lit like the inside of the fridge, inked like the rest of the game."""
import bpy, sys, math, os, random
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
ONLY = argv[1].split(',') if len(argv) > 1 else None
os.makedirs(OUT, exist_ok=True)
R90 = math.radians(90)


def hexc(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mat(color, rough=0.5, metal=0.0, coat=0.0, trans=0.0, bump=0.0, bscale=80):
    m = bpy.data.materials.new('m')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*(hexc(color) if isinstance(color, str) else color), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Transmission Weight'].default_value = trans
    if bump:
        nt = m.node_tree
        tc = nt.nodes.new('ShaderNodeTexCoord')
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = bscale
        n.inputs['Detail'].default_value = 5
        nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        bp.inputs['Distance'].default_value = 0.004
        nt.links.new(n.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def finish(o, m, bevel=0.0, parent=None):
    o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = 3
        b.limit_method = 'ANGLE'
    if hasattr(o.data, 'polygons'):
        for p in o.data.polygons:
            p.use_smooth = True
        try:
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        except Exception:
            pass
    o.select_set(False)
    if parent:
        o.parent = parent
    return o


def box(x, y, z, m, bevel=0.0, parent=None, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2))
    o = bpy.context.object
    o.scale = (abs(x[1] - x[0]), abs(y[1] - y[0]), abs(z[1] - z[0]))
    bpy.ops.object.transform_apply(scale=True)
    if rot:
        o.rotation_euler = rot
    return finish(o, m, bevel, parent)


def cyl(loc, r, h, m, r2=None, rot=(0, 0, 0), bevel=0.0, parent=None, verts=40):
    """a cylinder (or a cup shape: r at the bottom, r2 at the top) standing on z = loc.z - h/2"""
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=loc, rotation=rot, vertices=verts)
    return finish(bpy.context.object, m, bevel, parent)


def ball(loc, r, m, scale=(1, 1, 1), parent=None, rot=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.object
    o.scale = scale
    if rot:
        o.rotation_euler = rot
    return finish(o, m, 0, parent)


def torus(loc, R, r, m, scale=(1, 1, 1), parent=None, rot=None):
    bpy.ops.mesh.primitive_torus_add(location=loc, major_radius=R, minor_radius=r, major_segments=48, minor_segments=20)
    o = bpy.context.object
    o.scale = scale
    if rot:
        o.rotation_euler = rot
    return finish(o, m, 0, parent)


def tube(pts, r, m, parent=None, cyclic=False):
    cu = bpy.data.curves.new('c', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 6
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY' if len(pts) > 20 else 'NURBS')
    sp.points.add(len(pts) - 1)
    for p, v in zip(sp.points, pts):
        p.co = (*v, 1)
    sp.use_endpoint_u = not cyclic
    sp.use_cyclic_u = cyclic
    sp.order_u = 4
    sp.resolution_u = 12
    o = bpy.data.objects.new('tube', cu)
    bpy.context.scene.collection.objects.link(o)
    cu.materials.append(m)
    if parent:
        o.parent = parent
    return o


def group(rot=(0, 0, 0), loc=(0, 0, 0)):
    bpy.ops.object.empty_add(location=loc, rotation=rot)
    return bpy.context.object


def cup(m, r0=0.034, r1=0.043, h=0.11, lid=None, band=None, sleeve=None, z=0.0):
    cyl((0, 0, z + h / 2), r0, h, m, r2=r1)
    if band:
        f = lambda t: r0 + (r1 - r0) * t
        cyl((0, 0, z + h * 0.5), f(0.36) + 0.0008, h * 0.28, band, r2=f(0.64) + 0.0008)
    if sleeve:
        f = lambda t: r0 + (r1 - r0) * t
        cyl((0, 0, z + h * 0.48), f(0.26) + 0.0015, h * 0.44, sleeve, r2=f(0.7) + 0.0015)
    if lid:
        cyl((0, 0, z + h + 0.004), r1 + 0.003, 0.01, lid, bevel=0.003)
        cyl((0, 0, z + h + 0.013), r1 - 0.006, 0.009, lid, r2=r1 - 0.012, bevel=0.002)


def noink(o):
    c = bpy.data.collections.get('noink') or bpy.data.collections.new('noink')
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    c.objects.link(o)
    return o


def smooth(pts, n=10):
    out = []
    P = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = (Vector(P[i - 1]), Vector(P[i]), Vector(P[i + 1]), Vector(P[i + 2]))
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)))
    out.append(tuple(pts[-1]))
    return out


LEAN = math.radians(64)  # flat things lean back against nothing in particular, the way they do on a menu board
random.seed(7)


def pizza():
    g = group((LEAN, 0, 0), (0, 0.03, 0.072))
    mesh = bpy.data.meshes.new('slice')
    t = 0.012
    v = [(0, -0.075, 0), (0.062, 0.055, 0), (-0.062, 0.055, 0), (0, -0.075, t), (0.062, 0.055, t), (-0.062, 0.055, t)]
    mesh.from_pydata(v, [], [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)])
    o = bpy.data.objects.new('slice', mesh)
    bpy.context.scene.collection.objects.link(o)
    finish(o, mat('#ffc23d', 0.45, coat=0.3, bump=0.5, bscale=60), 0.003, g)
    tube([(-0.066, 0.055, 0.008), (-0.03, 0.064, 0.008), (0.03, 0.064, 0.008), (0.066, 0.055, 0.008)], 0.013, mat('#cf8a35', 0.6, bump=0.6, bscale=120), g)
    for x, y in ((0, -0.025), (-0.024, 0.022), (0.022, 0.028)):
        cyl((x, y, 0.014), 0.013, 0.004, mat('#c2301f', 0.4, coat=0.3), bevel=0.001, parent=g)


def hotdog():
    g = group((math.radians(38), 0, 0), (0, 0.01, 0.03))
    bun = mat('#e2aa58', 0.6, bump=0.3)
    for y in (-0.02, 0.02):
        ball((0, y, 0.0), 0.027, bun, (3.2, 0.8, 0.95), g)
    ball((0, 0, 0.016), 0.018, mat('#a8361f', 0.35, coat=0.5), (5.2, 1, 1), g)
    pts = [(-0.075 + i * 0.01875, 0.009 * (1 if i % 2 else -1), 0.035) for i in range(9)]
    tube(smooth(pts), 0.004, mat('#f4c21f', 0.4, coat=0.3), g)


def pretzel():
    g = group((LEAN, 0, 0), (0, 0.03, 0.064))
    brown = mat('#a85a1c', 0.3, coat=0.6, bump=0.2)
    pts = [(-0.034, -0.062, 0.012), (0.012, -0.018, 0.01), (0.052, 0.02, 0.0), (0.062, 0.052, 0.0), (0.036, 0.076, 0.0), (0.0, 0.05, 0.0), (-0.036, 0.076, 0.0), (-0.062, 0.052, 0.0), (-0.052, 0.02, 0.0), (-0.012, -0.018, 0.0), (0.034, -0.062, 0.0)]
    tube(smooth(pts), 0.0125, brown, g)
    salt = mat('#ffffff', 0.6)
    for i in range(14):
        a = random.uniform(0.2, 2.94)
        x, y = math.cos(a) * 0.05, 0.035 + math.sin(a) * 0.036
        noink(box((x - 0.0025, x + 0.0025), (y - 0.0025, y + 0.0025), (0.011, 0.016), salt, parent=g))


def bagel():
    g = group((LEAN, 0, 0), (0, 0.02, 0.05))
    dough = mat('#cf9148', 0.45, coat=0.3, bump=0.25)
    torus((0, 0, -0.012), 0.036, 0.021, dough, (1, 1, 0.7), g)
    torus((0, 0, 0.0), 0.037, 0.016, mat('#fffaf0', 0.5), (1.03, 1.03, 0.45), g)  # cream cheese
    torus((0, 0, 0.012), 0.036, 0.021, dough, (1, 1, 0.7), g)
    seeds = [mat('#2b1d1a', 0.6), mat('#fff6dc', 0.6), mat('#8a5a2b', 0.6)]
    for i in range(46):
        a, rr = random.uniform(0, 6.28), random.uniform(0.022, 0.05)
        zz = 0.012 + 0.0147 * math.sqrt(max(0, 1 - ((rr - 0.036) / 0.021) ** 2))
        noink(ball((math.cos(a) * rr, math.sin(a) * rr, zz), 0.0026, seeds[i % 3], (1.5, 1, 0.7), g, (0, 0, a)))


def donut():
    g = group((LEAN, 0, 0), (0, 0.02, 0.058))
    torus((0, 0, 0), 0.036, 0.024, mat('#dc9c50', 0.5, bump=0.2), (1, 1, 0.85), g)
    torus((0, 0, 0.007), 0.036, 0.0225, mat('#ff86c0', 0.25, coat=0.6), (1.0, 1.0, 0.72), g)
    cols = ['#ffffff', '#ffd23f', '#3fb6ff', '#7bd389', '#ff5a5a']
    for i in range(30):
        a, rr = random.uniform(0, 6.28), random.uniform(0.02, 0.052)
        zz = 0.007 + 0.0165 * math.sqrt(max(0, 1 - ((rr - 0.036) / 0.0225) ** 2))
        noink(cyl((math.cos(a) * rr, math.sin(a) * rr, zz), 0.002, 0.009, mat(cols[i % 5], 0.4), rot=(R90, 0, random.uniform(0, 3.14)), parent=g, verts=8))


def cookie():
    g = group((LEAN, 0, 0), (0, 0.02, 0.05))
    cyl((0, 0, 0), 0.05, 0.014, mat('#d9a35c', 0.7, bump=0.8, bscale=45), bevel=0.006, parent=g)
    chip = mat('#3a2218', 0.35, coat=0.3)
    for i in range(9):
        a, rr = random.uniform(0, 6.28), random.uniform(0, 0.038)
        noink(ball((math.cos(a) * rr, math.sin(a) * rr, 0.006), 0.0075, chip, (1, 1, 0.7), g))


def black_white():
    g = group((LEAN, 0, 0), (0, 0.02, 0.055))
    cyl((0, 0, 0), 0.055, 0.012, mat('#e9cf9a', 0.7, bump=0.3), bevel=0.005, parent=g)
    m = mat('#ffffff', 0.25, coat=0.6)
    nt = m.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    gt = nt.nodes.new('ShaderNodeMath')
    gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = 0.0
    nt.links.new(sep.outputs['X'], gt.inputs[0])
    mx = nt.nodes.new('ShaderNodeMix')
    mx.data_type = 'RGBA'
    mx.inputs['A'].default_value = (*hexc('#fbf7ee'), 1)
    mx.inputs['B'].default_value = (*hexc('#2b1a14'), 1)
    nt.links.new(gt.outputs['Value'], mx.inputs['Factor'])
    nt.links.new(mx.outputs['Result'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    cyl((0, 0, 0.0075), 0.05, 0.005, m, bevel=0.002, parent=g)


def croissant():
    gold = mat('#dd9a3f', 0.3, coat=0.7, bump=0.3, bscale=50)
    n = 7
    for i in range(n):
        t = i / (n - 1) * 2 - 1
        a = t * 1.05
        x, y = math.sin(a) * 0.075, (math.cos(a) - 1) * -0.06 - 0.01
        s = 1 - 0.62 * abs(t) ** 1.5
        ball((x, -y * 0.9, 0.04 * s), 0.04 * s, gold, (0.62, 1.0, 1.0), rot=(0, 0, -a * 0.9))


def dumplings():
    white = mat('#ffffff', 0.7)
    cyl((0, 0, 0.03), 0.04, 0.06, white, r2=0.056, verts=4, rot=(0, 0, math.radians(45)))
    box((-0.04, 0.04), (0.037, 0.04), (0.058, 0.09), white, rot=(math.radians(-20), 0, 0))
    skin = mat('#fbf1d9', 0.4, coat=0.3)
    for i, (x, y) in enumerate(((-0.02, -0.008), (0.02, -0.006), (0, 0.016))):
        ball((x, y, 0.066), 0.019, skin, (1.15, 0.8, 0.8), rot=(0, 0, 0.5 * i - 0.4))
        tube([(x - 0.016, y, 0.076), (x - 0.006, y + 0.003, 0.083), (x + 0.006, y - 0.003, 0.083), (x + 0.016, y, 0.076)], 0.0028, skin)
    tube([(-0.05, -0.03, 0.075), (0.02, 0.01, 0.07), (0.06, 0.03, 0.1)], 0.0022, mat('#c98f45', 0.6))


def gelato():
    cyl((0, 0, 0.022), 0.03, 0.044, mat('#fff7ea', 0.6), r2=0.036, bevel=0.002)  # a little cup to stand the cone in
    cone = mat('#e3ab5b', 0.6, bump=0.9, bscale=30)
    cyl((0, 0, 0.07), 0.004, 0.1, cone, r2=0.032)
    cyl((0, 0, 0.122), 0.034, 0.006, cone)
    ball((0, 0, 0.14), 0.036, mat('#9be3c3', 0.6, bump=0.6, bscale=40))
    ball((0.004, 0, 0.185), 0.027, mat('#ffb3d6', 0.6, bump=0.6, bscale=40))
    ball((0.01, -0.004, 0.213), 0.009, mat('#d2222d', 0.2, coat=0.8))


def cocoa():
    red = mat('#c0392b', 0.25, coat=0.6)
    cyl((0, 0, 0.045), 0.038, 0.09, red, r2=0.044, bevel=0.004)
    torus((0.052, 0, 0.045), 0.024, 0.008, red, rot=(R90, 0, 0))
    cyl((0, 0, 0.088), 0.039, 0.006, mat('#5a2f1c', 0.3))
    ball((0, 0, 0.094), 0.03, mat('#fffdf7', 0.6, bump=0.5, bscale=40), (1, 1, 0.55))  # whipped cream
    ball((0.002, 0, 0.108), 0.018, bpy.data.materials[-1], (1, 1, 0.7))
    for x, y in ((-0.02, -0.02), (0.022, -0.016)):
        box((x - 0.007, x + 0.007), (y - 0.007, y + 0.007), (0.094, 0.108), mat('#ffffff', 0.7), 0.003)


def coffee():
    cup(mat('#2d6fd1', 0.6), band=mat('#ffffff', 0.7), lid=mat('#f4f4f8', 0.4))
    for a in range(-2, 3):  # the Greek key, near enough
        noink(box((a * 0.014 - 0.004, a * 0.014 + 0.004), (-0.0415, -0.039), (0.05, 0.06), mat('#d9a441', 0.5)))


def latte():
    cup(mat('#ffffff', 0.6), sleeve=mat('#b9875a', 0.85, bump=0.3), lid=mat('#33373f', 0.4))


def starducks():
    cup(mat('#1d5c3c', 0.6), band=mat('#f4efe2', 0.7), lid=mat('#f4f4f8', 0.4), h=0.12)
    cyl((0, -0.0395, 0.06), 0.011, 0.003, mat('#1d5c3c', 0.5), rot=(R90, 0, 0))


def clear_cup(liquid, straw, pearls=False, ice=False):
    h, r0, r1 = 0.125, 0.032, 0.044
    cyl((0, 0, h / 2), r0, h, mat((0.9, 0.96, 0.98), 0.03, trans=0.95), r2=r1)
    cyl((0, 0, h * 0.44), r0 + 0.0006, h * 0.8, liquid, r2=r0 + (r1 - r0) * 0.84 + 0.0006)
    if pearls:
        pm = mat('#1a1210', 0.3, coat=0.5)
        for i in range(14):
            a, rr = i * 2.4, 0.008 + (i % 3) * 0.008
            noink(ball(((i % 5 - 2) * 0.011 + (i // 5) * 0.004, -0.0345 + abs(i % 5 - 2) * 0.004, 0.012 + (i // 5) * 0.012), 0.0062, pm))
    cyl((0, 0, h + 0.003), r1 + 0.003, 0.008, mat((0.93, 0.96, 0.98), 0.1, trans=0.6), bevel=0.003)
    cyl((0.008, 0, h + 0.012), 0.0065 if pearls else 0.004, 0.2, straw, rot=(0, math.radians(7), 0))


def cold_brew():
    clear_cup(mat('#3a2014', 0.12, coat=0.6), mat('#1d5c3c', 0.4))


def boba():
    clear_cup(mat('#dcae7c', 0.15, coat=0.6), mat('#ff5a8a', 0.4), pearls=True)


FOODS = {'pizza-slice': pizza, 'hotdog': hotdog, 'pretzel': pretzel, 'bagel': bagel, 'donut': donut, 'cookie': cookie, 'black-white': black_white, 'croissant': croissant, 'dumplings': dumplings, 'gelato': gelato, 'cocoa': cocoa, 'coffee': coffee, 'latte': latte, 'ralphs-coffee': starducks, 'cold-brew': cold_brew, 'boba': boba}

SPAN = 0.26  # metres across the sprite
for fid, make in FOODS.items():
    if ONLY and fid not in ONLY:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    S = bpy.context.scene
    S.render.engine = 'CYCLES'
    try:
        p = bpy.context.preferences.addons['cycles'].preferences
        p.compute_device_type = 'METAL'
        p.get_devices()
        for d in p.devices:
            d.use = True
        S.cycles.device = 'GPU'
    except Exception:
        pass
    S.cycles.samples = 96
    S.cycles.use_denoising = True
    S.render.resolution_x = S.render.resolution_y = 420
    S.render.film_transparent = True
    S.view_settings.view_transform = 'Khronos PBR Neutral'
    S.render.image_settings.file_format = 'PNG'
    S.render.image_settings.color_mode = 'RGBA'
    S.render.use_freestyle = True
    S.render.line_thickness = 2.6
    fs = S.view_layers[0].freestyle_settings
    fs.crease_angle = math.radians(110)
    ls = fs.linesets.new('ink')
    ls.select_silhouette = ls.select_border = ls.select_crease = ls.select_external_contour = True
    ls.linestyle.color = hexc('#1d2140')
    ls.linestyle.thickness = 2.6
    nc = bpy.data.collections.new('noink')
    S.collection.children.link(nc)
    ls.select_by_collection = True
    ls.collection = nc
    ls.collection_negation = 'EXCLUSIVE'
    w = bpy.data.worlds.new('w')
    S.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.9, 0.95, 1.0, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.3
    for nm, loc, e, col, size in (('top', (0.18, -0.12, 0.42), 3.6, (1.0, 0.95, 0.85), 0.3), ('front', (-0.3, -0.6, 0.25), 2.6, (1.0, 0.97, 0.92), 0.6)):
        d = bpy.data.lights.new(nm, 'AREA')
        d.energy, d.color, d.size = e, col, size
        o = bpy.data.objects.new(nm, d)
        o.location = loc
        S.collection.objects.link(o)
        direction = Vector((0, 0, 0.05)) - Vector(loc)
        o.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    make()
    # the shelf catches a shadow and nothing else
    bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
    bpy.context.object.is_shadow_catcher = True
    bpy.context.object.select_set(False)
    cd = bpy.data.cameras.new('cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = SPAN
    cam = bpy.data.objects.new('cam', cd)
    S.collection.objects.link(cam)
    S.camera = cam
    el = math.radians(20)
    # the bottom of the sprite sits a little under the shelf line, so the shadow fits
    centre = Vector((0, 0, SPAN / 2 - 0.035))
    cam.location = centre + Vector((0, -math.cos(el), math.sin(el))) * 2
    cam.rotation_euler = (R90 - el, 0, 0)
    S.render.filepath = os.path.join(OUT, fid + '.png')
    bpy.ops.render.render(write_still=True)
print('DONE food')
