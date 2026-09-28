// Live 3D Axie preview using the real Sky Mavis Axie Mixer 3D toolkit
// (github:jaatster/threejs-axie-mixer3d-public), with a curated ~12MB subset
// of the asset pack (see public/assets/axie3d/ and scripts/trim-axie3d-assets.mjs).
// No genes/wallet lookup needed: we build an explicit AxieDescriptor per class.
import * as THREE from 'three';
import { createAxieMixer3D } from '@jaatster/threejs-axie-mixer3d-public';
import { buildDescriptor, equipSetWeapon, weaponPrefix, playClip } from './axieLook.js';

let renderer, scene, camera, clock, canvasEl;
let mixerPromise = null;
let currentAxie = null;
let currentRequestId = 0;
let loopStarted = false;

function ensureMixer(){
  if (!mixerPromise){
    mixerPromise = (async () => {
      const base = import.meta.env.BASE_URL + 'assets/axie3d/';
      const manifest = await fetch(base + 'manifest.json').then(r => {
        if (!r.ok) throw new Error(`manifest fetch failed: ${r.status}`);
        return r.json();
      });
      return createAxieMixer3D({ manifest, assetBaseUrl: base, renderer });
    })();
  }
  return mixerPromise;
}

// The preview is created while the editor is still hidden (0x0), so it
// must follow the canvas's real size whenever it changes -- not only on
// window resizes -- or it renders at a fallback size and gets stretched.
function resize(){
  if (!renderer || !canvasEl) return;
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Keep the whole Axie (about 1.6 units tall, 1.8 wide with its weapon)
  // in frame whatever the canvas shape.
  const dist = camera.position.distanceTo(LOOK);
  const vNeed = 2 * Math.atan(0.95 / dist);
  const hNeed = 2 * Math.atan(Math.tan(Math.atan(1.1 / dist)) / camera.aspect);
  camera.fov = THREE.MathUtils.radToDeg(Math.max(vNeed, hNeed));
  camera.updateProjectionMatrix();
}
const LOOK = new THREE.Vector3(0, 0.72, 0);

export function initPreview(canvas){
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
  camera.position.set(0, 1.05, 2.6);
  camera.lookAt(LOOK);
  scene.add(new THREE.HemisphereLight(0xfff3d6, 0x3a2c1a, 1.4));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(2, 3, 2);
  scene.add(dir);
  clock = new THREE.Clock();
  resize();
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  if (!loopStarted){
    loopStarted = true;
    requestAnimationFrame(animate);
  }
  return ensureMixer();
}

// Showcase: every few seconds the previewed Axie swings its set's weapon,
// alternating its Attack and Skill clips.
let showcaseTimer = 1.2, showcaseStep = 0, currentWeapon = null;
function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  if (currentAxie && !currentAxie.disposed){
    currentAxie.update(dt);
    showcaseTimer -= dt;
    if (showcaseTimer <= 0 && currentWeapon){
      showcaseTimer = 4;
      playClip(currentAxie, `${currentWeapon}.${showcaseStep++ % 2 ? 'Skill' : 'Attack'}`);
    }
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// Swaps the previewed Axie. Guards against out-of-order async resolution
// (rapid class switching) with a request id.
// `setId` equips that card set's weapon; `evolved` shows the Mystic version.
export async function showAxie(classId, { setId = null, evolved = false } = {}){
  const requestId = ++currentRequestId;
  const mixer = await ensureMixer();
  const descriptor = buildDescriptor(classId, { evolved });
  const axie = await mixer.create({ descriptor, quality: 'balanced', artMode: 'faithful', strict: true });
  if (setId) await equipSetWeapon(axie, setId, evolved);
  if (requestId !== currentRequestId){
    axie.dispose();
    return;
  }
  if (currentAxie){
    scene.remove(currentAxie.wrapper);
    currentAxie.dispose();
  }
  currentAxie = axie;
  currentWeapon = weaponPrefix(setId);
  showcaseTimer = 1.2;
  scene.add(axie.wrapper);
  axie.setLocomotion('idle');
}
