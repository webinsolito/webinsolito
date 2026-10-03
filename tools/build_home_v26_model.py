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


def pbr(name, rgba, metallic, roughness):
    return PBRMaterial(
        name=name,
        baseColorFactor=np.array(rgba, dtype=np.uint8),
        metallicFactor=float(metallic),
        roughnessFactor=float(roughness),
    )


GOLD = pbr('ChampagneGoldMirror', [224, 163, 87, 255], 1.0, 0.10)
GOLD_HI = pbr('WarmIvoryGold', [255, 226, 177, 255], 0.98, 0.07)
GOLD_MID = pbr('SatinChampagne', [199, 132, 58, 255], 0.96, 0.15)
GOLD_DARK = pbr('AntiqueGoldShadow', [103, 58, 25, 255], 0.94, 0.21)
PETROL = pbr('DeepPetrolClearcoat', [3, 29, 42, 255], 0.44, 0.17)
PETROL_INNER = pbr('DeepPetrolInner', [2, 13, 20, 255], 0.56, 0.28)
MAP_GOLD = pbr('RaisedMapGold', [235, 185, 101, 255], 0.91, 0.13)
SPARK = pbr('SparkGold', [255, 220, 158, 255], 0.95, 0.06)


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


def sphere_point(lat_deg, lon_deg, radius=1.246):
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    return np.array([
        radius * math.cos(lat) * math.sin(lon),
        radius * math.sin(lat),
        radius * math.cos(lat) * math.cos(lon),
    ], dtype=float)


def cylinder_between(a, b, radius=0.008, sections=10):
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    if np.linalg.norm(b - a) < 1e-7:
        return None
    return trimesh.creation.cylinder(radius=radius, segment=np.vstack([a, b]), sections=sections)


def interpolate_latlon(a, b, steps=3):
    # Short segments, enough to visually hug the sphere instead of forming flat plates.
    return [
        (a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t)
        for t in np.linspace(0.0, 1.0, steps + 1)
    ]


def add_continent_outline(name, points, radius=1.246, tube=0.0085, material=MAP_GOLD):
    seg_index = 0
    for i in range(len(points)):
        a = points[i]
        b = points[(i + 1) % len(points)]
        dense = interpolate_latlon(a, b, 3)
        for j in range(len(dense) - 1):
            p0 = sphere_point(*dense[j], radius)
            p1 = sphere_point(*dense[j + 1], radius)
            mesh = cylinder_between(p0, p1, tube, 10)
            if mesh is not None:
                add(mesh, f'{name}_{seg_index:03d}', material)
                seg_index += 1


def add_continent_veins(name, lines, radius=1.244):
    idx = 0
    for line in lines:
        for j in range(len(line) - 1):
            dense = interpolate_latlon(line[j], line[j + 1], 2)
            for k in range(len(dense) - 1):
                mesh = cylinder_between(
                    sphere_point(*dense[k], radius),
                    sphere_point(*dense[k + 1], radius),
                    0.0038,
                    7,
                )
                if mesh is not None:
                    add(mesh, f'{name}_{idx:03d}', GOLD_MID)
                    idx += 1


# ------------------------------------------------------------------
# GLOBE: premium lacquer sphere. Coordinate system is Y-up, Z-front.
# ------------------------------------------------------------------
add(trimesh.creation.icosphere(subdivisions=6, radius=1.220), 'globe_core', PETROL)
add(trimesh.creation.icosphere(subdivisions=5, radius=1.197), 'globe_inner', PETROL_INNER)

# Front-facing double circumference, intentionally not rotated.
for idx, (major, minor, mat) in enumerate([
    (1.235, 0.026, GOLD),
    (1.253, 0.009, GOLD_HI),
], 1):
    add(
        trimesh.creation.torus(
            major_radius=major,
            minor_radius=minor,
            major_sections=240,
            minor_sections=18,
        ),
        f'globe_rim_{idx:02d}',
        mat,
    )

# Latitude circles are around the Y axis: rotate torus to XZ plane, translate in Y.
for i, (y, radius) in enumerate([
    (-0.82, 0.90), (-0.52, 1.105), (-0.25, 1.195),
    (0.0, 1.222), (0.25, 1.195), (0.52, 1.105), (0.82, 0.90),
], 1):
    tor = trimesh.creation.torus(
        major_radius=radius,
        minor_radius=0.0055,
        major_sections=200,
        minor_sections=9,
    )
    T = rot_xyz(math.pi / 2, 0, 0)
    T[1, 3] = y
    add(tor, f'latitude_{i:02d}', MAP_GOLD, T)

# Meridians are great circles containing the Y axis; rotate default XY torus around Y.
for i, ang in enumerate(np.linspace(0, math.pi, 7, endpoint=False), 1):
    tor = trimesh.creation.torus(
        major_radius=1.224,
        minor_radius=0.0055,
        major_sections=200,
        minor_sections=9,
    )
    add(tor, f'meridian_{i:02d}', MAP_GOLD, rot_xyz(0, float(ang), 0))

# ------------------------------------------------------------------
# CONTINENT RELIEF: true raised 3D outlines hugging the globe surface.
# No planar golden plates crossing through the W.
# ------------------------------------------------------------------
AFRICA = [(37,-10),(34,0),(32,11),(30,20),(22,32),(12,42),(2,42),(-10,36),(-22,31),(-34,19),(-35,11),(-28,4),(-20,-1),(-10,-7),(2,-13),(14,-17),(25,-15),(33,-11)]
EUROPE = [(36,-10),(43,-9),(48,-5),(51,1),(55,4),(59,10),(62,18),(59,26),(55,31),(50,27),(47,22),(44,16),(41,13),(38,9),(36,4),(36,-2)]
ASIA = [(50,28),(58,35),(64,45),(67,58),(66,72),(62,86),(58,101),(52,116),(48,132),(42,145),(36,140),(32,128),(25,119),(20,108),(17,96),(21,82),(27,70),(33,58),(40,48),(46,38)]
ARABIA_INDIA = [(32,35),(27,43),(20,52),(13,56),(9,64),(7,74),(10,79),(19,77),(25,70),(29,61),(31,51)]
N_AMERICA = [(72,-150),(68,-130),(60,-122),(53,-124),(48,-126),(42,-124),(35,-118),(28,-107),(22,-99),(18,-88),(24,-82),(31,-82),(39,-75),(47,-67),(55,-60),(63,-68),(70,-90),(75,-115)]
S_AMERICA = [(12,-81),(7,-76),(0,-78),(-8,-76),(-15,-72),(-22,-68),(-31,-63),(-40,-60),(-51,-69),(-47,-76),(-36,-75),(-25,-70),(-14,-64),(-4,-52),(4,-48),(9,-58)]
AUSTRALIA = [(-12,113),(-16,123),(-13,136),(-17,147),(-27,153),(-38,146),(-43,135),(-35,116),(-24,113)]
GREENLAND = [(60,-48),(65,-55),(72,-58),(78,-48),(82,-35),(76,-20),(68,-25)]

for name, pts, tube in [
    ('land_africa', AFRICA, 0.0095),
    ('land_europe', EUROPE, 0.0080),
    ('land_asia', ASIA, 0.0085),
    ('land_arabia_india', ARABIA_INDIA, 0.0075),
    ('land_north_america', N_AMERICA, 0.0085),
    ('land_south_america', S_AMERICA, 0.0085),
    ('land_australia', AUSTRALIA, 0.0080),
    ('land_greenland', GREENLAND, 0.0075),
]:
    add_continent_outline(name, pts, tube=tube)

# Interior geographic engraving/relief for Europe/Africa/Asia visible on front.
add_continent_veins('vein_africa', [
    [(30,4),(15,18),(0,23),(-18,25),(-30,20)],
    [(24,-10),(12,5),(2,18),(-8,33)],
    [(10,-15),(5,2),(8,20),(14,38)],
])
add_continent_veins('vein_europe_asia', [
    [(48,-4),(51,12),(53,27),(51,44),(48,62)],
    [(58,8),(55,24),(57,42),(54,60),(50,80)],
    [(42,15),(43,30),(40,47),(38,65),(35,84)],
])

# Small raised island jewels.
for name, lat, lon, radius in [
    ('island_uk',54,-3,0.031),('island_iceland',65,-19,0.026),
    ('island_madagascar',-20,47,0.035),('island_japan',37,138,0.030),
    ('island_sicily',37,14,0.018),('island_sri_lanka',7,81,0.018),
]:
    sph = trimesh.creation.icosphere(subdivisions=3, radius=radius)
    T = np.eye(4)
    T[:3, 3] = sphere_point(lat, lon, 1.258)
    add(sph, name, GOLD_HI, T)

# ------------------------------------------------------------------
# ARMILLARY STRUCTURE
# ------------------------------------------------------------------
axis = trimesh.creation.cylinder(radius=0.032, height=4.35, sections=48)
add(axis, 'axis_vertical', GOLD, rot_xyz(math.pi / 2, 0, 0))

for name, y, radius, mat in [
    ('axis_top_crown',2.18,0.125,GOLD),('axis_top_tip',2.38,0.052,GOLD_HI),
    ('axis_bottom_crown',-2.18,0.112,GOLD),('axis_bottom_tip',-2.36,0.040,GOLD_HI),
]:
    sph = trimesh.creation.icosphere(subdivisions=4, radius=radius)
    T = np.eye(4); T[1,3] = y
    add(sph, name, mat, T)

for i, y in enumerate([1.72,1.48,-1.48,-1.72],1):
    tor = trimesh.creation.torus(major_radius=0.095, minor_radius=0.018, major_sections=72, minor_sections=12)
    T = rot_xyz(math.pi/2,0,0); T[1,3]=y
    add(tor, f'axis_collar_{i:02d}', GOLD_DARK if i % 2 else GOLD_HI, T)

rings = [
    ('orbit_ring_01',1.72,0.033,(math.radians(63),math.radians(15),math.radians(-17)),GOLD),
    ('orbit_ring_02',1.67,0.030,(math.radians(31),math.radians(69),math.radians(25)),GOLD_MID),
    ('orbit_ring_03',1.76,0.027,(math.radians(85),math.radians(2),math.radians(61)),GOLD_HI),
    ('orbit_ring_04',1.59,0.023,(math.radians(13),math.radians(58),math.radians(-38)),GOLD_DARK),
]
for name, major, minor, angles, material in rings:
    tor = trimesh.creation.torus(major_radius=major, minor_radius=minor, major_sections=256, minor_sections=20)
    add(tor, name, material, rot_xyz(*angles))

# Front-facing circular armillary frame, not edge-on.
outer = trimesh.creation.torus(major_radius=1.90, minor_radius=0.018, major_sections=256, minor_sections=14)
add(outer, 'armillary_outer', GOLD_HI)

# ------------------------------------------------------------------
# PLANETS
# ------------------------------------------------------------------
planet_specs = [
    ('planet_01',(-1.56,0.48,0.72),0.17,GOLD),
    ('planet_02',(1.45,0.65,0.79),0.225,GOLD_HI),
    ('planet_03',(-1.10,-1.25,0.80),0.205,GOLD),
    ('planet_04',(1.31,-1.08,0.54),0.135,GOLD_DARK),
    ('planet_05',(0.90,1.42,0.46),0.155,GOLD_MID),
]
for idx,(name,pos,radius,material) in enumerate(planet_specs,1):
    sphere = trimesh.creation.icosphere(subdivisions=5, radius=radius)
    T=np.eye(4); T[:3,3]=pos
    add(sphere,name,material,T)
    if idx in (2,3):
        tor=trimesh.creation.torus(major_radius=radius*1.42,minor_radius=radius*0.055,major_sections=96,minor_sections=10)
        RT=rot_xyz(math.radians(70 if idx==2 else 38),math.radians(18),math.radians(22)); RT[:3,3]=pos
        add(tor,f'planet_ring_{idx:02d}',GOLD_HI,RT)

# ------------------------------------------------------------------
# W: a single real extruded serif glyph, positioned clearly in front.
# ------------------------------------------------------------------
font = FontProperties(family='DejaVu Serif', weight='bold')
path = TextPath((0,0),'W',size=1.0,prop=font)
polys = path.to_polygons()
if not polys:
    raise RuntimeError('Unable to build W glyph')
poly_arr = max(polys, key=lambda p: abs(Polygon(p).area))
poly = Polygon(poly_arr)
minx,miny,maxx,maxy = poly.bounds
cx,cy=(minx+maxx)/2,(miny+maxy)/2
poly = Polygon([(x-cx,y-cy) for x,y in poly.exterior.coords])
scale = 1.46 / max(maxx-minx,maxy-miny)
poly = Polygon([(x*scale,y*scale) for x,y in poly.exterior.coords])
w = trimesh.creation.extrude_polygon(poly,height=0.16,engine='earcut')
w.apply_translation([0,0,-0.08])
WT=np.eye(4); WT[:3,3]=[0.0,0.03,1.455]
add(w,'logo_W_gold',GOLD_HI,WT)

w_shadow=w.copy(); ST=np.eye(4); ST[:3,3]=[0.0,0.03,1.405]
add(w_shadow,'logo_W_shadow',GOLD_DARK,ST)

star_points=[]
for i in range(16):
    a=i*math.pi/8; r=0.125 if i%2==0 else 0.047
    star_points.append((r*math.cos(a),r*math.sin(a)))
star=trimesh.creation.extrude_polygon(Polygon(star_points),height=0.11,engine='earcut')
T=np.eye(4); T[:3,3]=[0,-0.66,1.43]
add(star,'logo_star',GOLD_HI,T)

# Accent sparks
for i,(pos,radius) in enumerate([
    ((-1.90,1.40,0.22),0.035),((1.85,1.30,0.18),0.030),
    ((-1.72,-1.40,0.12),0.026),((1.74,-1.40,0.24),0.034),
    ((0,1.98,0.20),0.027),((0.22,-1.96,0.27),0.022),
    ((-1.48,1.02,1.08),0.022),((1.55,-0.57,1.07),0.026),
],1):
    gem=trimesh.creation.icosphere(subdivisions=3,radius=radius)
    T=np.eye(4); T[:3,3]=pos
    add(gem,f'spark_{i:02d}',SPARK,T)

blob=scene.export(file_type='glb')
OUT.write_bytes(blob)
faces=sum(len(g.faces) for g in scene.geometry.values())
verts=sum(len(g.vertices) for g in scene.geometry.values())
sha=hashlib.sha256(blob).hexdigest()

manifest={
    'model':OUT.name,
    'bytes':len(blob),
    'sha256':sha,
    'geometries':len(scene.geometry),
    'vertices':verts,
    'faces':faces,
    'materials':sorted({getattr(g.visual.material,'name','') for g in scene.geometry.values()}),
    'key_nodes':['globe_core','globe_rim_01','land_africa_000','land_europe_000','land_asia_000','logo_W_gold','logo_star','axis_vertical','armillary_outer','orbit_ring_01','orbit_ring_02','orbit_ring_03','orbit_ring_04','planet_01','planet_02','planet_03','planet_04','planet_05'],
    'notes':'Model-only V26 revision 2: corrected globe coordinate system, front-facing armillary/rims, sphere-hugging raised continent outlines, serif W pulled forward for legibility.'
}
MANIFEST.write_text(json.dumps(manifest,indent=2),encoding='utf-8')

print(f'MODEL_PATH={OUT}')
print(f'MODEL_BYTES={len(blob)}')
print(f'MODEL_SHA256={sha}')
print(f'MODEL_GEOMETRIES={len(scene.geometry)}')
print(f'MODEL_VERTICES={verts}')
print(f'MODEL_FACES={faces}')

assert blob[:4] == b'glTF'
assert len(blob) > 1_000_000
assert faces > 180_000
assert len(scene.geometry) >= 100
assert 'logo_W_gold' in scene.graph.nodes_geometry
assert 'armillary_outer' in scene.graph.nodes_geometry
