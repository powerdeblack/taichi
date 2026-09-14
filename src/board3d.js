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
let elapsedTime = 0;
// side:laneIndex -> { axie, side, laneIndex, targetPos, basePos, phase }
const slots = new Map();
const slotKey = (side, laneIndex) => side + ':' + laneIndex;
const MOVE_LERP_SPEED = 6; // higher = snappier slide into the new column
const PATROL_AMPLITUDE = 0.07; // how far units idly wander from their slot

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
  buildTiles();
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
  elapsedTime += dt;
  slots.forEach(s => {
    if (s.axie && !s.axie.disposed) s.axie.update(dt);
    if (s.targetPos){
      s.axie.wrapper.position.lerp(s.targetPos, Math.min(1, dt * MOVE_LERP_SPEED));
      if (s.axie.wrapper.position.distanceTo(s.targetPos) < 0.01){
        s.axie.wrapper.position.copy(s.targetPos);
        s.basePos = s.targetPos.clone();
        s.targetPos = null;
      }
    } else if (s.basePos){
      // Idle "patrol": a small sway around the assigned slot so the board
      // doesn't look frozen between turns -- purely cosmetic, doesn't
      // touch the HTML overlay (projectLane keeps using the exact slot).
      const t = elapsedTime + s.phase;
      s.axie.wrapper.position.x = s.basePos.x + Math.sin(t * 0.6) * PATROL_AMPLITUDE;
      s.axie.wrapper.position.z = s.basePos.z + Math.cos(t * 0.5) * PATROL_AMPLITUDE * 0.8;
    }
  });
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// Formation slots, col 0..4: the Tank always starts at 0 (center); 1/2 are
// the front line either side of it (closest to the enemy and to the
// Tank's taunt radius), 3/4 are the back line (farther back, safer).
// Local {x,z} offsets are in the side's own facing space -- laneWorldPos
// flips z for the far side so both formations face each other.
const FORMATION = [
  { x: 0,     z: 0 },     // 0: center (Tank)
  { x: -1.05, z: 0.65 },  // 1: front-left
  { x: 1.05,  z: 0.65 },  // 2: front-right
  { x: -0.6,  z: -0.7 },  // 3: back-left
  { x: 0.6,   z: -0.7 },  // 4: back-right
];
const COLS = FORMATION.length;
const ROW_Z = { you: 1.5, rival: -1.5 };

function laneWorldPos(side, col){
  const slot = FORMATION[col] || FORMATION[0];
  const faceSign = side === 'you' ? -1 : 1; // "forward" (+z offset) means toward the enemy
  return new THREE.Vector3(slot.x, 0, ROW_Z[side] + faceSign * slot.z);
}

// Flat isometric-style tiles under every formation slot, Apeiron-style --
// purely cosmetic, positions are fixed regardless of who's standing there.
// The Tank's center tile is bigger and gets a pulsing ring showing its
// taunt radius (see game.js TAUNT_RADIUS/getLegalTargets).
function buildTiles(){
  const tileGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.07, 4);
  const tankTileGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.08, 4);
  const rimGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.03, 4);
  const ringGeo = new THREE.RingGeometry(1.35, 1.5, 32);
  ['you','rival'].forEach(side => {
    const color = side === 'you' ? 0xe39a5f : 0x7bb9d6;
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.15,
      emissive: color, emissiveIntensity: 0.35,
    });
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0xffd23f, roughness: 0.4, metalness: 0.2,
      emissive: 0xffd23f, emissiveIntensity: 0.5,
    });
    const rimMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
    for (let col=0; col<COLS; col++){
      const pos = laneWorldPos(side, col);
      const isTankSlot = col === 0;
      const tile = new THREE.Mesh(isTankSlot ? tankTileGeo : tileGeo, isTankSlot ? tankMat : mat);
      tile.position.set(pos.x, -0.04, pos.z);
      tile.rotation.y = Math.PI / 4;
      scene.add(tile);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(pos.x, -0.06, pos.z);
      rim.rotation.y = Math.PI / 4;
      scene.add(rim);
      if (isTankSlot){
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(pos.x, -0.03, pos.z);
        ring.rotation.x = -Math.PI / 2;
        scene.add(ring);
      }
    }
  });
}

// Projects a lane's world position (by board column) to a [0..1] screen-
// space fraction, for positioning an absolutely-positioned HTML overlay
// (left/top in %) over it.
export function projectLane(side, col){
  if (!camera) return null;
  const pos = laneWorldPos(side, col);
  pos.y += 1.05; // float the tag above the model's head
  pos.project(camera);
  return { x: pos.x * 0.5 + 0.5, y: 1 - (pos.y * 0.5 + 0.5) };
}

// Builds the 3D models for the current match's two squads (call once per
// match start -- lane classes don't change mid-duel). Reuses the shared
// renderer/scene; old slots from a previous match are disposed first.
// Positions come from each lane's `col`, not its array index -- movement
// changes col, not array position.
export async function syncBoardAxies(youLanes, rivalLanes){
  const mixer = await ensureMixer();
  clearBoard3D();
  // Load all up-to-10 models concurrently (not one-by-one) so the board
  // pops in together instead of unit-by-unit over several seconds.
  const spawn = (side, lane, i) => (async () => {
    const descriptor = buildDescriptor(lane.classId);
    const axie = await mixer.create({ descriptor, quality: 'balanced', artMode: 'faithful', strict: true });
    const basePos = laneWorldPos(side, lane.col);
    axie.wrapper.position.copy(basePos);
    axie.wrapper.scale.setScalar(0.62);
    axie.wrapper.rotation.y = side === 'you' ? Math.PI : 0;
    axie.wrapper.visible = lane.alive;
    scene.add(axie.wrapper);
    axie.setLocomotion('idle');
    slots.set(slotKey(side, i), {
      axie, side, laneIndex: i, targetPos: null,
      basePos: basePos.clone(), phase: Math.random() * Math.PI * 2,
    });
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

// Slides a lane's 3D model toward its new column over the next few frames
// (see animate()) instead of snapping -- the visible "movement" on the
// board when moveLane() swaps two columns.
export function moveLaneVisual(side, laneIndex, newCol){
  const s = slots.get(slotKey(side, laneIndex));
  if (!s) return;
  s.targetPos = laneWorldPos(side, newCol);
}

export function clearBoard3D(){
  slots.forEach(s => { scene.remove(s.axie.wrapper); s.axie.dispose(); });
  slots.clear();
}
