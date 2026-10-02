import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MODEL_URL = './assets/models/webinsolito-hero-v25.glb';
const MODEL_BYTES = 1161316;
const MODEL_SHA256 = '2e1c1de9e7fee040492242b0f7c7dc35d349e8fb47c8d1e4a92618650a5d1b1a';

const mount = document.getElementById('hero3d');
const canvas = document.getElementById('hero3dCanvas');
const fallback = document.getElementById('hero3dFallback');
if (!mount || !canvas) throw new Error('WEBINSOLITO_3D_MOUNT_MISSING');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 680px)').matches;
let renderer, scene, camera, root, model, raf = 0;
let visible = true;
let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
let dragX = 0, dragY = 0, isDragging = false, lastX = 0, lastY = 0;
let rings = [], planets = [];
let lastTime = performance.now();

function fail(reason) {
  mount.classList.remove('hero3d-ready');
  mount.classList.add('hero3d-failed');
  mount.dataset.state = 'fallback';
  mount.setAttribute('aria-busy','false');
  if (fallback) fallback.hidden = false;
  window.dispatchEvent(new CustomEvent('webinsolito:hero3d-error',{detail:{reason:String(reason)}}));
}

function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch (_) {
    return false;
  }
}

async function loadVerifiedGlb() {
  const response = await fetch(MODEL_URL,{cache:'force-cache'});
  if (!response.ok) throw new Error('GLB_HTTP_' + response.status);
  const bytes = await response.arrayBuffer();

  if (bytes.byteLength !== MODEL_BYTES) {
    throw new Error('GLB_SIZE_MISMATCH_' + bytes.byteLength);
  }

  const head = new Uint8Array(bytes,0,4);
  if (String.fromCharCode(head[0],head[1],head[2],head[3]) !== 'glTF') {
    throw new Error('GLB_MAGIC_INVALID');
  }

  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256',bytes);
    const hex = [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    if (hex !== MODEL_SHA256) throw new Error('GLB_SHA256_MISMATCH');
  }

  const gltf = await new Promise((resolve,reject)=>{
    new GLTFLoader().parse(bytes,'./assets/models/',resolve,reject);
  });
  return {gltf,bytes:bytes.byteLength};
}

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha:true,
    antialias:!isMobile,
    powerPreference:'high-performance',
    preserveDrawingBuffer:false
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,isMobile ? 1.35 : 1.85));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;

  scene = new THREE.Scene();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(renderer),0.04).texture;
  scene.environment = env;
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(isMobile ? 33 : 30,1,.1,100);
  camera.position.set(0,.02,isMobile ? 7.75 : 7.45);

  root = new THREE.Group();
  scene.add(root);

  const hemi = new THREE.HemisphereLight(0xa7d8ef,0x03090e,1.18);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffdeb0,4.4);
  key.position.set(-4.2,4.8,5.8);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xd79a4d,1.4);
  fill.position.set(3.4,-1.8,4.2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x39a8d8,2.8);
  rim.position.set(4.9,1.9,-4.7);
  scene.add(rim);

  const gold = new THREE.PointLight(0xf0b866,26,15,2);
  gold.position.set(.45,-1.25,4.6);
  scene.add(gold);

  const cool = new THREE.PointLight(0x147fae,12,13,2);
  cool.position.set(-3.2,1.7,2.6);
  scene.add(cool);
}

function frameModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const maxDim = Math.max(size.x,size.y,size.z) || 1;
  object.scale.setScalar((isMobile ? 4.92 : 5.14) / maxDim);
  object.rotation.x = -0.035;
  object.rotation.y = -0.10;
}

function tuneMaterials(object) {
  object.traverse((node)=>{
    if (!node.isMesh || !node.material) return;

    if (/^logo_W_|^logo_star$/i.test(node.name)) {
      node.position.z += .18;
      node.renderOrder = 8;
    }

    const mats = Array.isArray(node.material) ? node.material : [node.material];
    mats.forEach((mat)=>{
      const n = (mat.name || node.name || '').toLowerCase();

      if ('metalness' in mat && /(gold|ring|planet|axis|finial|logo|spark|rim|continent)/i.test(n + ' ' + node.name)) {
        mat.metalness = Math.max(mat.metalness ?? 0,.94);
        mat.roughness = Math.min(mat.roughness ?? .5,.16);
      }

      if (/globe_core/i.test(node.name)) {
        if ('metalness' in mat) mat.metalness = .34;
        if ('roughness' in mat) mat.roughness = .18;
      }

      if (/globe_inner/i.test(node.name)) {
        if ('roughness' in mat) mat.roughness = .26;
      }

      if ('envMapIntensity' in mat) {
        mat.envMapIntensity = /gold|ring|planet|axis|logo|spark|rim/i.test(n + ' ' + node.name) ? 1.85 : 1.15;
      }

      mat.needsUpdate = true;
    });
  });
}

function collectAnimatedParts(object) {
  rings=[]; planets=[];
  object.traverse((node)=>{
    if (/^orbit_ring_/i.test(node.name) || /^armillary_outer$/i.test(node.name)) rings.push(node);
    if (/^planet_/i.test(node.name)) planets.push(node);
  });
}

function attachInteractions() {
  mount.addEventListener('pointermove',(e)=>{
    if (reduceMotion) return;
    const rect = mount.getBoundingClientRect();

    if (isDragging) {
      const dx = (e.clientX-lastX)/rect.width;
      const dy = (e.clientY-lastY)/rect.height;
      dragY += dx*1.18;
      dragX += dy*.80;
      dragX = THREE.MathUtils.clamp(dragX,-.14,.14);
      dragY = THREE.MathUtils.clamp(dragY,-.34,.34);
      lastX=e.clientX; lastY=e.clientY;
    } else if (matchMedia('(pointer:fine)').matches) {
      targetY=((e.clientX-rect.left)/rect.width-.5)*.10;
      targetX=((e.clientY-rect.top)/rect.height-.5)*.055;
    }
  });

  mount.addEventListener('pointerdown',(e)=>{
    if (reduceMotion) return;
    isDragging=true;
    lastX=e.clientX;
    lastY=e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  });

  const end=(e)=>{
    isDragging=false;
    try { canvas.releasePointerCapture?.(e.pointerId); } catch (_) {}
  };
  mount.addEventListener('pointerup',end);
  mount.addEventListener('pointercancel',end);
  mount.addEventListener('pointerleave',()=>{if(!isDragging){targetX=0;targetY=0}});

  new IntersectionObserver((entries)=>{
    visible=entries[0]?.isIntersecting!==false;
    if (visible && !raf) animate(performance.now());
  },{threshold:.02}).observe(mount);

  new ResizeObserver(resizeRenderer).observe(mount);
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const w=Math.max(1,mount.clientWidth);
  const h=Math.max(1,mount.clientHeight);
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}

function animate(now) {
  raf=0;
  if (!renderer || !scene || !camera || !root || !visible) return;

  const dt=Math.min(.05,(now-lastTime)/1000 || .016);
  lastTime=now;

  if (!reduceMotion) {
    currentX += ((targetX+dragX)-currentX)*Math.min(1,dt*3.25);
    currentY += ((targetY+dragY)-currentY)*Math.min(1,dt*3.25);

    dragX *= Math.pow(.980,dt*60);
    dragY *= Math.pow(.980,dt*60);

    root.rotation.x=currentX;
    root.rotation.y=currentY + now*.000032;

    rings.forEach((ring,i)=>{
      const dir=i%2 ? -1 : 1;
      ring.rotation.z += dt*(.018+i*.0055)*dir;
    });

    planets.forEach((planet,i)=>{
      planet.rotation.y += dt*(.035+i*.008);
    });
  }

  renderer.render(scene,camera);
  if (!reduceMotion) raf=requestAnimationFrame(animate);
}

async function boot() {
  if (!webglAvailable()) return fail('WEBGL_UNAVAILABLE');

  try {
    setupRenderer();
    resizeRenderer();

    const loaded = await loadVerifiedGlb();
    model = loaded.gltf.scene;

    frameModel(model);
    tuneMaterials(model);
    collectAnimatedParts(model);
    root.add(model);

    mount.classList.remove('hero3d-failed');
    mount.classList.add('hero3d-ready');
    mount.dataset.state='ready';
    mount.setAttribute('aria-busy','false');
    if (fallback) fallback.hidden=true;
    document.documentElement.classList.add('hero3d-loaded');

    attachInteractions();
    resizeRenderer();
    renderer.render(scene,camera);
    if (!reduceMotion) raf=requestAnimationFrame(animate);

    window.dispatchEvent(new CustomEvent('webinsolito:hero3d-ready',{
      detail:{
        bytes:loaded.bytes,
        sha256:MODEL_SHA256,
        rings:rings.length,
        planets:planets.length,
        directBinary:true,
        premiumModel:true
      }
    }));
  } catch (err) {
    console.error('[Webinsolito 3D V25]',err);
    fail(err?.message || err);
  }
}

boot();
