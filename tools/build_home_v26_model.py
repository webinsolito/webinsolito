import math, json, hashlib
from pathlib import Path
import numpy as np
import trimesh
from shapely.geometry import Polygon, Point, MultiPoint
from shapely.ops import triangulate
from matplotlib.font_manager import FontProperties
from matplotlib.textpath import TextPath
from trimesh.visual.material import PBRMaterial

OUT=Path('assets/models/webinsolito-hero-v26.glb')
MAN=Path('assets/models/webinsolito-hero-v26.manifest.json')
scene=trimesh.Scene()

def mat(name, rgb, metal=1.0, rough=.15):
    return PBRMaterial(name=name, baseColorFactor=np.array([*rgb,255],dtype=np.uint8), metallicFactor=metal, roughnessFactor=rough)

GOLD=mat('ChampagneGold',(225,166,88),1,.12)
GOLD_HI=mat('IvoryGold',(255,224,168),.98,.08)
GOLD_MID=mat('SatinChampagne',(204,140,62),.96,.16)
GOLD_SOFT=mat('SoftGold',(180,118,52),.92,.22)
PETROL=mat('DeepPetrol',(3,34,48),.42,.18)
PETROL_DARK=mat('PetrolShadow',(1,16,25),.55,.27)
MAP=mat('RaisedPetrolLand',(8,58,66),.48,.24)
MAP_HI=mat('CoastHighlight',(255,211,142),.97,.09)

def add(mesh,name,material,T=None):
    m=mesh.copy(); m.visual.material=material
    scene.add_geometry(m, geom_name=name, node_name=name, transform=np.eye(4) if T is None else T)

def R(rx=0,ry=0,rz=0): return trimesh.transformations.euler_matrix(rx,ry,rz,'sxyz')

def sph(lon,lat,r):
    lo=math.radians(lon); la=math.radians(lat)
    return np.array([r*math.cos(la)*math.sin(lo), r*math.sin(la), r*math.cos(la)*math.cos(lo)])

def densify(points, step=3.0):
    out=[]
    for i,a in enumerate(points):
        b=points[(i+1)%len(points)]
        d=max(abs(b[0]-a[0]),abs(b[1]-a[1]))
        n=max(1,int(math.ceil(d/step)))
        for k in range(n):
            t=k/n; out.append((a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t))
    return out


def extrude_poly(poly, height):
    poly=poly.buffer(0)
    tris=[t for t in triangulate(poly) if poly.contains(t.representative_point()) or poly.touches(t.representative_point())]
    verts=[]; faces=[]
    for t in tris:
        coords=list(t.exterior.coords)[:3]
        base=len(verts)
        for x,y in coords: verts.append([x,y,height])
        faces.append([base,base+1,base+2])
        base2=len(verts)
        for x,y in coords: verts.append([x,y,0.0])
        faces.append([base2+2,base2+1,base2])
    b=list(poly.exterior.coords)[:-1]
    for i,a in enumerate(b):
        bb=b[(i+1)%len(b)]; base=len(verts)
        verts += [[a[0],a[1],0],[bb[0],bb[1],0],[bb[0],bb[1],height],[a[0],a[1],height]]
        faces += [[base,base+1,base+2],[base,base+2,base+3]]
    return trimesh.Trimesh(vertices=np.array(verts),faces=np.array(faces),process=False)

def curved_land(name, coords, rin=1.226, rout=1.266, grid=5.5, material=MAP):
    poly=Polygon(coords).buffer(0)
    if not poly.is_valid or poly.is_empty: raise ValueError(name)
    boundary=densify(list(poly.exterior.coords)[:-1],2.6)
    minx,miny,maxx,maxy=poly.bounds
    pts=list(boundary)
    xs=np.arange(minx+grid/2,maxx,grid); ys=np.arange(miny+grid/2,maxy,grid)
    for x in xs:
        for y in ys:
            if poly.contains(Point(x,y)): pts.append((float(x),float(y)))
    faces=[]; verts=[]
    for tri in triangulate(MultiPoint(pts)):
        rp=tri.representative_point()
        if not (poly.contains(rp) or poly.touches(rp)):
            continue
        coords=list(tri.exterior.coords)[:3]
        base=len(verts)
        verts.extend([sph(lon,lat,rout) for lon,lat in coords])
        faces.append([base,base+1,base+2])
        base2=len(verts)
        verts.extend([sph(lon,lat,rin) for lon,lat in coords])
        faces.append([base2+2,base2+1,base2])
    B=len(boundary)
    for i in range(B):
        j=(i+1)%B
        a0=sph(boundary[i][0],boundary[i][1],rin); a1=sph(boundary[j][0],boundary[j][1],rin)
        b0=sph(boundary[i][0],boundary[i][1],rout); b1=sph(boundary[j][0],boundary[j][1],rout)
        base=len(verts); verts.extend([a0,a1,b1,b0]); faces.extend([[base,base+1,base+2],[base,base+2,base+3]])
    mesh=trimesh.Trimesh(vertices=np.array(verts), faces=np.array(faces), process=False)
    add(mesh,name,material)
    for i in range(B):
        j=(i+1)%B
        a=sph(boundary[i][0],boundary[i][1],rout+.008); b=sph(boundary[j][0],boundary[j][1],rout+.008)
        seg=trimesh.creation.cylinder(radius=.0085, segment=np.vstack([a,b]), sections=8)
        add(seg,f'{name}_coast_{i:03d}',MAP_HI)

add(trimesh.creation.icosphere(subdivisions=6,radius=1.205),'globe_core',PETROL)
add(trimesh.creation.icosphere(subdivisions=5,radius=1.183),'globe_inner',PETROL_DARK)
for i,(z,r) in enumerate([(-.68,1.00),(-.35,1.155),(0,1.205),(.35,1.155),(.68,1.00)],1):
    t=trimesh.creation.torus(major_radius=r,minor_radius=.007,major_sections=180,minor_sections=10); T=np.eye(4); T[2,3]=z; add(t,f'latitude_{i:02d}',GOLD_SOFT,T)
for i,ang in enumerate(np.linspace(0,math.pi,6,endpoint=False),1):
    t=trimesh.creation.torus(major_radius=1.208,minor_radius=.0065,major_sections=180,minor_sections=10); add(t,f'meridian_{i:02d}',GOLD_SOFT,R(math.pi/2,0,float(ang)))
for i,(maj,minor,ma) in enumerate([(1.219,.018,GOLD),(1.238,.007,GOLD_HI)],1):
    add(trimesh.creation.torus(major_radius=maj,minor_radius=minor,major_sections=200,minor_sections=14),f'globe_rim_{i:02d}',ma,R(math.pi/2,0,0))

AFR=[(-17,37),(-5,35),(10,37),(25,32),(34,31),(43,12),(51,11),(45,-5),(40,-15),(34,-25),(20,-35),(10,-34),(0,-29),(-8,-20),(-13,-5),(-17,15)]
EUR=[(-10,36),(-8,43),(-2,50),(7,57),(18,60),(28,58),(40,55),(52,57),(62,60),(75,58),(88,54),(100,50),(112,46),(124,42),(132,48),(145,52),(155,48),(160,40),(150,32),(135,27),(120,24),(105,20),(92,12),(80,8),(70,18),(60,25),(48,30),(38,34),(30,40),(20,44),(12,42),(5,39)]
IND=[(67,24),(76,30),(86,26),(91,21),(87,12),(79,7),(74,12)]
ARAB=[(35,31),(44,31),(55,26),(51,16),(44,12),(38,18)]
NAM=[(-168,70),(-150,72),(-135,65),(-120,60),(-105,58),(-90,52),(-78,48),(-65,45),(-58,52),(-52,60),(-60,70),(-85,75),(-110,72),(-130,68),(-145,58),(-155,50),(-165,55)]
NAM2=[(-130,55),(-120,48),(-112,42),(-106,32),(-98,24),(-88,18),(-82,24),(-80,32),(-74,40),(-66,45),(-78,48),(-92,50),(-108,52)]
SAM=[(-81,12),(-68,10),(-54,5),(-45,-4),(-38,-15),(-43,-25),(-52,-35),(-62,-48),(-70,-55),(-74,-40),(-78,-25),(-80,-8)]
AUS=[(112,-12),(126,-10),(140,-14),(153,-25),(150,-38),(136,-44),(120,-35),(113,-24)]
GRN=[(-73,60),(-52,58),(-32,64),(-20,72),(-30,82),(-50,84),(-68,76)]
for n,c,grid,ma in [('land_africa',AFR,4.2,MAP),('land_eurasia',EUR,5.0,MAP),('land_india',IND,3.0,MAP),('land_arabia',ARAB,3.0,MAP),('land_north_america',NAM,4.5,MAP),('land_north_america_south',NAM2,3.8,MAP),('land_south_america',SAM,4.2,MAP),('land_australia',AUS,4.0,MAP),('land_greenland',GRN,3.4,GOLD_HI)]:
    curved_land(n,c,grid=grid,material=ma)

for i,(lon,lat,rad) in enumerate([(-4,54,.033),(-19,65,.025),(47,-20,.038),(138,37,.028),(14,37,.020),(81,7,.020),(120,15,.018),(174,-41,.026)]):
    m=trimesh.creation.icosphere(subdivisions=3,radius=rad); p=sph(lon,lat,1.267+rad*.3); T=np.eye(4); T[:3,3]=p; add(m,f'island_{i:02d}',GOLD_HI,T)

axis=trimesh.creation.cylinder(radius=.034,height=4.55,sections=48); add(axis,'axis_vertical',GOLD,R(math.pi/2,0,0))
for n,y,r,ma in [('axis_top_crown',2.27,.125,GOLD),('axis_top_gem',2.48,.060,GOLD_HI),('axis_bottom_crown',-2.27,.115,GOLD),('axis_bottom_gem',-2.46,.048,GOLD_HI)]:
    s=trimesh.creation.icosphere(subdivisions=4,radius=r); T=np.eye(4); T[1,3]=y; add(s,n,ma,T)
for idx,y in enumerate([1.86,1.64,-1.64,-1.86],1):
    t=trimesh.creation.torus(major_radius=.10,minor_radius=.017,major_sections=72,minor_sections=12); T=R(math.pi/2,0,0); T[1,3]=y; add(t,f'axis_collar_{idx:02d}',GOLD_HI if idx%2==0 else GOLD_MID,T)

add(trimesh.creation.torus(major_radius=1.92,minor_radius=.020,major_sections=256,minor_sections=16),'armillary_outer',GOLD_HI,R(math.pi/2,0,0))
rings=[
 ('orbit_ring_01',1.72,.030,(math.radians(67),math.radians(12),math.radians(-18)),GOLD),
 ('orbit_ring_02',1.64,.026,(math.radians(28),math.radians(70),math.radians(20)),GOLD_MID),
 ('orbit_ring_03',1.77,.023,(math.radians(84),math.radians(0),math.radians(58)),GOLD_HI),
 ('orbit_ring_04',1.56,.020,(math.radians(12),math.radians(58),math.radians(-36)),GOLD_SOFT),
]
for n,maj,minr,angs,ma in rings:
    add(trimesh.creation.torus(major_radius=maj,minor_radius=minr,major_sections=240,minor_sections=18),n,ma,R(*angs))

for idx,ang in enumerate([0,math.pi/2,math.pi,3*math.pi/2]):
    p=np.array([1.92*math.cos(ang),1.92*math.sin(ang),0]); s=trimesh.creation.icosphere(subdivisions=3,radius=.050); T=np.eye(4); T[:3,3]=p; add(s,f'outer_knuckle_{idx:02d}',GOLD_HI,T)

planet_specs=[(-1.58,.52,.74,.16,GOLD),(1.48,.70,.76,.22,GOLD_HI),(-1.15,-1.23,.78,.19,GOLD),(1.32,-1.05,.56,.13,GOLD_MID),(.92,1.44,.46,.15,GOLD_HI)]
for i,(x,y,z,r,ma) in enumerate(planet_specs,1):
    s=trimesh.creation.icosphere(subdivisions=5,radius=r); T=np.eye(4); T[:3,3]=[x,y,z]; add(s,f'planet_{i:02d}',ma,T)
    band=trimesh.creation.torus(major_radius=r*1.04,minor_radius=max(.008,r*.045),major_sections=96,minor_sections=10); BT=R(math.radians(70 if i%2 else 35),math.radians(16),math.radians(20*i)); BT[:3,3]=[x,y,z]; add(band,f'planet_band_{i:02d}',GOLD_HI,BT)
moon=trimesh.creation.icosphere(subdivisions=4,radius=.065); T=np.eye(4); T[:3,3]=[1.72,.92,.80]; add(moon,'planet_02_moon',GOLD_MID,T)

font=FontProperties(family='DejaVu Serif',weight='bold')
path=TextPath((0,0),'W',size=1.0,prop=font); poly=max([Polygon(p).buffer(0) for p in path.to_polygons() if len(p)>=3],key=lambda p:p.area)
minx,miny,maxx,maxy=poly.bounds; cx=(minx+maxx)/2; cy=(miny+maxy)/2
from shapely import affinity
poly=affinity.translate(poly,-cx,-cy); poly=affinity.scale(poly,xfact=1.08/(maxx-minx),yfact=1.14/(maxy-miny),origin=(0,0))
for layer,(depth,z,ma,scale) in enumerate([(.18,1.66,GOLD_SOFT,1.04),(.14,1.76,GOLD,1.00),(.055,1.90,GOLD_HI,.97)],1):
    pp=affinity.scale(poly,xfact=scale,yfact=scale,origin=(0,0)); mesh=extrude_poly(pp,depth); mesh.apply_translation([0,0,z]); add(mesh,f'logo_W_gold_layer_{layer:02d}',ma)
pts=[]
for i in range(16):
    a=i*math.pi/8; rr=.095 if i%2==0 else .034; pts.append((rr*math.cos(a),rr*math.sin(a)))
star=Polygon(pts)
for layer,(depth,z,ma,scale) in enumerate([(.11,1.72,GOLD_SOFT,1.1),(.055,1.86,GOLD_HI,1.0)],1):
    pp=affinity.scale(star,xfact=scale,yfact=scale,origin=(0,0)); m=extrude_poly(pp,depth); m.apply_translation([0,-.76,z]); add(m,f'logo_star_layer_{layer:02d}',ma)
for i,(x,y) in enumerate([(-.58,.42),(.58,.42),(-.50,-.42),(.50,-.42)],1):
    a=np.array([x,y,1.18]); b=np.array([x,y,1.67]); c=trimesh.creation.cylinder(radius=.022,segment=np.vstack([a,b]),sections=16); add(c,f'logo_mount_{i:02d}',GOLD_MID)

for i,(x,y,z,r) in enumerate([(-1.82,1.32,.18,.030),(1.82,1.25,.18,.028),(-1.66,-1.38,.22,.026),(1.68,-1.42,.20,.030),(0,2.02,.12,.024),(0,-2.02,.15,.024)]):
    s=trimesh.creation.icosphere(subdivisions=3,radius=r); T=np.eye(4); T[:3,3]=[x,y,z]; add(s,f'spark_{i:02d}',GOLD_HI,T)

blob=scene.export(file_type='glb'); OUT.write_bytes(blob)
faces=sum(len(g.faces) for g in scene.geometry.values()); verts=sum(len(g.vertices) for g in scene.geometry.values())
manifest={'version':'V26-stage2-modeling','bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'geometries':len(scene.geometry),'vertices':verts,'faces':faces,'focus':'true curved continent relief + layered W + refined armillary details'}
MAN.write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest,indent=2))
