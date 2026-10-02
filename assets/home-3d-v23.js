
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PARTS = Array.from({length: 10}, (_, i) =>
  './assets/models/webinsolito-hero-v3.part' + String(i).padStart(2, '0') + '.b64'
);

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
  mount.classList.add('hero3d-failed');
  mount.dataset.state = 'fallback';
  if (fallback) fallback.hidden = false;
  window.dispatchEvent(new CustomEvent('webinsolito:hero3d-error', {detail:{reason:String(reason)}}));
}

function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch (_) {
    return false;
  }
}

async function fetchPayload() {
  const responses = await Promise.all(PARTS.map(async (url) => {
    const r = await fetch(url, {cache:'force-cache'});
    if (!r.ok) throw new Error('GLB_PART_HTTP_' + r.status);
    return (await r.text()).trim();
  }));
  const joined = responses.join('');
  const binary = atob(joined);
  const gz = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) gz[i] = binary.charCodeAt(i);

  if ('DecompressionStream' in window) {
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  }

  const pako = await import('https://cdn.jsdelivr.net/npm/pako@2.1.0/+esm');
  return pako.ungzip(gz).buffer;
}

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha:true,
    antialias: !isMobile,
    powerPreference:'high-performance'
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isMobile ? 1.45 : 1.9));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.05, 7.7);

  root = new THREE.Group();
  scene.add(root);

  const hemi = new THREE.HemisphereLight(0x95c9e7, 0x07121a, 1.12);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffdeb0, 3.35);
  key.position.set(-3.8, 4.8, 5.5);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x4aa9d5, 2.3);
  rim.position.set(4.8, 1.6, -4.2);
  scene.add(rim);

  const gold = new THREE.PointLight(0xe3ad62, 22, 14, 2);
  gold.position.set(0.4, -1.2, 4.2);
  scene.add(gold);

  const cool = new THREE.PointLight(0x1f7da9, 10, 12, 2);
  cool.position.set(-3.2, 1.6, 2.2);
  scene.add(cool);
}

function frameModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const desired = isMobile ? 4.5 : 4.75;
  const scale = desired / maxDim;
  object.scale.setScalar(scale);
  object.rotation.x = -0.045;
  object.rotation.y = -0.16;
}

function tuneMaterials(object) {
  object.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    mats.forEach((mat) => {
      if ('metalness' in mat && /ring|planet|axis|finial|logo|spark|rim/i.test(node.name)) {
        mat.metalness = Math.max(mat.metalness ?? 0, .84);
        mat.roughness = Math.min(mat.roughness ?? .5, .25);
      }
      if ('envMapIntensity' in mat) mat.envMapIntensity = 1.15;
      mat.needsUpdate = true;
    });
  });
}

function collectAnimatedParts(object) {
  rings = [];
  planets = [];
  object.traverse((node) => {
    if (/^orbit_ring_/i.test(node.name) || /armillary/i.test(node.name)) rings.push(node);
    if (/^planet_/i.test(node.name)) planets.push(node);
  });
}

function attachInteractions() {
  mount.addEventListener('pointermove', (e) => {
    if (reduceMotion) return;
    const rect = mount.getBoundingClientRect();
    if (isDragging) {
      const dx = (e.clientX - lastX) / rect.width;
      const dy = (e.clientY - lastY) / rect.height;
      dragY += dx * 1.6;
      dragX += dy * 1.15;
      dragX = THREE.MathUtils.clamp(dragX, -.22, .22);
      dragY = THREE.MathUtils.clamp(dragY, -.55, .55);
      lastX = e.clientX; lastY = e.clientY;
    } else if (matchMedia('(pointer:fine)').matches) {
      targetY = ((e.clientX - rect.left) / rect.width - .5) * .16;
      targetX = ((e.clientY - rect.top) / rect.height - .5) * .10;
    }
  });
  mount.addEventListener('pointerdown', (e) => {
    if (reduceMotion) return;
    isDragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  });
  const end = (e) => {
    isDragging = false;
    try { canvas.releasePointerCapture?.(e.pointerId); } catch (_) {}
  };
  mount.addEventListener('pointerup', end);
  mount.addEventListener('pointercancel', end);
  mount.addEventListener('pointerleave', () => {
    if (!isDragging) { targetX = 0; targetY = 0; }
  });

  const observer = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting !== false;
    if (visible && !raf) animate(performance.now());
  }, {threshold:.02});
  observer.observe(mount);

  const resize = new ResizeObserver(resizeRenderer);
  resize.observe(mount);
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const w = Math.max(1, mount.clientWidth);
  const h = Math.max(1, mount.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate(now) {
  raf = 0;
  if (!renderer || !scene || !camera || !root || !visible) return;

  const dt = Math.min(.05, (now - lastTime) / 1000 || .016);
  lastTime = now;

  if (!reduceMotion) {
    currentX += ((targetX + dragX) - currentX) * Math.min(1, dt * 3.6);
    currentY += ((targetY + dragY) - currentY) * Math.min(1, dt * 3.6);
    dragX *= Math.pow(.985, dt * 60);
    dragY *= Math.pow(.985, dt * 60);

    root.rotation.x = currentX;
    root.rotation.y = currentY + now * 0.000055;

    rings.forEach((ring, i) => {
      const dir = i % 2 ? -1 : 1;
      ring.rotation.z += dt * (0.035 + i * 0.009) * dir;
    });
    planets.forEach((p, i) => {
      p.rotation.y += dt * (0.06 + i * .012);
    });
  }

  renderer.render(scene, camera);
  if (!reduceMotion) raf = requestAnimationFrame(animate);
}

async function boot() {
  if (!webglAvailable()) return fail('WEBGL_UNAVAILABLE');

  try {
    setupRenderer();
    resizeRenderer();

    const bytes = await fetchPayload();
    if (bytes.byteLength < 10000) throw new Error('GLB_PAYLOAD_TOO_SMALL');

    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(bytes, '', resolve, reject);
    });

    model = gltf.scene;
    frameModel(model);
    tuneMaterials(model);
    collectAnimatedParts(model);
    root.add(model);

    mount.classList.add('hero3d-ready');
    mount.dataset.state = 'ready';
    mount.setAttribute('aria-busy', 'false');
    if (fallback) fallback.hidden = true;
    document.documentElement.classList.add('hero3d-loaded');

    attachInteractions();
    resizeRenderer();
    renderer.render(scene, camera);
    if (!reduceMotion) raf = requestAnimationFrame(animate);

    window.dispatchEvent(new CustomEvent('webinsolito:hero3d-ready', {
      detail:{bytes:bytes.byteLength, rings:rings.length, planets:planets.length}
    }));
  } catch (err) {
    console.error('[Webinsolito 3D]', err);
    fail(err?.message || err);
  }
}

boot();
