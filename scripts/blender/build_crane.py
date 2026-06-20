# -*- coding: utf-8 -*-
"""
LogisTwin 3D — 스태커 크레인 절차적 생성 (Blender bpy, headless).

  blender --background --python build_crane.py -- <mast_h> <out.glb> [accent_rgb]

좌표(Blender Z-up; glTF 내보내기 시 +Y-up 변환):
  Blender +Z → glTF +Y (위)         : 마스트/승강
  Blender +X → glTF +X (통로 주행)  : 크레인은 X로 얇음
  Blender -Y → glTF +Z (랙 깊이)    : 포크 신축 방향

애니메이션을 위해 'carriage'(승강), 'fork'(신축) 엠프티 노드를 분리해 둡니다.
R3F에서 carriage.position.y(승강), fork.position.z(신축)을 제어합니다.
"""
import bpy, bmesh, sys, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
MAST_H = float(argv[0]) if len(argv) > 0 else 8.0
OUT = argv[1] if len(argv) > 1 else 'crane.glb'
ACCENT = tuple(float(x) for x in argv[2].split(',')) if len(argv) > 2 else (0.85, 0.55, 0.05)

# ── 초기화 ────────────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, metal=0.0, rough=0.5, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit > 0:
        b.inputs['Emission Color'].default_value = (*color, 1)
        b.inputs['Emission Strength'].default_value = emit
    return m


M_STEEL = mat('steel', (0.55, 0.58, 0.62), 0.85, 0.38)
M_DARK = mat('dark', (0.10, 0.12, 0.14), 0.6, 0.55)
M_ACCENT = mat('accent', ACCENT, 0.35, 0.42)
M_HAZARD = mat('hazard', (0.92, 0.74, 0.06), 0.25, 0.45)
M_BEACON = mat('beacon', (1.0, 0.45, 0.1), 0.0, 0.3, emit=6.0)


def box(name, sx, sy, sz, loc, material, bevel=0.012, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    o.data.materials.append(material)
    if parent:
        o.parent = parent
    return o


def cyl(name, r, h, loc, material, axis='Z', parent=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, vertices=20)
    o = bpy.context.object
    o.name = name
    if axis == 'Y':
        o.rotation_euler[0] = math.pi / 2
    o.data.materials.append(material)
    if parent:
        o.parent = parent
    return o


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    bpy.context.collection.objects.link(e)
    if parent:
        e.parent = parent
    return e


# ── 루트 ──────────────────────────────────────────────────
root = empty('Crane')
BASE_Z = 0.26  # 주행대 상단 높이(레일 위)

# 하부 주행대 (드라이브 유닛) + 경고 스트라이프 + 완충기 + 주행 바퀴
box('base', 0.62, 2.6, 0.5, (0, 0, BASE_Z), M_DARK, parent=root)
box('hazard', 0.66, 2.5, 0.12, (0, 0, BASE_Z + 0.28), M_HAZARD, bevel=0.0, parent=root)
for sy in (-1.18, 1.18):
    box('buffer', 0.5, 0.18, 0.34, (0, sy, BASE_Z), M_ACCENT, parent=root)
for sy in (-1.05, 1.05):
    cyl('wheel', 0.15, 0.42, (0, sy, 0.12), M_STEEL, axis='Y', parent=root)

# 단일 박스 마스트 + 전면 가이드 채널(카운터 컬러)
MZ0 = BASE_Z + 0.25
box('mast', 0.34, 0.30, MAST_H, (0, 0.08, MZ0 + MAST_H / 2), M_STEEL, parent=root)
box('mast_channel', 0.18, 0.06, MAST_H - 0.3, (0, -0.10, MZ0 + MAST_H / 2), M_DARK, bevel=0.0, parent=root)

# 점검 사다리 (마스트 뒤쪽 가로 발판)
n_rung = max(4, int(MAST_H / 0.55))
for i in range(1, n_rung):
    z = MZ0 + MAST_H * i / n_rung
    box('rung', 0.26, 0.04, 0.04, (0, 0.30, z), M_STEEL, bevel=0.0, parent=root)

# 상부 가이드대(상부 레일 주행) + 회전 비콘
box('top', 0.5, 2.0, 0.3, (0, 0.08, MZ0 + MAST_H + 0.16), M_DARK, parent=root)
cyl('beacon', 0.1, 0.2, (0, 0.08, MZ0 + MAST_H + 0.44), M_BEACON, parent=root)

# ── 승강 캐리지 (carriage) + 텔레스코픽 포크 (fork) ────────
carriage = empty('carriage', (0, 0, 0), parent=root)
CY = MZ0  # 1층 캐리지 높이(=마스트 시작). R3F가 carriage.y로 승강
# 마스트 전면을 감싸는 리프트 플랫폼 + 제어 캐비닛
box('platform', 0.5, 0.34, 0.6, (0, -0.22, CY + 0.3), M_ACCENT, parent=carriage)
box('cabinet', 0.3, 0.22, 0.34, (0.0, -0.30, CY + 0.78), M_STEEL, parent=carriage)
box('carriage_yoke', 0.42, 0.5, 0.18, (0, 0.0, CY + 0.1), M_DARK, parent=carriage)

fork = empty('fork', (0, -0.22, CY + 0.05), parent=carriage)
# 포크는 -Y(glTF +Z, 랙 방향)로 뻗음
box('fork_carriage', 0.52, 0.22, 0.4, (0, -0.05, 0.18), M_STEEL, parent=fork)
for sx in (-0.18, 0.18):
    box('tine', 0.08, 1.1, 0.06, (sx, -0.62, 0.0), M_DARK, bevel=0.0, parent=fork)

# ── 내보내기 ──────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_apply=True,   # 모디파이어(베벨) 적용
    export_yup=True,
)
print('EXPORTED:', OUT)
