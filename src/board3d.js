// Live 3D battle board: every alive Axie on both squads (up to 10) rendered
// as a real 3D model via the Axie Mixer 3D toolkit, sharing ONE renderer/
// scene/camera instead of one WebGL context per Axie (heavy on mobile).
// HP/name/status stay plain HTML, positioned over each model by projecting
// its world position through the camera -- same technique games like
// Apeiron use for floating unit UI over a 3D battlefield.
import * as THREE from 'three';
import { createAxieMixer3D } from '@jaatster/threejs-axie-mixer3d-public';

const NEED_TYPES = ['eye', 'mouth', 'ear', 'horn', 'back', 'tail'];
// Our roster uses 'Aqua'; the asset pack's class id is 'Aquatic'.
const CLASS_ALIAS = { Aqua: 'Aquatic' };

function buildDescriptor(classId){
  const cls = CLASS_ALIAS[classId] || classId;
  return {
    colorVariant: 0,
    body: 'normal',
    parts: NEED_TYPES.map(type => ({ type, skin: 0, class: cls, variant: 2, level: 1 })),
  };
}

let renderer, scene, camera, clock, canvasEl;
let mixerPromise = null;
let loopStarted = false;
// side:laneIndex -> { axie, side, laneIndex }
const slots = new Map();
const slotKey = (side, laneIndex) => side + ':' + laneIndex;

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

export function resizeBoard3D(){
  if (!renderer || !canvasEl) return;
  const w = canvasEl.clientWidth || 320;
  const h = canvasEl.clientHeight || 240;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function initBoard3D(canvas){
  if (mixerPromise) return mixerPromise; // already initialized once
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  camera.position.set(0, 5.6, 5.4);
  camera.lookAt(0, 0, -0.3);
  // matrixWorldInverse (needed by Vector3.project, used for overlay
  // positioning) is normally only refreshed during a render() pass -- force
  // it now so projectLane() works before the first animation frame ticks.
  camera.updateMatrixWorld(true);
  scene.add(new THREE.HemisphereLight(0xfff3d6, 0x241a10, 1.5));
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(3, 6, 3);
  scene.add(dir);
  clock = new THREE.Clock();
  resizeBoard3D();
  window.addEventListener('resize', resizeBoard3D);
  if (!loopStarted){
    loopStarted = true;
    requestAnimationFrame(animate);
  }
  return ensureMixer();
}

function animate(){
  requestAnimationFrame(animate);
  const dt = clock ? Math.min(0.05, clock.getDelta()) : 0;
  slots.forEach(s => { if (s.axie && !s.axie.disposed) s.axie.update(dt); });
  if (renderer && scene && camera) renderer.render(scene, camera);
}

const COLS = 5;
const COL_SPACING = 1.05;
const ROW_Z = { you: 1.35, rival: -1.35 };

function laneWorldPos(side, laneIndex){
  const x = (laneIndex - (COLS - 1) / 2) * COL_SPACING;
  return new THREE.Vector3(x, 0, ROW_Z[side]);
}

// Projects a lane's world position to a [0..1] screen-space fraction, for
// positioning an absolutely-positioned HTML overlay (left/top in %) over it.
export function projectLane(side, laneIndex){
  if (!camera) return null;
  const pos = laneWorldPos(side, laneIndex);
  pos.y += 1.05; // float the tag above the model's head
  pos.project(camera);
  return { x: pos.x * 0.5 + 0.5, y: 1 - (pos.y * 0.5 + 0.5) };
}

// Builds the 3D models for the current match's two squads (call once per
// match start -- lane classes don't change mid-duel). Reuses the shared
// renderer/scene; old slots from a previous match are disposed first.
export async function syncBoardAxies(youLanes, rivalLanes){
  const mixer = await ensureMixer();
  clearBoard3D();
  // Load all up-to-10 models concurrently (not one-by-one) so the board
  // pops in together instead of unit-by-unit over several seconds.
  const spawn = (side, lane, i) => (async () => {
    const descriptor = buildDescriptor(lane.classId);
    const axie = await mixer.create({ descriptor, quality: 'balanced', artMode: 'faithful', strict: true });
    axie.wrapper.position.copy(laneWorldPos(side, i));
    axie.wrapper.scale.setScalar(0.62);
    axie.wrapper.rotation.y = side === 'you' ? Math.PI : 0;
    axie.wrapper.visible = lane.alive;
    scene.add(axie.wrapper);
    axie.setLocomotion('idle');
    slots.set(slotKey(side, i), { axie, side, laneIndex: i });
  })();
  const jobs = [
    ...youLanes.map((lane, i) => spawn('you', lane, i)),
    ...rivalLanes.map((lane, i) => spawn('rival', lane, i)),
  ];
  await Promise.all(jobs);
}

export function setLaneAlive(side, laneIndex, alive){
  const s = slots.get(slotKey(side, laneIndex));
  if (s) s.axie.wrapper.visible = alive;
}

export function clearBoard3D(){
  slots.forEach(s => { scene.remove(s.axie.wrapper); s.axie.dispose(); });
  slots.clear();
}
