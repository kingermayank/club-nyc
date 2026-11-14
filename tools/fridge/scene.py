"""The apartment fridge as a real scene: blender -b -P scene.py -- <out_dir> <mode> [samples]
mode: test (frames 0 and last, small), frames (all frames), data (json only)"""
import bpy, sys, math, json, os
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, MODE = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 96
os.makedirs(OUT, exist_ok=True)

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
except Exception as e:
    print('gpu', e)
S.cycles.samples = SAMPLES
S.cycles.use_denoising = True
S.render.resolution_x, S.render.resolution_y = (1600, 904) if MODE != 'test' else (1200, 678)
S.render.film_transparent = False
S.view_settings.view_transform = 'Khronos PBR Neutral'
S.view_settings.look = 'None'
S.render.image_settings.file_format = 'PNG'


# ---------- materials ----------
def mat(name, color, rough=0.5, metal=0.0, coat=0.0, emit=None, emit_s=0.0, trans=0.0, alpha=1.0, sss=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    for k, v in (('Coat Weight', coat), ('Transmission Weight', trans), ('Alpha', alpha), ('Subsurface Weight', sss)):
        if k in b.inputs:
            b.inputs[k].default_value = v
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = emit_s
    return m


def hexc(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def add_noise(m, scale, strength, mix=0.0, dark=0.85):
    """a little life in a flat surface: bump from noise, and (mix) a mottled base colour"""
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = 6
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = 0.01
    nt.links.new(n.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    if mix:
        base = tuple(b.inputs['Base Color'].default_value)
        n2 = nt.nodes.new('ShaderNodeTexNoise')
        n2.inputs['Scale'].default_value = scale * 0.08
        n2.inputs['Detail'].default_value = 3
        nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeMapRange')
        ramp.inputs['From Min'].default_value = 0.35
        ramp.inputs['From Max'].default_value = 0.7
        nt.links.new(n2.outputs['Fac'], ramp.inputs['Value'])
        mx = nt.nodes.new('ShaderNodeMix')
        mx.data_type = 'RGBA'
        mx.inputs['A'].default_value = tuple(c * dark for c in base[:3]) + (1,)
        mx.inputs['B'].default_value = base
        fac = nt.nodes.new('ShaderNodeMath')
        fac.operation = 'MULTIPLY'
        fac.inputs[1].default_value = 1.0
        nt.links.new(ramp.outputs['Result'], fac.inputs[0])
        mixf = nt.nodes.new('ShaderNodeMix')
        mixf.data_type = 'RGBA'
        mixf.inputs['Factor'].default_value = mix
        mixf.inputs['A'].default_value = base
        nt.links.new(ramp.outputs['Result'], mx.inputs['Factor'])
        nt.links.new(mx.outputs['Result'], mixf.inputs['B'])
        nt.links.new(mixf.outputs['Result'], b.inputs['Base Color'])


ENAMEL = mat('enamel', hexc('#f3ecd8'), rough=0.22, coat=0.6)
add_noise(ENAMEL, 260, 0.04, mix=0.5, dark=0.93)
LINER = mat('liner', hexc('#f4f7f8'), rough=0.35, sss=0.1)
add_noise(LINER, 300, 0.03)
CHROME = mat('chrome', (0.82, 0.84, 0.86), rough=0.18, metal=1.0)
add_noise(CHROME, 900, 0.02)
RUBBER = mat('rubber', hexc('#3b3f4a'), rough=0.8)
GLASS = mat('glass', (0.86, 0.95, 0.97), rough=0.08, trans=0.85)
TRIM = mat('trim', hexc('#e8eef0'), rough=0.3)
DRAWER = mat('drawer', (0.8, 0.93, 0.96), rough=0.15, trans=0.6)
WALL = mat('wall', hexc('#ead6a8'), rough=0.9)
add_noise(WALL, 60, 0.18, mix=0.6, dark=0.93)
GREEN = mat('green', hexc('#4c8a68'), rough=0.45)
add_noise(GREEN, 40, 0.12, mix=0.6, dark=0.85)
GREEN_D = mat('green-d', hexc('#3a6e52'), rough=0.5)
BRASS = mat('brass', hexc('#d9a441'), rough=0.25, metal=1.0)
WOOD = mat('wood', hexc('#b8742f'), rough=0.5)
DARKWOOD = mat('darkwood', hexc('#5a3220'), rough=0.6)
PAPER_Y = mat('note', hexc('#f6dc6a'), rough=0.9)
PAPER_W = mat('paper', hexc('#f7f4ea'), rough=0.9)
PHOTO = mat('photo', hexc('#5c6fb5'), rough=0.4)
RED = mat('red', hexc('#d8362f'), rough=0.35, coat=0.3)
YEL = mat('yellow', hexc('#f0b42a'), rough=0.35, coat=0.3)
MILK = mat('milk', hexc('#fbfbf6'), rough=0.5)
BLUE = mat('blue', hexc('#2c62c9'), rough=0.4)
PICKLE = mat('pickle', hexc('#7d9a3c'), rough=0.2, trans=0.4)
GREEN_B = mat('bottle-green', hexc('#2f7a4a'), rough=0.08, trans=0.7)
CAN = mat('can', (0.75, 0.78, 0.8), rough=0.25, metal=1.0)
CARTON = mat('carton', hexc('#b9a98b'), rough=0.95)
add_noise(CARTON, 120, 0.4)
BULB = mat('bulb', (1, 1, 1), emit=(1.0, 0.93, 0.78), emit_s=9)
TILE = mat('tile', hexc('#f1ece0'), rough=0.15, coat=0.4)
POT = mat('pot', hexc('#c9552f'), rough=0.3, coat=0.5)
BUTTER = mat('butter', hexc('#f4d774'), rough=0.5)

# wood grain on the counter
nt = WOOD.node_tree
w = nt.nodes.new('ShaderNodeTexWave')
w.inputs['Scale'].default_value = 3
w.inputs['Distortion'].default_value = 6
w.inputs['Detail'].default_value = 3
tc = nt.nodes.new('ShaderNodeTexCoord')
mp = nt.nodes.new('ShaderNodeMapping')
mp.inputs['Scale'].default_value = (1, 12, 12)
nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
nt.links.new(mp.outputs['Vector'], w.inputs['Vector'])
mx = nt.nodes.new('ShaderNodeMix')
mx.data_type = 'RGBA'
mx.inputs['A'].default_value = (*hexc('#a5642a'), 1)
mx.inputs['B'].default_value = (*hexc('#c98a44'), 1)
nt.links.new(w.outputs['Fac'], mx.inputs['Factor'])
nt.links.new(mx.outputs['Result'], nt.nodes['Principled BSDF'].inputs['Base Color'])

# subway tile backsplash
nt = TILE.node_tree
br = nt.nodes.new('ShaderNodeTexBrick')
br.inputs['Color1'].default_value = (*hexc('#f3eee2'), 1)
br.inputs['Color2'].default_value = (*hexc('#e9e2d2'), 1)
br.inputs['Mortar'].default_value = (*hexc('#a99c86'), 1)
br.inputs['Scale'].default_value = 1
br.inputs['Mortar Size'].default_value = 0.004
br.inputs['Brick Width'].default_value = 0.15
br.inputs['Row Height'].default_value = 0.075
tc = nt.nodes.new('ShaderNodeTexCoord')
mp = nt.nodes.new('ShaderNodeMapping')
mp.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
nt.links.new(mp.outputs['Vector'], br.inputs['Vector'])
nt.links.new(br.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
bump = nt.nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = 0.6
nt.links.new(br.outputs['Fac'], bump.inputs['Height'])
bump.invert = True
nt.links.new(bump.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])


# ---------- shapes ----------
def finish(o, m, bevel=0.0, parent=None, seg=4):
    o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = seg
        b.limit_method = 'ANGLE'
    for poly in o.data.polygons:
        poly.use_smooth = True
    try:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        o.select_set(False)
    except Exception:
        pass
    if parent:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o


def box(name, x, y, z, m, bevel=0.0, parent=None, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2))
    o = bpy.context.object
    o.name = name
    o.scale = (abs(x[1] - x[0]), abs(y[1] - y[0]), abs(z[1] - z[0]))
    bpy.ops.object.transform_apply(scale=True)
    if rot:
        o.rotation_euler = rot
    o.select_set(False)
    return finish(o, m, bevel, parent)


def cyl(name, loc, r, h, m, rot=(0, 0, 0), bevel=0.0, parent=None, verts=40, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object
    o.name = name
    o.select_set(False)
    return finish(o, m, bevel, parent)


def ball(name, loc, r, m, scale=(1, 1, 1), parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.select_set(False)
    return finish(o, m, 0, parent)


W, D = 0.86, 0.68
X0, X1 = -W / 2, W / 2
Z0, ZM, Z1 = 0.08, 1.20, 1.58  # floor of the cabinet, the seam between fridge and freezer, the top
T = 0.045  # wall thickness

# ---------- the room around it ----------
box('wall', (-4, 4), (0.72, 0.76), (-0.5, 3), WALL)
box('floor', (-4, 4), (-4, 0.8), (-0.05, 0), DARKWOOD)
# left: lower cabinets under a butcher-block counter, tile above, upper cabinets
box('cab-lo', (-2.4, X0 - 0.03), (0.08, 0.72), (0.1, 0.86), GREEN, 0.006)
box('cab-kick', (-2.4, X0 - 0.03), (0.14, 0.72), (0, 0.1), GREEN_D)
for i, cx in enumerate((-0.72, -1.2, -1.68)):
    box(f'cab-door{i}', (cx - 0.22, cx + 0.22), (0.06, 0.09), (0.16, 0.8), GREEN, 0.012)
    box(f'cab-inset{i}', (cx - 0.16, cx + 0.16), (0.052, 0.07), (0.22, 0.74), GREEN_D, 0.01)
    ball(f'cab-knob{i}', (cx + (0.17 if i % 2 else -0.17), 0.04, 0.7), 0.018, BRASS)
box('counter', (-2.4, X0 - 0.02), (0.04, 0.72), (0.86, 0.905), WOOD, 0.008)
box('tiles', (-2.4, X0 - 0.02), (0.705, 0.722), (0.905, 1.36), TILE)
box('cab-hi', (-2.4, X0 - 0.12), (0.36, 0.72), (1.36, 2.2), GREEN, 0.006)
for i, cx in enumerate((-0.8, -1.26, -1.72)):
    box(f'cabhi-door{i}', (cx - 0.21, cx + 0.21), (0.34, 0.37), (1.4, 2.1), GREEN, 0.012)
    box(f'cabhi-inset{i}', (cx - 0.15, cx + 0.15), (0.332, 0.35), (1.46, 2.04), GREEN_D, 0.01)
    ball(f'cabhi-knob{i}', (cx + (0.16 if i % 2 else -0.16), 0.32, 1.47), 0.018, BRASS)
# on the counter: a pot and a jar of wooden spoons
cyl('pot', (-0.78, 0.4, 0.97), 0.1, 0.13, POT, bevel=0.012)
cyl('pot-lid', (-0.78, 0.4, 1.04), 0.104, 0.012, POT, bevel=0.005)
ball('pot-knob', (-0.78, 0.4, 1.06), 0.018, RUBBER)
cyl('jar', (-1.08, 0.5, 0.985), 0.055, 0.16, mat('crock', hexc('#e8e2d0'), 0.3, coat=0.4), bevel=0.01)
for i, a in enumerate((-0.25, 0.1, 0.3)):
    cyl(f'spoon{i}', (-1.08 + a * 0.12, 0.5, 1.12), 0.008, 0.24, WOOD, rot=(0.1 * i, a, 0), verts=12)
    ball(f'spoon-head{i}', (-1.08 + a * 0.24, 0.5 - 0.012 * i, 1.24), 0.024, WOOD, scale=(1, 0.4, 1.4))
# right: the wall carries on to a door frame
box('trim-r', (1.5, 1.62), (0.66, 0.74), (0, 3), DARKWOOD, 0.01)
box('baseboard', (X1, 1.5), (0.68, 0.73), (0, 0.14), DARKWOOD, 0.01)

# ---------- the cabinet ----------
box('side-l', (X0, X0 + T), (0, D), (Z0, Z1), ENAMEL, 0.012)
box('side-r', (X1 - T, X1), (0, D), (Z0, Z1), ENAMEL, 0.012)
box('top', (X0, X1), (0, D), (Z1 - T, Z1), ENAMEL, 0.012)
box('bottom', (X0, X1), (0, D), (Z0, Z0 + T), ENAMEL, 0.012)
box('back', (X0, X1), (D - T, D), (Z0, Z1), ENAMEL)
box('divider', (X0, X1), (0, D), (ZM - 0.03, ZM + 0.03), ENAMEL, 0.008)
box('feet', (X0 + 0.03, X1 - 0.03), (0.04, D - 0.04), (0, Z0), RUBBER)
# liner inside the main compartment
IX0, IX1, IZ0, IZ1, IY1 = X0 + T, X1 - T, Z0 + T, ZM - 0.03, D - T
box('lin-l', (IX0, IX0 + 0.008), (0.012, IY1), (IZ0, IZ1), LINER)
box('lin-r', (IX1 - 0.008, IX1), (0.012, IY1), (IZ0, IZ1), LINER)
box('lin-t', (IX0, IX1), (0.012, IY1), (IZ1 - 0.008, IZ1), LINER)
box('lin-b', (IX0, IX1), (0.012, IY1), (IZ0, IZ0 + 0.008), LINER)
box('lin-back', (IX0, IX1), (IY1 - 0.008, IY1), (IZ0, IZ1), LINER)
# ribs moulded into the back wall, and rails down the sides for the shelves
# front rim of the cabinet (where the gasket seals)
for nm, x, z in (('rim-l', (X0 + 0.006, IX0 + 0.01), (Z0 + 0.01, ZM - 0.01)), ('rim-r', (IX1 - 0.01, X1 - 0.006), (Z0 + 0.01, ZM - 0.01)), ('rim-t', (X0 + 0.006, X1 - 0.006), (IZ1 - 0.012, ZM - 0.008))):
    box(nm, x, (-0.002, 0.014), z, LINER, 0.003)
# the light, top right
box('lamp-house', (IX1 - 0.16, IX1 - 0.02), (0.2, 0.36), (IZ1 - 0.05, IZ1 - 0.008), TRIM, 0.008)
box('lamp', (IX1 - 0.145, IX1 - 0.035), (0.215, 0.345), (IZ1 - 0.058, IZ1 - 0.046), BULB, 0.004)
# thermostat dial on the lamp housing
cyl('dial', (IX1 - 0.09, 0.195, IZ1 - 0.03), 0.016, 0.012, RUBBER, rot=(math.radians(90), 0, 0))

SHELVES = [0.93, 0.70, 0.47]
for i, z in enumerate(SHELVES):
    box(f'shelf{i}', (IX0 + 0.008, IX1 - 0.008), (0.15, IY1 - 0.01), (z - 0.006, z), GLASS)
    box(f'shelf-trim{i}', (IX0 + 0.008, IX1 - 0.008), (0.135, 0.155), (z - 0.016, z + 0.004), TRIM, 0.004)
    for sx in (IX0 + 0.012, IX1 - 0.012):
        box(f'rail{i}{sx:.2f}', (sx - 0.006, sx + 0.006), (0.15, IY1 - 0.02), (z - 0.022, z - 0.006), LINER, 0.003)
# crisper drawers at the bottom
for i, (a, b) in enumerate(((IX0 + 0.015, -0.006), (0.006, IX1 - 0.015))):
    box(f'crisper{i}', (a, b), (0.14, IY1 - 0.03), (IZ0 + 0.012, 0.40), DRAWER, 0.012)
    box(f'crisper-lip{i}', (a + 0.08, b - 0.08), (0.125, 0.145), (0.34, 0.37), TRIM, 0.006)
box('crisper-top', (IX0 + 0.008, IX1 - 0.008), (0.135, IY1 - 0.01), (0.405, 0.415), TRIM, 0.003)

# what every New York fridge has anyway, kept to the back row so your own food sits in front
BY = 0.5
# milk carton with a gable top, a jar of pickles, mustard
box('milk', (-0.33, -0.25), (BY - 0.04, BY + 0.04), (0.93, 1.10), MILK, 0.004)
box('milk-band', (-0.332, -0.248), (BY - 0.042, BY + 0.042), (0.97, 1.03), BLUE)
box('milk-gable', (-0.33, -0.25), (BY - 0.006, BY + 0.006), (1.10, 1.135), MILK, 0.002)
cyl('pickles', (-0.17, BY, 1.0), 0.045, 0.13, PICKLE, bevel=0.006)
cyl('pickles-lid', (-0.17, BY, 1.072), 0.047, 0.018, YEL, bevel=0.004)
cyl('seltzer1', (0.02, BY + 0.02, 0.992), 0.033, 0.122, CAN, bevel=0.006)
cyl('seltzer2', (0.095, BY, 0.992), 0.033, 0.122, mat('can-b', hexc('#58b4d8'), 0.25, metal=1.0), bevel=0.006)
# takeout pails and a deli container on the second shelf
for i, (x, c) in enumerate(((0.2, PAPER_W), (0.3, PAPER_W))):
    cyl(f'pail{i}', (x, BY + 0.02 * i, 0.70 + 0.05), 0.05, 0.1, c, r2=0.036, verts=4, rot=(math.radians(180), 0, math.radians(45 + 8 * i)))
    box(f'pail-flap{i}', (x - 0.04, x + 0.04), (BY + 0.02 * i - 0.002, BY + 0.02 * i + 0.002), (0.80, 0.83), c)
cyl('deli', (-0.27, BY, 0.745), 0.06, 0.09, mat('deli', (0.95, 0.97, 0.97), 0.1, trans=0.7), r2=0.05, bevel=0.004, rot=(math.radians(180), 0, 0))
cyl('deli-soup', (-0.27, BY, 0.735), 0.05, 0.06, mat('soup', hexc('#d98a2b'), 0.4), r2=0.044, rot=(math.radians(180), 0, 0))
cyl('deli-lid', (-0.27, BY, 0.793), 0.063, 0.008, mat('lid', (0.93, 0.95, 0.95), 0.2, trans=0.5))
# egg carton and a foil-covered plate on the third shelf
box('eggs', (-0.34, -0.1), (BY - 0.06, BY + 0.05), (0.47, 0.53), CARTON, 0.012)
for i in range(4):
    ball(f'egg{i}', (-0.31 + i * 0.06, BY - 0.02, 0.53), 0.024, mat(f'eggshell{i}', hexc('#f3e3c8'), 0.5), scale=(1, 1, 1.25))
cyl('plate', (0.2, BY, 0.478), 0.11, 0.012, PAPER_W, bevel=0.004)
ball('foil', (0.2, BY, 0.485), 0.095, mat('foil', (0.85, 0.86, 0.88), 0.35, metal=1.0), scale=(1, 1, 0.42))
add_noise(bpy.data.materials['foil'], 45, 1.0)

# ---------- freezer door (stays shut) ----------
box('fz-door', (X0, X1), (-0.075, -0.008), (ZM + 0.006, Z1), ENAMEL, 0.028, )
box('fz-gasket', (X0 + 0.012, X1 - 0.012), (-0.012, 0.0), (ZM + 0.016, Z1 - 0.012), RUBBER)
cyl('fz-handle', (X0 + 0.075, -0.125, ZM + 0.19), 0.016, 0.24, CHROME, bevel=0.01)
for z in (ZM + 0.1, ZM + 0.28):
    cyl(f'fz-post{z}', (X0 + 0.075, -0.098, z), 0.012, 0.055, CHROME, rot=(math.radians(90), 0, 0))
# nameplate
box('badge', (X1 - 0.24, X1 - 0.08), (-0.082, -0.07), (Z1 - 0.085, Z1 - 0.055), CHROME, 0.008)
# the note and the photo that are on the fridge in the room painting
box('note', (0.0, 0.085), (-0.079, -0.0745), (ZM + 0.13, ZM + 0.24), PAPER_Y, rot=(0, math.radians(-4), 0))
ball('note-pin', (0.04, -0.08, ZM + 0.228), 0.012, YEL, scale=(1, 0.5, 1))
box('photo', (0.16, 0.27), (-0.079, -0.0745), (ZM + 0.07, ZM + 0.2), PAPER_W, rot=(0, math.radians(7), 0))
box('photo-pic', (0.17, 0.26), (-0.0805, -0.076), (ZM + 0.098, ZM + 0.19), PHOTO, rot=(0, math.radians(7), 0))
ball('photo-pin', (0.2, -0.08, ZM + 0.195), 0.012, BLUE, scale=(1, 0.5, 1))

# ---------- the door that opens (hinged on the right) ----------
bpy.ops.object.empty_add(location=(X1 - 0.004, -0.008, 0))
HINGE = bpy.context.object
HINGE.name = 'hinge'
DZ0, DZ1 = Z0 + 0.004, ZM - 0.006
DY0 = -0.075  # the door's outer face
box('door', (X0, X1), (DY0, -0.008), (DZ0, DZ1), ENAMEL, 0.028, HINGE)
box('door-liner', (X0 + 0.03, X1 - 0.03), (-0.012, 0.012), (DZ0 + 0.03, DZ1 - 0.03), LINER, 0.008, HINGE)
for nm, x, z in (('g-l', (X0 + 0.02, X0 + 0.045), (DZ0 + 0.02, DZ1 - 0.02)), ('g-r', (X1 - 0.045, X1 - 0.02), (DZ0 + 0.02, DZ1 - 0.02)), ('g-t', (X0 + 0.02, X1 - 0.02), (DZ1 - 0.045, DZ1 - 0.02)), ('g-b', (X0 + 0.02, X1 - 0.02), (DZ0 + 0.02, DZ0 + 0.045))):
    box(nm, x, (-0.01, 0.02), z, RUBBER, 0.006, HINGE)
cyl('handle', (X0 + 0.075, -0.125, DZ1 - 0.26), 0.016, 0.4, CHROME, bevel=0.01, parent=HINGE)
for z in (DZ1 - 0.09, DZ1 - 0.43):
    cyl(f'post{z}', (X0 + 0.075, -0.098, z), 0.012, 0.055, CHROME, rot=(math.radians(90), 0, 0), parent=HINGE)
# bins on the inside of the door, with what lives in them
BX0, BX1 = X0 + 0.075, X1 - 0.075
BINS = [0.9, 0.66, 0.4]
for i, z in enumerate(BINS):
    box(f'bin-floor{i}', (BX0, BX1), (0.01, 0.115), (z - 0.008, z), LINER, 0.003, HINGE)
    box(f'bin-rail{i}', (BX0, BX1), (0.105, 0.118), (z + 0.035, z + 0.06), TRIM, 0.005, HINGE)
    for sx in (BX0, BX1 - 0.01):
        box(f'bin-side{i}{sx:.2f}', (sx, sx + 0.01), (0.01, 0.118), (z - 0.008, z + 0.06), LINER, 0.003, HINGE)
# butter shelf with a lid
box('butter-lid', (BX0 + 0.02, 0.0), (0.02, 0.11), (1.07, 1.13), DRAWER, 0.008, HINGE)
box('butter', (BX0 + 0.06, -0.06), (0.04, 0.09), (1.075, 1.1), BUTTER, 0.004, HINGE)


def bottle(nm, x, z, r, h, m, cap, neck=0.45):
    cyl(nm, (x, 0.062, z + h * 0.35), r, h * 0.7, m, bevel=0.008, parent=HINGE)
    cyl(nm + '-neck', (x, 0.062, z + h * 0.8), r, h * 0.22, m, r2=r * neck, parent=HINGE)
    cyl(nm + '-cap', (x, 0.062, z + h * 0.95), r * neck * 1.1, h * 0.1, cap, bevel=0.003, parent=HINGE)


bottle('ketchup', 0.24, 0.9, 0.034, 0.2, RED, PAPER_W)
bottle('mustard', 0.15, 0.9, 0.03, 0.17, YEL, RED, 0.3)
bottle('hot', 0.07, 0.9, 0.022, 0.16, mat('hot', hexc('#c9401c'), 0.15, trans=0.3), mat('capg', hexc('#3f9a55'), 0.4), 0.5)
cyl('jam', (-0.03, 0.062, 0.945), 0.035, 0.09, mat('jam', hexc('#8a1f3c'), 0.1, trans=0.4), bevel=0.006, parent=HINGE)
cyl('jam-lid', (-0.03, 0.062, 0.995), 0.037, 0.014, PAPER_W, bevel=0.003, parent=HINGE)
bottle('seltzer-b', 0.2, 0.66, 0.042, 0.23, GREEN_B, PAPER_W)
box('oj', (0.03, 0.11), (0.025, 0.1), (0.66, 0.84), mat('oj', hexc('#f39a1d'), 0.5), 0.004, HINGE)
box('oj-gable', (0.03, 0.11), (0.056, 0.068), (0.84, 0.872), mat('oj2', hexc('#f39a1d'), 0.5), 0.002, HINGE)
bottle('soy', -0.07, 0.66, 0.026, 0.17, mat('soy', hexc('#2a1a12'), 0.1, trans=0.3), RED, 0.5)
cyl('yog1', (-0.2, 0.062, 0.695), 0.034, 0.07, PAPER_W, r2=0.028, parent=HINGE, rot=(math.radians(180), 0, 0))
cyl('yog2', (-0.2, 0.062, 0.765), 0.034, 0.07, mat('yogb', hexc('#e87aa0'), 0.5), r2=0.028, parent=HINGE, rot=(math.radians(180), 0, 0))
bottle('water', 0.2, 0.4, 0.045, 0.24, mat('water', (0.8, 0.92, 0.98), 0.05, trans=0.9), BLUE)
bottle('beer1', 0.07, 0.4, 0.03, 0.2, mat('amber', hexc('#7a4a14'), 0.08, trans=0.6), YEL, 0.4)
bottle('beer2', -0.02, 0.4, 0.03, 0.2, bpy.data.materials['amber'], YEL, 0.4)

nt = PHOTO.node_tree
img = nt.nodes.new('ShaderNodeTexImage')
img.image = bpy.data.images.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skyline.png'))
nt.links.new(img.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])

# ink lines, like everything else in the game
if '--noline' not in sys.argv:
    S.render.use_freestyle = True
    S.render.line_thickness = 2.2
    vl = S.view_layers[0]
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(120)
    ls = fs.linesets.new('ink')
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.select_external_contour = True
    ls.linestyle.color = hexc('#1d2140')
    ls.linestyle.thickness = 2.2

# ---------- light ----------
world = bpy.data.worlds.new('w')
S.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (*hexc('#f1c79a'), 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.22


def light(nm, kind, loc, energy, color, size=1.0, rot=(0, 0, 0)):
    d = bpy.data.lights.new(nm, kind)
    d.energy = energy
    d.color = color
    if kind == 'AREA':
        d.size = size
    else:
        d.shadow_soft_size = size
    o = bpy.data.objects.new(nm, d)
    o.location = loc
    o.rotation_euler = rot
    S.collection.objects.link(o)
    return o


# the pendant lamp, up and to the left; sunset from the window; a cool fill from the room
light('key', 'AREA', (-1.3, -1.9, 2.5), 95, (1.0, 0.86, 0.62), 1.2, (math.radians(52), 0, math.radians(-32)))
light('sun', 'AREA', (-3.2, -1.2, 1.3), 42, (1.0, 0.55, 0.3), 1.6, (math.radians(84), 0, math.radians(-68)))
light('fill', 'AREA', (1.8, -2.6, 1.2), 34, (0.72, 0.8, 1.0), 2.5, (math.radians(80), 0, math.radians(32)))
light('inside', 'POINT', (IX1 - 0.09, 0.28, IZ1 - 0.1), 9, (1.0, 0.95, 0.85), 0.05)
light('inside-fill', 'POINT', (0, 0.16, 0.66), 4.5, (0.85, 0.93, 1.0), 0.1)

# ---------- camera ----------
cam_d = bpy.data.cameras.new('cam')
cam_d.lens = 50
CAM = bpy.data.objects.new('cam', cam_d)
S.collection.objects.link(CAM)
S.camera = CAM
CAM.rotation_euler = (math.radians(90), 0, 0)
TOP = Z1 + 0.07  # the top of the picture: a little wall above the fridge


def pose(t):
    """t 0..1: the door shut and close-up, to open and stepped back half a pace to the right"""
    e = t * t * (3 - 2 * t)
    width = 2.05 + 0.3 * e
    dist = width / 0.72
    CAM.location = (0.0 + 0.3 * e, DY0 - dist, TOP - width * 0.565 / 2)


N = 22
OPEN = math.radians(124)


def angle(i):
    t = i / (N - 1)
    # eases out, with the door settling back a touch at the end of its swing
    e = 1 - (1 - t) ** 3
    return OPEN * (e + 0.035 * math.sin(math.pi * min(1, t * 1.0)) * (t > 0.75) * 0), e


def px(v):
    c = world_to_camera_view(S, CAM, Vector(v))
    return [round(c.x * 1000, 2), round((1 - c.y) * 565, 2)]


def local(v):
    return HINGE.matrix_world @ (Vector(v) - Vector((X1 - 0.004, -0.008, 0)))


frames = []
todo = range(N) if MODE == 'frames' else ((0, N - 1) if MODE == 'test' else ())
for i in range(N):
    a, e = angle(i)
    HINGE.rotation_euler = (0, 0, a)
    pose(i / (N - 1))
    bpy.context.view_layer.update()
    quad = [px(local(v)) for v in ((X0, DY0, DZ1), (X1, DY0, DZ1), (X1, DY0, DZ0), (X0, DY0, DZ0))]
    inner = [px(local(v)) for v in ((X1, 0.0, DZ1), (X0, 0.0, DZ1), (X0, 0.0, DZ0), (X1, 0.0, DZ0))]
    sh = []
    for z in SHELVES:
        base, up = px((0, 0.24, z)), px((0, 0.24, z + 0.1))
        sh.append({'l': px((IX0 + 0.06, 0.24, z)), 'r': px((IX1 - 0.06, 0.24, z)), 'ppm': round((base[1] - up[1]) * 10, 2)})
    frames.append({'deg': round(math.degrees(a), 2), 'door': quad, 'inner': inner, 'shelves': sh, 'mouth': [px((IX0, 0, IZ1)), px((IX1, 0, IZ0))]})
    if i in todo:
        S.render.filepath = os.path.join(OUT, f'f{i:02d}.png')
        bpy.ops.render.render(write_still=True)

# overlay data, in stage pixels (1000 x 565)
HINGE.rotation_euler = (0, 0, 0)
pose(0)
bpy.context.view_layer.update()
hz0, hz1 = DZ1 - 0.47, DZ1 - 0.05
data = {
    'n': N,
    'frames': frames,
    'doorZ': [DZ0, DZ1],
    'handle': [px((X0 + 0.03, -0.125, hz1)), px((X0 + 0.12, -0.125, hz0))],
    'bottomShare': None,
}
# how far down the door the picture reaches when shut (magnets stay above it)
top_px, bot_px = px((0, DY0, DZ1))[1], px((0, DY0, DZ0))[1]
data['doorVisible'] = round((565 - top_px) / (bot_px - top_px), 4)
HINGE.rotation_euler = (0, 0, OPEN)
pose(1)
bpy.context.view_layer.update()
FY = 0.24  # where your own food stands on a shelf: the front row
shelves = []
for z in SHELVES:
    l, r = px((IX0 + 0.05, FY, z)), px((IX1 - 0.05, FY, z))
    up = px((0, FY, z + 0.1))
    base = px((0, FY, z))
    shelves.append({'l': l, 'r': r, 'px_per_m': round((base[1] - up[1]) * 10, 2)})
data['shelves'] = shelves
data['inside'] = [px((IX0, 0, IZ1)), px((IX1, 0, IZ0))]
json.dump(data, open(os.path.join(OUT, 'fridge.json'), 'w'))
print('DONE', MODE)
