import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const MODEL_URL = './assets/models/webinsolito-hero-v25.glb';
const MODEL_BYTES = 1161316;
const MODEL_SHA256 = '2e1c1de9e7fee040492242b0f7c7dc35d349e8fb47c8d1e4a92618650a5d1b1a';
const RELEASE = '26.0';
const SCRIPT_STARTED = performance.now();

const mount = document.getElementById('hero3d');
const canvas = document.getElementById('hero3dCanvas');
const fallback = document.getElementById('hero3dFallback');
if (!mount || !canvas) throw new Error('WEBINSOLITO_3D_MOUNT_MISSING');

const mediaReduce = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer:fine)');
const isMobile = matchMedia('(max-width: 680px)').matches;
const reduceMotion = mediaReduce.matches;
const hw = navigator.hardwareConcurrency || 4;
const memory = navigator.deviceMemory || 4;
const QUALITY = isMobile ? (hw >= 6 ? 'mobile-high' : 'mobile') : (hw >= 8 && memory >= 6 ? 'high' : 'medium');

let renderer, composer, bloomPass, scene, camera, root, model, raf = 0;
let visible = true;
let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
let dragX = 0, dragY = 0, isDragging = false, lastX = 0, lastY = 0;
let rings = [], planets = [], planetStates = [], lightNodes = [], dustLayers = [];
let lastTime = performance.now();
let frameCounter = 0, fpsWindowStart = performance.now(), qualityReduced = false;
let disposed = false;

function installReferenceSkin() {
  const style = document.createElement('style');
  style.id = 'wi-reference-v26';
  style.textContent = `
    html{--wi-v26-gold:#d6a85f;--wi-v26-gold2:#f3d9a3;--wi-v26-blue:#08263a;}
    body{background:
      radial-gradient(760px 520px at 15% 4%,rgba(58,145,188,.27),transparent 57%),
      radial-gradient(620px 460px at 83% 23%,rgba(211,160,83,.10),transparent 64%),
      linear-gradient(180deg,#051a2a 0%,#03111d 48%,#01070c 100%)!important;}
    .page{min-height:100svh;background:transparent;}
    .top{display:none!important;}
    .hero{padding:54px 0 62px!important;}
    .plate{font-size:13px!important;letter-spacing:.42em!important;color:#f3d9a3!important;text-shadow:0 0 24px rgba(233,188,113,.16);}
    .plate:after{width:68px!important;margin-top:16px!important;background:linear-gradient(90deg,transparent,#e0b267,transparent)!important;}
    .stage{width:min(900px,98vw)!important;height:700px!important;margin-top:2px!important;}
    .modelMount{top:47%!important;width:min(680px,79vw)!important;filter:drop-shadow(0 34px 68px rgba(0,0,0,.58)) drop-shadow(0 0 32px rgba(214,168,95,.12))!important;}
    .hero3dBadge{display:none!important;}
    .node{width:124px!important;}
    .nodeIcon{width:74px!important;height:74px!important;border-color:rgba(244,216,164,.92)!important;background:rgba(2,12,20,.43)!important;box-shadow:0 0 0 5px rgba(212,164,94,.018),0 0 24px rgba(212,164,94,.055),inset 0 0 25px rgba(55,134,171,.11)!important;}
    .node strong{font-size:23px!important;color:#f7ead3!important;text-shadow:0 4px 20px rgba(0,0,0,.48);}
    .node:after{background:linear-gradient(90deg,transparent,#dfb368,transparent)!important;}
    .node:hover .nodeIcon,.node:focus-visible .nodeIcon{box-shadow:0 0 0 5px rgba(212,164,94,.03),0 0 32px rgba(224,179,104,.20),inset 0 0 27px rgba(70,153,191,.14)!important;}
    .nodeAuto{left:2.5%!important;top:15.5%!important}.nodeHome{right:2.5%!important;top:15.5%!important}
    .nodeTravel{left:-.5%!important;bottom:18.5%!important}.nodeFood{right:-.5%!important;bottom:18.5%!important}.nodeMoney{bottom:-.5%!important}
    .connector{border-top-color:rgba(222,175,97,.72)!important;filter:drop-shadow(0 0 6px rgba(217,169,92,.20));animation:wiConnectorPulse 3.8s ease-in-out infinite;}
    .connector:before,.connector:after{content:"";position:absolute;top:-3px;width:6px;height:6px;border-radius:50%;background:#e5b86b;box-shadow:0 0 9px rgba(235,188,105,.65);}
    .connector:before{left:0}.connector:after{right:0}
    @keyframes wiConnectorPulse{50%{opacity:.92;filter:drop-shadow(0 0 9px rgba(228,179,96,.34))}}
    .identity{margin-top:-10px!important;}
    .identity h1{font-size:clamp(78px,9.2vw,132px)!important;line-height:.84!important;background:linear-gradient(180deg,#fff2d7 0%,#f0cf96 30%,#d3a05a 62%,#8a5227 100%)!important;-webkit-background-clip:text!important;background-clip:text!important;text-shadow:0 18px 48px rgba(0,0,0,.38)!important;}
    .identity p{color:#dfc18d!important;letter-spacing:.29em!important;}
    .searchBox{margin-top:36px!important;}
    .searchShell{border-color:rgba(238,195,120,.82)!important;background:linear-gradient(180deg,rgba(4,22,34,.91),rgba(2,12,20,.95))!important;box-shadow:0 25px 70px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.06),0 0 24px rgba(212,164,94,.04)!important;}
    .status{margin-top:38px!important;}
    .statusText{color:#d8b77f!important;opacity:.86;}
    .footer{display:none!important;}
    .wiCosmos{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;}
    .wiCosmos:before{content:"";position:absolute;left:-12%;top:-12%;width:58%;height:72%;background:linear-gradient(118deg,transparent 15%,rgba(255,225,170,.16) 38%,rgba(59,146,192,.07) 49%,transparent 64%);filter:blur(10px);transform:rotate(-7deg);opacity:.8;}
    .wiCosmos:after{content:"";position:absolute;right:-14%;bottom:-10%;width:58%;height:50%;background:radial-gradient(ellipse,rgba(215,166,92,.12),rgba(22,86,119,.08) 35%,transparent 70%);filter:blur(16px);}
    .wiDust{position:absolute;inset:0;background-image:
      radial-gradient(circle at 8% 10%,rgba(255,226,176,.75) 0 1.5px,transparent 2px),
      radial-gradient(circle at 24% 36%,rgba(66,157,203,.54) 0 1px,transparent 1.8px),
      radial-gradient(circle at 82% 20%,rgba(240,196,118,.62) 0 1.4px,transparent 2px),
      radial-gradient(circle at 90% 49%,rgba(58,145,188,.48) 0 1px,transparent 1.8px),
      radial-gradient(circle at 40% 79%,rgba(236,190,111,.44) 0 1.2px,transparent 1.9px);
      background-size:310px 260px,430px 370px,390px 330px,470px 410px,540px 460px;opacity:.68;animation:wiDustDrift 22s ease-in-out infinite alternate;}
    @keyframes wiDustDrift{to{transform:translate3d(0,-10px,0) scale(1.01)}}
    .wiGlowL,.wiGlowR{position:absolute;border-radius:50%;filter:blur(25px);mix-blend-mode:screen;}
    .wiGlowL{left:-120px;top:110px;width:360px;height:520px;background:radial-gradient(ellipse,rgba(47,139,185,.18),transparent 70%);transform:rotate(-18deg)}
    .wiGlowR{right:-100px;top:220px;width:330px;height:440px;background:radial-gradient(ellipse,rgba(212,164,94,.10),transparent 72%);transform:rotate(19deg)}
    @media(max-width:680px){
      .hero{padding-top:34px!important}.stage{height:525px!important}.modelMount{top:46%!important;width:400px!important;max-width:77vw!important}
      .node{width:88px!important}.nodeIcon{width:55px!important;height:55px!important}.node strong{font-size:17px!important}
      .nodeAuto{left:3%!important;top:15%!important}.nodeHome{right:3%!important;top:15%!important}.nodeTravel{left:1%!important;bottom:19%!important}.nodeFood{right:1%!important;bottom:19%!important}.nodeMoney{bottom:0!important}
      .identity{margin-top:-5px!important}.identity h1{font-size:clamp(60px,15vw,84px)!important}.identity p{font-size:9px!important;letter-spacing:.19em!important}
      .wiCosmos:before{width:80%;height:55%;left:-28%;top:-5%;opacity:.56}.wiGlowR{opacity:.55}
    }
    @media(max-width:430px){.stage{height:490px!important}.modelMount{width:344px!important;max-width:79vw!important}.nodeIcon{width:49px!important;height:49px!important}.node strong{font-size:15.5px!important}.identity h1{font-size:59px!important}}
    @media(max-width:390px){.stage{height:468px!important}.modelMount{width:315px!important}.identity h1{font-size:54px!important}}
    @media(prefers-reduced-motion:reduce){.wiDust,.connector{animation:none!important}}
  `;
  document.head.appendChild(style);

  const page = document.querySelector('.page');
  if (page && !page.querySelector('.wiCosmos')) {
    const cosmos = document.createElement('div');
    cosmos.className = 'wiCosmos';
    cosmos.setAttribute('aria-hidden','true');
    cosmos.innerHTML = '<div class="wiDust"></div><div class="wiGlowL"></div><div class="wiGlowR"></div>';
    page.prepend(cosmos);
  }

  document.body.dataset.homeRelease = RELEASE;
  const meta = document.querySelector('meta[name="wi-home-version"]');
  if (meta) meta.content = RELEASE;
  const release = document.querySelector('.release');
  if (release) release.textContent = `Home V${RELEASE}`;
  const badge = document.querySelector('.hero3dBadge');
  if (badge) badge.remove();
  const statusText = document.querySelector('.statusText');
  if (statusText) statusText.textContent = 'CARICAMENTO...';
}

function fail(reason) {
  mount.classList.remove('hero3d-ready');
  mount.classList.add('hero3d-failed');
  mount.dataset.state = 'fallback';
  mount.setAttribute('aria-busy','false');
  if (fallback) fallback.hidden = false;
  const statusText = document.querySelector('.statusText');
  if (statusText) statusText.textContent = 'MODALITÀ COMPATIBILE';
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
  if (bytes.byteLength !== MODEL_BYTES) throw new Error('GLB_SIZE_MISMATCH_' + bytes.byteLength);

  const head = new Uint8Array(bytes,0,4);
  if (String.fromCharCode(head[0],head[1],head[2],head[3]) !== 'glTF') throw new Error('GLB_MAGIC_INVALID');

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

function getPixelRatioCap() {
  if (QUALITY === 'high') return 1.9;
  if (QUALITY === 'medium') return 1.6;
  if (QUALITY === 'mobile-high') return 1.45;
  return 1.25;
}

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha:true,
    antialias:QUALITY === 'high' || QUALITY === 'medium',
    powerPreference:'high-performance',
    preserveDrawingBuffer:false,
    stencil:false
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,getPixelRatioCap()));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = QUALITY.startsWith('mobile') ? 1.18 : 1.26;

  scene = new THREE.Scene();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(renderer),0.04).texture;
  scene.environment = env;
  pmrem.dispose();

  camera = new THREE.PerspectiveCamera(isMobile ? 32.5 : 29.5,1,.1,100);
  camera.position.set(0,.02,isMobile ? 7.86 : 7.38);

  root = new THREE.Group();
  scene.add(root);

  scene.add(new THREE.HemisphereLight(0x9fd7f0,0x02080d,1.12));

  const key = new THREE.DirectionalLight(0xffdfad,4.65);
  key.position.set(-4.4,5.2,5.6);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xd99542,1.55);
  fill.position.set(3.8,-1.4,4.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x39a7dc,2.75);
  rim.position.set(4.7,2.2,-4.8);
  scene.add(rim);

  const gold = new THREE.PointLight(0xf0b866,28,15,2);
  gold.position.set(.6,-1.15,4.8);
  scene.add(gold);
  lightNodes.push(gold);

  const cool = new THREE.PointLight(0x117eac,12,13,2);
  cool.position.set(-3.2,1.8,2.6);
  scene.add(cool);
  lightNodes.push(cool);

  createAtmosphericGeometry();

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const bloomEnabled = !reduceMotion && !QUALITY.startsWith('mobile');
  if (bloomEnabled) {
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1,1),.34,.62,.84);
    bloomPass.threshold = .77;
    bloomPass.strength = QUALITY === 'high' ? .46 : .33;
    bloomPass.radius = .46;
    composer.addPass(bloomPass);
  }
}

function createAtmosphericGeometry() {
  const haloMat = new THREE.MeshBasicMaterial({color:0xd7a65f,transparent:true,opacity:.115,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
  const halo = new THREE.Mesh(new THREE.RingGeometry(2.17,2.19,128),haloMat);
  halo.position.z = -1.6;
  halo.rotation.x = .08;
  scene.add(halo);

  const rayMat = new THREE.MeshBasicMaterial({color:0xffd99b,transparent:true,opacity:.028,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
  for (let i=0;i<(isMobile?2:3);i++) {
    const ray = new THREE.Mesh(new THREE.ConeGeometry(.55+i*.15,5.7+i*.45,32,1,true),rayMat.clone());
    ray.rotation.z = -.78 + i*.14;
    ray.rotation.x = Math.PI/2;
    ray.position.set(-3.8+i*.58,3.4-i*.28,-2.8);
    scene.add(ray);
  }

  addDust(QUALITY.startsWith('mobile') ? 85 : 170,0xe7b969,.028,3.8);
  addDust(QUALITY.startsWith('mobile') ? 55 : 105,0x4a9bc0,.024,4.8);
}

function addDust(count,color,size,spread) {
  const positions = new Float32Array(count*3);
  for (let i=0;i<count;i++) {
    positions[i*3] = (Math.random()-.5)*spread*2.3;
    positions[i*3+1] = (Math.random()-.5)*spread*2.15;
    positions[i*3+2] = -1.8-Math.random()*5.2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material = new THREE.PointsMaterial({color,size,transparent:true,opacity:.55,sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false});
  const points = new THREE.Points(geometry,material);
  scene.add(points);
  dustLayers.push(points);
}

function frameModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const maxDim = Math.max(size.x,size.y,size.z) || 1;
  object.scale.setScalar((isMobile ? 5.02 : 5.24) / maxDim);
  object.rotation.x = -0.025;
  object.rotation.y = -0.055;
}

function tuneMaterials(object) {
  object.traverse((node)=>{
    if (!node.isMesh || !node.material) return;
    node.frustumCulled = true;

    if (/^logo_W_|^logo_star$/i.test(node.name)) {
      node.position.z += .205;
      node.renderOrder = 12;
    }

    const mats = Array.isArray(node.material) ? node.material : [node.material];
    mats.forEach((mat)=>{
      const n = `${mat.name || ''} ${node.name || ''}`.toLowerCase();

      if ('metalness' in mat && /(gold|ring|planet|axis|finial|logo|spark|rim|continent)/i.test(n)) {
        mat.metalness = Math.max(mat.metalness ?? 0,.96);
        mat.roughness = Math.min(mat.roughness ?? .5,.13);
      }
      if (/globe_core/i.test(node.name)) {
        if ('metalness' in mat) mat.metalness = .38;
        if ('roughness' in mat) mat.roughness = .15;
      }
      if (/globe_inner/i.test(node.name) && 'roughness' in mat) mat.roughness = .22;
      if (/continent/i.test(node.name)) {
        if ('metalness' in mat) mat.metalness = .91;
        if ('roughness' in mat) mat.roughness = .18;
      }
      if ('envMapIntensity' in mat) mat.envMapIntensity = /(gold|ring|planet|axis|logo|spark|rim|continent)/i.test(n) ? 2.05 : 1.18;
      if ('emissiveIntensity' in mat && /(spark|rim)/i.test(n)) mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0,.16);
      mat.needsUpdate = true;
    });
  });
}

function collectAnimatedParts(object) {
  rings=[]; planets=[]; planetStates=[];
  object.traverse((node)=>{
    if (/^orbit_ring_/i.test(node.name) || /^armillary_outer$/i.test(node.name)) {
      rings.push({node,base:node.rotation.clone()});
    }
    if (/^planet_/i.test(node.name)) {
      planets.push(node);
      const p=node.position.clone();
      const radius=Math.hypot(p.x,p.y);
      planetStates.push({node,radius,phase:Math.atan2(p.y,p.x),z:p.z,selfY:node.rotation.y});
    }
  });
}

function attachInteractions() {
  mount.addEventListener('pointermove',(e)=>{
    if (reduceMotion) return;
    const rect = mount.getBoundingClientRect();
    if (isDragging) {
      const dx = (e.clientX-lastX)/rect.width;
      const dy = (e.clientY-lastY)/rect.height;
      dragY += dx*.72;
      dragX += dy*.46;
      dragX = THREE.MathUtils.clamp(dragX,-.095,.095);
      dragY = THREE.MathUtils.clamp(dragY,-.16,.16);
      lastX=e.clientX; lastY=e.clientY;
    } else if (finePointer.matches) {
      targetY=((e.clientX-rect.left)/rect.width-.5)*.075;
      targetX=((e.clientY-rect.top)/rect.height-.5)*.040;
    }
  },{passive:true});

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

  if (isMobile && !reduceMotion) {
    const updateScrollParallax=()=>{
      const rect=mount.getBoundingClientRect();
      const vh=Math.max(innerHeight,1);
      const center=(rect.top+rect.height*.5-vh*.5)/vh;
      targetX=THREE.MathUtils.clamp(center*.055,-.055,.055);
    };
    addEventListener('scroll',updateScrollParallax,{passive:true});
    updateScrollParallax();
  }

  new IntersectionObserver((entries)=>{
    visible=entries[0]?.isIntersecting!==false;
    if (visible && !raf && !reduceMotion) animate(performance.now());
  },{threshold:.02}).observe(mount);

  new ResizeObserver(resizeRenderer).observe(mount);
}

function resizeRenderer() {
  if (!renderer || !camera) return;
  const w=Math.max(1,mount.clientWidth);
  const h=Math.max(1,mount.clientHeight);
  renderer.setSize(w,h,false);
  if (composer) composer.setSize(w,h);
  if (bloomPass) bloomPass.resolution.set(w,h);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}

function renderFrame() {
  if (composer) composer.render();
  else renderer.render(scene,camera);
}

function monitorPerformance(now) {
  if (qualityReduced || QUALITY.startsWith('mobile') || reduceMotion) return;
  frameCounter++;
  if (now-fpsWindowStart < 2400) return;
  const fps=frameCounter*1000/(now-fpsWindowStart);
  frameCounter=0;
  fpsWindowStart=now;
  if (fps < 43) {
    qualityReduced=true;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.25));
    if (bloomPass) bloomPass.strength *= .68;
    resizeRenderer();
  }
}

function animate(now) {
  raf=0;
  if (!renderer || !scene || !camera || !root || !visible || disposed) return;
  const dt=Math.min(.05,(now-lastTime)/1000 || .016);
  lastTime=now;
  const t=now*.001;

  currentX += ((targetX+dragX)-currentX)*Math.min(1,dt*3.05);
  currentY += ((targetY+dragY)-currentY)*Math.min(1,dt*3.05);
  dragX *= Math.pow(.976,dt*60);
  dragY *= Math.pow(.976,dt*60);

  root.rotation.x=currentX;
  root.rotation.y=currentY;

  rings.forEach((item,i)=>{
    const dir=i%2 ? -1 : 1;
    const speed=.065+i*.011;
    item.node.rotation.x=item.base.x+Math.sin(t*speed+i*.9)*(.028+i*.003);
    item.node.rotation.y=item.base.y+dir*t*(.010+i*.0017);
    item.node.rotation.z=item.base.z+Math.sin(t*(speed*.72)+i)*.018;
  });

  planetStates.forEach((state,i)=>{
    const speed=(.020+i*.006)*(i%2?-1:1);
    if (state.radius>.035) {
      const a=state.phase+t*speed;
      state.node.position.x=Math.cos(a)*state.radius;
      state.node.position.y=Math.sin(a)*state.radius;
      state.node.position.z=state.z+Math.sin(a*1.35+i)*.028;
    }
    state.node.rotation.y=state.selfY+t*(.08+i*.013);
  });

  dustLayers.forEach((dust,i)=>{
    dust.rotation.z=(i?1:-1)*t*.004;
    dust.position.y=Math.sin(t*.16+i)*.035;
  });

  if (lightNodes[0]) lightNodes[0].intensity=27.2+Math.sin(t*.72)*1.4;
  if (lightNodes[1]) lightNodes[1].intensity=11.6+Math.sin(t*.56+1.7)*.7;

  renderFrame();
  monitorPerformance(now);
  raf=requestAnimationFrame(animate);
}

function dispatchReady(detail) {
  const minVisibleAt=1650;
  const wait=Math.max(0,minVisibleAt-performance.now());
  setTimeout(()=>window.dispatchEvent(new CustomEvent('webinsolito:hero3d-ready',{detail})),wait);
}

async function boot() {
  installReferenceSkin();
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
    document.documentElement.classList.add('hero3d-loaded','wi-home-v26');

    const statusText = document.querySelector('.statusText');
    if (statusText) setTimeout(()=>{statusText.textContent='PRONTO · SCEGLI UNA CATEGORIA O CERCA';},Math.max(0,1700-performance.now()));

    attachInteractions();
    resizeRenderer();
    renderFrame();
    if (!reduceMotion) raf=requestAnimationFrame(animate);

    dispatchReady({
      bytes:loaded.bytes,
      sha256:MODEL_SHA256,
      rings:rings.length,
      planets:planets.length,
      quality:QUALITY,
      release:RELEASE,
      directBinary:true,
      premiumModel:true,
      referenceSkin:true,
      physicalPlanetOrbits:true,
      ringPrecession:true,
      bloom:!!bloomPass
    });
  } catch (err) {
    console.error('[Webinsolito 3D V26]',err);
    fail(err?.message || err);
  }
}

addEventListener('pagehide',()=>{
  disposed=true;
  if (raf) cancelAnimationFrame(raf);
  try { composer?.dispose?.(); } catch (_) {}
  try { renderer?.dispose?.(); } catch (_) {}
},{once:true});

boot();
