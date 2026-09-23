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
// side:laneIndex -> { axie, side, laneIndex, targetPos, basePos, phase, introWalk }
const slots = new Map();
const slotKey = (side, laneIndex) => side + ':' + laneIndex;
const MOVE_LERP_SPEED = 6; // higher = snappier slide into the new slot
const INTRO_LERP_SPEED = 1.8; // slower -- the opening "walk into the hall" entrance (~2.5-3s)
const PATROL_AMPLITUDE = 0.07; // how far idle units wander from their spot
const INTRO_SPAWN_OFFSET = 2.0; // extra distance back from the formation at match start

// Some rigs may not expose every named locomotion clip -- never let a
// missing 'walk' state break the entrance.
function trySetLocomotion(axie, state){
  try { axie.setLocomotion(state); } catch (e) { /* unsupported locomotion state -- ignore */ }
}

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
  buildHall();
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
    if (s.live) return; // continuously driven from outside (the Tank while roaming) -- animate() shouldn't fight it
    if (s.targetPos){
      const speed = s.introWalk ? INTRO_LERP_SPEED : MOVE_LERP_SPEED;
      s.axie.wrapper.position.lerp(s.targetPos, Math.min(1, dt * speed));
      if (s.axie.wrapper.position.distanceTo(s.targetPos) < 0.01){
        s.axie.wrapper.position.copy(s.targetPos);
        s.basePos = s.targetPos.clone();
        s.targetPos = null;
        if (s.introWalk){
          s.introWalk = false;
          trySetLocomotion(s.axie, 'idle');
        }
      }
    } else if (s.basePos){
      // Idle "patrol": a small sway around the assigned slot so the board
      // doesn't look frozen when nothing's happening -- purely cosmetic,
      // doesn't touch the HTML overlay (projectLane uses the exact spot).
      const t = elapsedTime + s.phase;
      s.axie.wrapper.position.x = s.basePos.x + Math.sin(t * 0.6) * PATROL_AMPLITUDE;
      s.axie.wrapper.position.z = s.basePos.z + Math.cos(t * 0.5) * PATROL_AMPLITUDE * 0.8;
    }
  });
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// Formation slots, col 0..4: the Tank always starts at 0 (center); 1/2 are
// the front line either side of it (closest to the enemy and to its own
// taunt radius), 3/4 are the back line (farther back, safer). These mirror
// game.js's FORMATION_XZ exactly -- keep both in sync if you tune one.
// Local {x,z} offsets are in the side's own facing space -- laneWorldPos
// flips z for the far side so both formations face each other. Only
// non-Tank lanes stay pinned to a slot; the Tank roams this same local
// space freely (see game.js moveTankFreely) and its live {x,z} is passed
// straight through instead of a slot lookup.
const FORMATION = [
  { x: 0,     z: 0 },     // 0: center (Tank's default)
  { x: -1.05, z: 0.65 },  // 1: front-left
  { x: 1.05,  z: 0.65 },  // 2: front-right
  { x: -0.6,  z: -0.7 },  // 3: back-left
  { x: 0.6,   z: -0.7 },  // 4: back-right
];
const COLS = FORMATION.length;
const ROW_Z = { you: 1.5, rival: -1.5 };

function laneWorldPos(side, localXZ){
  const faceSign = side === 'you' ? -1 : 1; // "forward" (+z offset) means toward the enemy
  return new THREE.Vector3(localXZ.x, 0, ROW_Z[side] + faceSign * localXZ.z);
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
      const pos = laneWorldPos(side, FORMATION[col]);
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

// The Lunacia hall: a big stone floor with a ring of columns and a glowing
// emblem at the center, between the two rows -- an arena backdrop closer
// to a 3x3-style dueling hall than bare tiles floating in space. Purely
// cosmetic, built once and never touched again.
const HALL_RADIUS = 4.0;
const COLUMN_RADIUS = 3.6;
const COLUMN_COUNT = 8;

function buildHall(){
  const floorGeo = new THREE.CircleGeometry(HALL_RADIUS, 48);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 0.92, metalness: 0.05 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.1;
  scene.add(floor);

  const trimGeo = new THREE.RingGeometry(HALL_RADIUS - 0.25, HALL_RADIUS - 0.05, 48);
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xd9b44a, roughness: 0.5, metalness: 0.3,
    emissive: 0xd9b44a, emissiveIntensity: 0.15,
  });
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.rotation.x = -Math.PI / 2;
  trim.position.y = -0.095;
  scene.add(trim);

  const colGeo = new THREE.CylinderGeometry(0.16, 0.19, 2.2, 12);
  const capGeo = new THREE.CylinderGeometry(0.3, 0.24, 0.18, 12);
  const colMat = new THREE.MeshStandardMaterial({ color: 0x4a3824, roughness: 0.85, metalness: 0.1 });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xd9b44a, roughness: 0.4, metalness: 0.4,
    emissive: 0xd9b44a, emissiveIntensity: 0.2,
  });
  for (let i = 0; i < COLUMN_COUNT; i++){
    const angle = (i / COLUMN_COUNT) * Math.PI * 2;
    const x = Math.cos(angle) * COLUMN_RADIUS, z = Math.sin(angle) * COLUMN_RADIUS;
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.set(x, 1.0, z);
    scene.add(col);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(x, 2.15, z);
    scene.add(cap);
    const base = new THREE.Mesh(capGeo, capMat);
    base.position.set(x, -0.02, z);
    scene.add(base);
  }

  const sigilGeo = new THREE.CircleGeometry(1.0, 48);
  const sigilMat = new THREE.MeshBasicMaterial({
    map: buildLunaciaSigilTexture(), transparent: true, opacity: 0.9, depthWrite: false,
  });
  const sigil = new THREE.Mesh(sigilGeo, sigilMat);
  sigil.rotation.x = -Math.PI / 2;
  sigil.position.y = -0.085;
  scene.add(sigil);
}

// Draws a stylized Lunacia sigil (a rune circle with a crescent moon and
// orbiting land-plot dots) onto a canvas at runtime -- there's no
// illustrated emblem asset in this prototype, so it's generated instead.
function buildLunaciaSigilTexture(){
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;

  ctx.strokeStyle = '#ffd23f';
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.4, 0, Math.PI * 2); ctx.stroke();

  ctx.lineWidth = 3;
  for (let i = 0; i < 24; i++){
    const a = (i / 24) * Math.PI * 2;
    const r1 = size * 0.4, r2 = size * 0.46;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#f4e6c1';
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c130c';
  ctx.beginPath(); ctx.arc(cx + size * 0.09, cy, size * 0.2, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#8fd0ff';
  for (let i = 0; i < 6; i++){
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const r = size * 0.33;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, size * 0.014, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Projects a lane's local {x,z} position to a [0..1] screen-space
// fraction, for positioning an absolutely-positioned HTML overlay
// (left/top in %) over it.
export function projectLane(side, localXZ){
  if (!camera) return null;
  const pos = laneWorldPos(side, localXZ);
  pos.y += 1.05; // float the tag above the model's head
  pos.project(camera);
  return { x: pos.x * 0.5 + 0.5, y: 1 - (pos.y * 0.5 + 0.5) };
}

// Builds the 3D models for the current match's two squads (call once per
// match start -- lane classes don't change mid-duel). Reuses the shared
// renderer/scene; old slots from a previous match are disposed first.
// Positions come from each lane's live `localPos`, not its array index.
// Both squads spawn a bit further back than their real formation spot and
// walk in to it (see animate()'s introWalk handling) -- an entrance into
// the hall instead of popping in already face to face.
export async function syncBoardAxies(youLanes, rivalLanes){
  const mixer = await ensureMixer();
  clearBoard3D();
  // Load all up-to-10 models concurrently (not one-by-one) so the board
  // pops in together instead of unit-by-unit over several seconds.
  const spawn = (side, lane, i) => (async () => {
    const descriptor = buildDescriptor(lane.classId);
    const axie = await mixer.create({ descriptor, quality: 'balanced', artMode: 'faithful', strict: true });
    const basePos = laneWorldPos(side, lane.localPos);
    const introOffset = new THREE.Vector3(0, 0, side === 'you' ? INTRO_SPAWN_OFFSET : -INTRO_SPAWN_OFFSET);
    const spawnPos = basePos.clone().add(introOffset);
    const walking = lane.alive;
    axie.wrapper.position.copy(spawnPos);
    axie.wrapper.scale.setScalar(0.62);
    axie.wrapper.rotation.y = side === 'you' ? Math.PI : 0;
    axie.wrapper.visible = lane.alive;
    scene.add(axie.wrapper);
    trySetLocomotion(axie, walking ? 'walk' : 'idle');
    slots.set(slotKey(side, i), {
      axie, side, laneIndex: i, targetPos: walking ? basePos.clone() : null, live: false,
      basePos: spawnPos.clone(), phase: Math.random() * Math.PI * 2, introWalk: walking,
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

// Slides a lane's 3D model toward a new local {x,z} over the next few
// frames (see animate()) instead of snapping -- the visible "movement" on
// the board when moveLane() swaps two slots.
export function moveLaneVisual(side, laneIndex, newLocalXZ){
  const s = slots.get(slotKey(side, laneIndex));
  if (!s) return;
  s.live = false;
  s.targetPos = laneWorldPos(side, newLocalXZ);
}

// Directly places a lane's 3D model at a local {x,z} this frame -- no
// lerp, no patrol wobble -- for continuous per-frame control (the Tank
// while its joystick is held). Call setLaneRoaming(side, laneIndex, false)
// once the drag ends so idle patrol resumes around the new spot.
export function setLaneLivePosition(side, laneIndex, localXZ){
  const s = slots.get(slotKey(side, laneIndex));
  if (!s) return;
  s.live = true;
  s.targetPos = null;
  s.axie.wrapper.position.copy(laneWorldPos(side, localXZ));
}

export function setLaneRoaming(side, laneIndex, roaming){
  const s = slots.get(slotKey(side, laneIndex));
  if (!s) return;
  s.live = roaming;
  if (!roaming) s.basePos = s.axie.wrapper.position.clone();
}

export function clearBoard3D(){
  slots.forEach(s => { scene.remove(s.axie.wrapper); s.axie.dispose(); });
  slots.clear();
}
