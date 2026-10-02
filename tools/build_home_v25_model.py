#!/usr/bin/env python3
import math
import hashlib
from pathlib import Path

import numpy as np
import trimesh
from shapely.geometry import Polygon
from trimesh.visual.material import PBRMaterial

OUT = Path("assets/models/webinsolito-hero-v25.glb")
OUT.parent.mkdir(parents=True, exist_ok=True)

scene = trimesh.Scene()

def pbr(name, rgba, metallic, roughness, emissive=None):
    kw = {
        "name": name,
        "baseColorFactor": np.array(rgba, dtype=np.uint8),
        "metallicFactor": float(metallic),
        "roughnessFactor": float(roughness),
    }
    if emissive is not None:
        kw["emissiveFactor"] = np.array(emissive, dtype=float)
    return PBRMaterial(**kw)

GOLD = pbr("ChampagneGoldPremium", [226,166,86,255], 1.0, 0.13)
GOLD_HI = pbr("IvoryGoldHighlight", [255,225,175,255], 0.96, 0.09)
GOLD_DARK = pbr("AntiqueGoldShadow", [118,67,27,255], 0.96, 0.20)
PETROL = pbr("DeepPetrolLacquer", [4,30,44,255], 0.42, 0.20)
PETROL_INNER = pbr("DeepPetrolInner", [2,15,24,255], 0.52, 0.28)
MAP_GOLD = pbr("MapGold", [236,186,105,255], 0.88, 0.16)
SPARK = pbr("SparkGold", [255,218,150,255], 0.92, 0.08)

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
    return trimesh.transformations.euler_matrix(rx, ry, rz, "sxyz")

# High-detail lacquer globe and inner shell
add(trimesh.creation.icosphere(subdivisions=5, radius=1.22), "globe_core", PETROL)
add(trimesh.creation.icosphere(subdivisions=4, radius=1.205), "globe_inner", PETROL_INNER)

# Polished outer rim
rim = trimesh.creation.torus(
    major_radius=1.235, minor_radius=0.030,
    major_sections=160, minor_sections=14
)
add(rim, "globe_rim", GOLD, rot_xyz(math.pi/2, 0, 0))

# Latitude rings
for i, (z, r) in enumerate([
    (-0.78, 0.94), (-0.42, 1.145), (0.0, 1.225),
    (0.42, 1.145), (0.78, 0.94)
], 1):
    tor = trimesh.creation.torus(
        major_radius=r, minor_radius=0.010,
        major_sections=144, minor_sections=8
    )
    T = np.eye(4)
    T[2, 3] = z
    add(tor, f"latitude_{i:02d}", MAP_GOLD, T)

# Meridian rings
for i, ang in enumerate(np.linspace(0, math.pi, 6, endpoint=False), 1):
    tor = trimesh.creation.torus(
        major_radius=1.226, minor_radius=0.009,
        major_sections=144, minor_sections=8
    )
    add(tor, f"meridian_{i:02d}", MAP_GOLD, rot_xyz(math.pi/2, 0, float(ang)))

def sphere_point(lat_deg, lon_deg, radius=1.245):
    lat = np.deg2rad(lat_deg)
    lon = np.deg2rad(lon_deg)
    x = radius * np.cos(lat) * np.sin(lon)
    y = radius * np.sin(lat)
    z = radius * np.cos(lat) * np.cos(lon)
    return np.array([x, y, z], dtype=float)

def cylinder_between(a, b, radius=0.012, sections=8):
    a = np.array(a, dtype=float)
    b = np.array(b, dtype=float)
    if np.linalg.norm(b-a) < 1e-6:
        return None
    return trimesh.creation.cylinder(
        radius=radius,
        segment=np.vstack([a, b]),
        sections=sections
    )

# Stylized Europe/Africa/Asia outlines, actually modeled as 3D gold tubes
polylines = [
    [(36,-10),(43,-9),(48,-5),(51,1),(55,4),(58,10),(55,16),(52,21),(47,23),(44,17),(41,13),(38,9),(36,4),(36,-2),(36,-10)],
    [(55,5),(61,6),(66,12),(69,18),(67,25),(63,24),(60,18),(58,12),(55,5)],
    [(46,9),(44,11),(42,12),(40,15),(38,16),(37,14),(39,12),(42,11),(44,9)],
    [(36,-9),(31,-14),(25,-17),(18,-17),(10,-14),(4,-10),(-2,-6),(-10,0),(-18,8),(-25,16),(-31,20),(-34,17),(-31,11),(-28,4),(-22,-1),(-14,-5),(-7,-9),(1,-12),(10,-15),(20,-16),(28,-14),(34,-11),(36,-9)],
    [(39,24),(37,31),(34,37),(31,43),(28,48),(24,52),(20,49),(22,42),(27,36),(31,30),(35,25),(39,24)],
]
for pi, line in enumerate(polylines, 1):
    pts = [sphere_point(lat, lon) for lat, lon in line]
    for j in range(len(pts)-1):
        tube = cylinder_between(pts[j], pts[j+1])
        if tube is not None:
            add(tube, f"continent_{pi:02d}_{j:02d}", MAP_GOLD)

# Vertical armillary axis
axis = trimesh.creation.cylinder(radius=0.027, height=4.15, sections=32)
add(axis, "axis_vertical", GOLD, rot_xyz(math.pi/2, 0, 0))
for name, y, radius, material in [
    ("axis_top_finial", 2.13, 0.105, GOLD),
    ("axis_top_tip", 2.30, 0.045, GOLD_HI),
    ("axis_bottom_finial", -2.13, 0.095, GOLD),
    ("axis_bottom_tip", -2.29, 0.032, GOLD_HI),
]:
    sph = trimesh.creation.icosphere(subdivisions=3, radius=radius)
    T = np.eye(4)
    T[1, 3] = y
    add(sph, name, material, T)

# Four substantial orbit rings
rings = [
    ("orbit_ring_01", 1.72, 0.031, (math.radians(66), math.radians(16), math.radians(-18)), GOLD),
    ("orbit_ring_02", 1.67, 0.027, (math.radians(33), math.radians(70), math.radians(24)), GOLD),
    ("orbit_ring_03", 1.75, 0.025, (math.radians(86), 0, math.radians(62)), GOLD_HI),
    ("orbit_ring_04", 1.58, 0.020, (math.radians(12), math.radians(58), math.radians(-38)), GOLD_DARK),
]
for name, major, minor, angles, material in rings:
    tor = trimesh.creation.torus(
        major_radius=major, minor_radius=minor,
        major_sections=180, minor_sections=14
    )
    add(tor, name, material, rot_xyz(*angles))

outer = trimesh.creation.torus(
    major_radius=1.86, minor_radius=0.016,
    major_sections=180, minor_sections=10
)
add(outer, "armillary_outer", GOLD, rot_xyz(math.pi/2, 0, 0))

# High-detail metallic planets
planet_specs = [
    ("planet_01", (-1.55, 0.46, 0.70), 0.17, GOLD),
    ("planet_02", (1.43, 0.62, 0.78), 0.22, GOLD_HI),
    ("planet_03", (-1.08,-1.24, 0.78), 0.20, GOLD),
    ("planet_04", (1.30,-1.05, 0.52), 0.13, GOLD_DARK),
    ("planet_05", (0.88, 1.40, 0.45), 0.15, GOLD_HI),
]
for name, pos, radius, material in planet_specs:
    sphere = trimesh.creation.icosphere(subdivisions=4, radius=radius)
    T = np.eye(4)
    T[:3, 3] = pos
    add(sphere, name, material, T)

# Large 3D W on the front surface, modeled as four polished gold strokes
def box_bar(length, width, depth, angle_deg, center):
    mesh = trimesh.creation.box(extents=[width, length, depth])
    T = trimesh.transformations.rotation_matrix(math.radians(angle_deg), [0,0,1])
    T[:3, 3] = center
    return mesh, T

strokes = [
    (1.02,0.20,0.10, 16,(-0.47, 0.08,1.34)),
    (1.02,0.20,0.10,-16,(-0.16,-0.02,1.34)),
    (1.02,0.20,0.10, 16,( 0.16,-0.02,1.34)),
    (1.02,0.20,0.10,-16,( 0.47, 0.08,1.34)),
]
for i, spec in enumerate(strokes, 1):
    mesh, T = box_bar(*spec)
    add(mesh, f"logo_W_gold_{i:02d}", GOLD_HI, T)

# Small serif caps
for i, x in enumerate([-0.62,-0.31,0.0,0.31,0.62], 1):
    cap = trimesh.creation.box(extents=[0.24,0.07,0.105])
    T = np.eye(4)
    T[:3,3] = [x,0.55,1.35]
    add(cap, f"logo_W_cap_{i:02d}", GOLD, T)

# 3D star under the W
star_points = []
for i in range(16):
    a = i * math.pi / 8
    r = 0.115 if i % 2 == 0 else 0.045
    star_points.append((r*math.cos(a), r*math.sin(a)))
star = trimesh.creation.extrude_polygon(
    Polygon(star_points), height=0.09, engine="earcut"
)
T = np.eye(4)
T[:3,3] = [0,-0.63,1.33]
add(star, "logo_star", GOLD_HI, T)

# Subtle gold sparkle geometry
spark_specs = [
    ((-1.88,1.38,0.20),0.035),((1.82,1.28,0.15),0.028),
    ((-1.70,-1.38,0.10),0.025),((1.72,-1.38,0.22),0.032),
    ((0,1.94,0.18),0.025),((0.20,-1.92,0.25),0.020),
    ((-1.45,0.98,1.05),0.020),((1.52,-0.55,1.04),0.024),
]
for i, (pos, radius) in enumerate(spark_specs):
    mesh = trimesh.creation.icosphere(subdivisions=2, radius=radius)
    T = np.eye(4)
    T[:3,3] = pos
    add(mesh, f"spark_{i:02d}", SPARK, T)

blob = scene.export(file_type="glb")
OUT.write_bytes(blob)

faces = sum(len(g.faces) for g in scene.geometry.values())
verts = sum(len(g.vertices) for g in scene.geometry.values())
sha = hashlib.sha256(blob).hexdigest()

print(f"MODEL_PATH={OUT}")
print(f"MODEL_BYTES={len(blob)}")
print(f"MODEL_SHA256={sha}")
print(f"MODEL_GEOMETRIES={len(scene.geometry)}")
print(f"MODEL_VERTICES={verts}")
print(f"MODEL_FACES={faces}")

assert len(scene.geometry) >= 100
assert faces >= 100000
assert blob[:4] == b"glTF"
assert len(blob) > 500000
