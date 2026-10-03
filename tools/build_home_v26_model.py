#!/usr/bin/env python3
import json
import math
import hashlib
from pathlib import Path

import numpy as np
import trimesh
from shapely.geometry import Polygon
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath
from trimesh.visual.material import PBRMaterial

OUT = Path('assets/models/webinsolito-hero-v26.glb')
MANIFEST = Path('assets/models/webinsolito-hero-v26.manifest.json')
OUT.parent.mkdir(parents=True, exist_ok=True)
scene = trimesh.Scene()


def pbr(name, rgba, metallic, roughness, emissive=None):
    kw = {
        'name': name,
        'baseColorFactor': np.array(rgba, dtype=np.uint8),
        'metallicFactor': float(metallic),
        'roughnessFactor': float(roughness),
    }
    if emissive is not None:
        kw['emissiveFactor'] = np.array(emissive, dtype=float)
    return PBRMaterial(**kw)


GOLD = pbr('ChampagneGoldMirror', [224, 163, 87, 255], 1.0, 0.11)
GOLD_HI = pbr('WarmIvoryGold', [255, 226, 177, 255], 0.98, 0.075)
GOLD_MID = pbr('SatinChampagne', [199, 132, 58, 255], 0.96, 0.16)
GOLD_DARK = pbr('AntiqueGoldShadow', [103, 58, 25, 255], 0.94, 0.22)
PETROL = pbr('DeepPetrolClearcoat', [3, 29, 42, 255], 0.44, 0.17)
PETROL_INNER = pbr('DeepPetrolInner', [2, 13, 20, 255], 0.56, 0.28)
MAP_GOLD = pbr('RaisedMapGold', [235, 185, 101, 255], 0.91, 0.14)
SPARK = pbr('SparkGold', [255, 220, 158, 255], 0.95, 0.07)


def add(mesh, name, material, transform=None):
    m = mesh.copy()
    m.visual.material = material
    scene.add_geometry(
        m,
        geom_name=name,
        node_name=name,
        transform=np.eye(4) if transform is None else transform,
    )


def rot_xyz(rx=0.0, ry=0.0, rz=0.0):
    return trimesh.transformations.euler_matrix(rx, ry, rz, 'sxyz')


def tangent_transform(lat_deg, lon_deg, radius, local_scale=1.0):
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    radial = np.array([
        math.cos(lat) * math.sin(lon),
        math.sin(lat),
        math.cos(lat) * math.cos(lon),
    ], dtype=float)
    east = np.array([math.cos(lon), 0.0, -math.sin(lon)], dtype=float)
    north = np.cross(radial, east)
    north /= np.linalg.norm(north)
    T = np.eye(4)
    T[:3, 0] = east * local_scale
    T[:3, 1] = north * local_scale
    T[:3, 2] = radial
    T[:3, 3] = radial * radius
    return T


def dense_polygon(points, subdivisions=4):
    out = []
    for i, a in enumerate(points):
        b = points[(i + 1) % len(points)]
        for s in range(subdivisions):
            t = s / subdivisions
            out.append((a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t))
    return out


def add_land(name, points, lat, lon, scale=0.42, height=0.060, material=MAP_GOLD):
    poly = Polygon(dense_polygon(points, 4))
    mesh = trimesh.creation.extrude_polygon(poly, height=height, engine='earcut')
    mesh.apply_translation([0, 0, 0.008])
    T = tangent_transform(lat, lon, 1.225, scale)
    add(mesh, name, material, T)


# ------------------------------------------------------------
# GLOBE: smoother shell + inner depth
# ------------------------------------------------------------
add(trimesh.creation.icosphere(subdivisions=6, radius=1.220), 'globe_core', PETROL)
add(trimesh.creation.icosphere(subdivisions=5, radius=1.197), 'globe_inner', PETROL_INNER)

# Fine metallic equatorial rim + secondary rim
for idx, (major, minor, mat) in enumerate([
    (1.236, 0.028, GOLD),
    (1.252, 0.010, GOLD_HI),
], 1):
    rim = trimesh.creation.torus(major_radius=major, minor_radius=minor, major_sections=220, minor_sections=18)
    add(rim, f'globe_rim_{idx:02d}', mat, rot_xyz(math.pi / 2, 0, 0))

# Latitude rings: subtle, high section count
for i, (z, r) in enumerate([
    (-0.84, 0.885), (-0.58, 1.075), (-0.29, 1.185),
    (0.0, 1.222), (0.29, 1.185), (0.58, 1.075), (0.84, 0.885)
], 1):
    tor = trimesh.creation.torus(major_radius=r, minor_radius=0.0075, major_sections=200, minor_sections=10)
    T = np.eye(4)
    T[2, 3] = z
    add(tor, f'latitude_{i:02d}', MAP_GOLD, T)

# Meridian rings
for i, ang in enumerate(np.linspace(0, math.pi, 8, endpoint=False), 1):
    tor = trimesh.creation.torus(major_radius=1.225, minor_radius=0.0075, major_sections=200, minor_sections=10)
    add(tor, f'meridian_{i:02d}', MAP_GOLD, rot_xyz(math.pi / 2, 0, float(ang)))

# ------------------------------------------------------------
# RAISED CONTINENTS: solid extruded landmasses, not line tubes
# ------------------------------------------------------------
AFRICA = [(-0.75,0.80),(-0.30,1.00),(0.18,0.90),(0.47,0.52),(0.48,0.05),(0.30,-0.38),(0.08,-0.85),(-0.19,-1.02),(-0.48,-0.60),(-0.62,-0.12),(-0.86,0.20)]
EUROPE = [(-0.85,0.05),(-0.62,0.42),(-0.36,0.50),(-0.10,0.38),(0.10,0.52),(0.33,0.30),(0.58,0.26),(0.79,0.00),(0.58,-0.20),(0.30,-0.15),(0.08,-0.34),(-0.20,-0.23),(-0.40,-0.38),(-0.66,-0.22)]
ASIA = [(-0.95,0.28),(-0.68,0.60),(-0.28,0.78),(0.10,0.65),(0.44,0.86),(0.78,0.60),(0.98,0.28),(0.82,0.00),(0.52,-0.18),(0.32,-0.55),(0.00,-0.42),(-0.26,-0.62),(-0.48,-0.35),(-0.72,-0.28)]
INDIA = [(-0.32,0.42),(0.12,0.52),(0.34,0.12),(0.24,-0.35),(0.00,-0.88),(-0.18,-0.35)]
ARABIA = [(-0.48,0.42),(0.22,0.46),(0.50,0.00),(0.16,-0.45),(-0.38,-0.28)]
N_AMERICA = [(-0.92,0.42),(-0.65,0.82),(-0.20,0.94),(0.20,0.72),(0.62,0.78),(0.92,0.50),(0.72,0.10),(0.43,-0.12),(0.22,-0.55),(-0.16,-0.50),(-0.40,-0.18),(-0.74,-0.02)]
S_AMERICA = [(-0.52,0.88),(0.00,0.95),(0.42,0.60),(0.52,0.16),(0.32,-0.18),(0.18,-0.62),(-0.10,-1.00),(-0.31,-0.54),(-0.40,-0.06)]
AUSTRALIA = [(-0.72,0.26),(-0.40,0.62),(0.12,0.70),(0.62,0.40),(0.78,0.00),(0.50,-0.44),(0.02,-0.60),(-0.50,-0.42)]
GREENLAND = [(-0.40,0.50),(-0.10,0.92),(0.32,0.78),(0.50,0.24),(0.18,-0.50),(-0.26,-0.30)]

land_specs = [
    ('land_africa', AFRICA, 4, 9, 0.43, 0.066, MAP_GOLD),
    ('land_europe', EUROPE, 49, 13, 0.29, 0.052, GOLD_HI),
    ('land_asia', ASIA, 42, 63, 0.49, 0.052, MAP_GOLD),
    ('land_india', INDIA, 18, 76, 0.21, 0.055, GOLD_MID),
    ('land_arabia', ARABIA, 22, 45, 0.19, 0.050, GOLD_MID),
    ('land_north_america', N_AMERICA, 40, -102, 0.48, 0.050, MAP_GOLD),
    ('land_south_america', S_AMERICA, -18, -60, 0.39, 0.052, GOLD_MID),
    ('land_australia', AUSTRALIA, -24, 134, 0.30, 0.050, GOLD_MID),
    ('land_greenland', GREENLAND, 70, -42, 0.20, 0.045, GOLD_HI),
]
for args in land_specs:
    add_land(*args)

# Tiny island relief points
islands = [
    ('island_uk', 54, -3, 0.050), ('island_iceland', 65, -19, 0.038),
    ('island_madagascar', -20, 47, 0.060), ('island_japan', 37, 138, 0.042),
    ('island_sicily', 37, 14, 0.028), ('island_sri_lanka', 7, 81, 0.027),
]
for name, lat, lon, radius in islands:
    sphere = trimesh.creation.icosphere(subdivisions=2, radius=radius)
    add(sphere, name, GOLD_HI, tangent_transform(lat, lon, 1.265, 1.0))

# ------------------------------------------------------------
# ARMILLARY STRUCTURE: thicker, cleaner, more luxurious
# ------------------------------------------------------------
axis = trimesh.creation.cylinder(radius=0.032, height=4.35, sections=48)
add(axis, 'axis_vertical', GOLD, rot_xyz(math.pi/2, 0, 0))

for name, y, radius, mat in [
    ('axis_top_crown', 2.18, 0.125, GOLD),
    ('axis_top_tip', 2.38, 0.052, GOLD_HI),
    ('axis_bottom_crown', -2.18, 0.112, GOLD),
    ('axis_bottom_tip', -2.36, 0.040, GOLD_HI),
]:
    sph = trimesh.creation.icosphere(subdivisions=4, radius=radius)
    T = np.eye(4)
    T[1, 3] = y
    add(sph, name, mat, T)

# Collar details around the axis
for i, y in enumerate([1.72, 1.48, -1.48, -1.72], 1):
    tor = trimesh.creation.torus(major_radius=0.095, minor_radius=0.018, major_sections=72, minor_sections=12)
    T = rot_xyz(math.pi/2, 0, 0)
    T[1, 3] = y
    add(tor, f'axis_collar_{i:02d}', GOLD_DARK if i % 2 else GOLD_HI, T)

rings = [
    ('orbit_ring_01', 1.72, 0.034, (math.radians(63), math.radians(15), math.radians(-17)), GOLD),
    ('orbit_ring_02', 1.67, 0.031, (math.radians(31), math.radians(69), math.radians(25)), GOLD_MID),
    ('orbit_ring_03', 1.76, 0.028, (math.radians(85), math.radians(2), math.radians(61)), GOLD_HI),
    ('orbit_ring_04', 1.59, 0.024, (math.radians(13), math.radians(58), math.radians(-38)), GOLD_DARK),
]
for name, major, minor, angles, material in rings:
    tor = trimesh.creation.torus(major_radius=major, minor_radius=minor, major_sections=256, minor_sections=20)
    add(tor, name, material, rot_xyz(*angles))

outer = trimesh.creation.torus(major_radius=1.90, minor_radius=0.018, major_sections=256, minor_sections=14)
add(outer, 'armillary_outer', GOLD_HI, rot_xyz(math.pi/2, 0, 0))

# ------------------------------------------------------------
# PLANETS: smooth metallic spheres + ornamental micro-rings
# ------------------------------------------------------------
planet_specs = [
    ('planet_01', (-1.56, 0.48, 0.72), 0.17, GOLD),
    ('planet_02', (1.45, 0.65, 0.79), 0.225, GOLD_HI),
    ('planet_03', (-1.10, -1.25, 0.80), 0.205, GOLD),
    ('planet_04', (1.31, -1.08, 0.54), 0.135, GOLD_DARK),
    ('planet_05', (0.90, 1.42, 0.46), 0.155, GOLD_MID),
]
for idx, (name, pos, radius, material) in enumerate(planet_specs, 1):
    sphere = trimesh.creation.icosphere(subdivisions=5, radius=radius)
    T = np.eye(4)
    T[:3, 3] = pos
    add(sphere, name, material, T)
    if idx in (2, 3):
        tor = trimesh.creation.torus(major_radius=radius * 1.42, minor_radius=radius * 0.055, major_sections=96, minor_sections=10)
        RT = rot_xyz(math.radians(70 if idx == 2 else 38), math.radians(18), math.radians(22))
        RT[:3, 3] = pos
        add(tor, f'planet_ring_{idx:02d}', GOLD_HI, RT)

# ------------------------------------------------------------
# W: one real extruded serif glyph, not four boxes
# ------------------------------------------------------------
font = FontProperties(family='DejaVu Serif', weight='bold')
path = TextPath((0, 0), 'W', size=1.0, prop=font)
polys = path.to_polygons()
if not polys:
    raise RuntimeError('Unable to build W glyph')
poly_arr = max(polys, key=lambda p: abs(Polygon(p).area))
poly = Polygon(poly_arr)
minx, miny, maxx, maxy = poly.bounds
cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
poly = Polygon([(x - cx, y - cy) for x, y in poly.exterior.coords])
scale = 1.36 / max(maxx - minx, maxy - miny)
poly = Polygon([(x * scale, y * scale) for x, y in poly.exterior.coords])
w_mesh = trimesh.creation.extrude_polygon(poly, height=0.145, engine='earcut')
w_mesh.apply_translation([0, 0, -0.0725])
WT = np.eye(4)
WT[:3, 3] = [0.0, 0.055, 1.345]
add(w_mesh, 'logo_W_gold', GOLD_HI, WT)

# Inset/backing W for depth shadow
w_back = w_mesh.copy()
BT = np.eye(4)
BT[:3, 3] = [0.0, 0.055, 1.300]
add(w_back, 'logo_W_shadow', GOLD_DARK, BT)

# 3D diamond/star below W
star_points = []
for i in range(16):
    a = i * math.pi / 8
    r = 0.125 if i % 2 == 0 else 0.047
    star_points.append((r * math.cos(a), r * math.sin(a)))
star = trimesh.creation.extrude_polygon(Polygon(star_points), height=0.11, engine='earcut')
ST = np.eye(4)
ST[:3, 3] = [0, -0.66, 1.34]
add(star, 'logo_star', GOLD_HI, ST)

# Accent gems/sparks
spark_specs = [
    ((-1.90,1.40,0.22),0.035),((1.85,1.30,0.18),0.030),
    ((-1.72,-1.40,0.12),0.026),((1.74,-1.40,0.24),0.034),
    ((0,1.98,0.20),0.027),((0.22,-1.96,0.27),0.022),
    ((-1.48,1.02,1.08),0.022),((1.55,-0.57,1.07),0.026),
]
for i, (pos, radius) in enumerate(spark_specs, 1):
    gem = trimesh.creation.icosphere(subdivisions=3, radius=radius)
    T = np.eye(4)
    T[:3, 3] = pos
    add(gem, f'spark_{i:02d}', SPARK, T)

# Export + manifest
blob = scene.export(file_type='glb')
OUT.write_bytes(blob)
faces = sum(len(g.faces) for g in scene.geometry.values())
verts = sum(len(g.vertices) for g in scene.geometry.values())
sha = hashlib.sha256(blob).hexdigest()

manifest = {
    'model': OUT.name,
    'bytes': len(blob),
    'sha256': sha,
    'geometries': len(scene.geometry),
    'vertices': verts,
    'faces': faces,
    'materials': sorted({getattr(g.visual.material, 'name', '') for g in scene.geometry.values()}),
    'key_nodes': [
        'globe_core','globe_inner','land_africa','land_europe','land_asia',
        'logo_W_gold','logo_star','axis_vertical','armillary_outer',
        'orbit_ring_01','orbit_ring_02','orbit_ring_03','orbit_ring_04',
        'planet_01','planet_02','planet_03','planet_04','planet_05'
    ],
    'notes': 'Model-only V26: raised solid landmasses, real extruded serif W, refined armillary and high-detail PBR geometry.'
}
MANIFEST.write_text(json.dumps(manifest, indent=2), encoding='utf-8')

print(f'MODEL_PATH={OUT}')
print(f'MODEL_BYTES={len(blob)}')
print(f'MODEL_SHA256={sha}')
print(f'MODEL_GEOMETRIES={len(scene.geometry)}')
print(f'MODEL_VERTICES={verts}')
print(f'MODEL_FACES={faces}')

assert blob[:4] == b'glTF'
assert len(blob) > 1_000_000
assert faces > 180_000
assert len(scene.geometry) >= 55
assert 'logo_W_gold' in scene.graph.nodes_geometry
