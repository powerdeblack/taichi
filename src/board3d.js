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
const impacts = []; // short-lived hit/heal burst effects -- see spawnImpact

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
  // Pulled back and slightly wider than the original tiles-only framing so
  // the much bigger hall (see buildHall) actually reads as a big room
  // instead of just a slightly larger floor color.
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, 7.4, 7.8);
  camera.lookAt(0, 0, -0.3);
  // matrixWorldInverse (needed by Vector3.project, used for overlay
  // positioning) is normally only refreshed during a render() pass -- force
  // it now so projectLane() works before the first animation frame ticks.
  camera.updateMatrixWorld(true);
  // Fog so the hall fades into darkness at the edges instead of the floor
  // just hard-cutting -- sells the sense of a vast dim room.
  scene.fog = new THREE.Fog(0x120c08, 9, 26);
  scene.add(new THREE.HemisphereLight(0xfff3d6, 0x241a10, 1.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
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
  tickImpacts(dt);
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// Short-lived 3D "hit" feedback at a lane's current position: an
// expanding, fading ring plus a handful of sparks that pop outward and
// fall -- real visual impact on attacks (and a softer version on heals),
// instead of just DOM flash/shake/floating text.
function tickImpacts(dt){
  for (let i = impacts.length - 1; i >= 0; i--){
    const im = impacts[i];
    im.age += dt;
    const t = Math.min(1, im.age / im.life);
    im.ring.scale.setScalar(1 + t * 7);
    im.ring.material.opacity = im.ringOpacity * (1 - t);
    im.sparks.forEach(sp => {
      sp.position.addScaledVector(sp.userData.vel, dt);
      sp.userData.vel.y -= dt * 2.4; // gravity
      sp.material.opacity = 1 - t;
    });
    if (t >= 1){
      scene.remove(im.ring); im.ring.geometry.dispose(); im.ring.material.dispose();
      im.sparks.forEach(sp => { scene.remove(sp); sp.geometry.dispose(); sp.material.dispose(); });
      impacts.splice(i, 1);
    }
  }
}

const IMPACT_COLORS = { hit: 0xff7a4d, heal: 0x8fe6a0, shield: 0x8fd0ff };

export function spawnImpact(side, laneIndex, kind = 'hit'){
  if (!scene) return;
  const s = slots.get(slotKey(side, laneIndex));
  const pos = s ? s.axie.wrapper.position.clone() : laneWorldPos(side, { x: 0, z: 0 });
  pos.y += 0.9;
  const color = IMPACT_COLORS[kind] || IMPACT_COLORS.hit;

  const ringGeo = new THREE.RingGeometry(0.06, 0.16, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pos);
  ring.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
  scene.add(ring);

  const sparks = [];
  const sparkCount = kind === 'heal' ? 5 : 8;
  for (let i = 0; i < sparkCount; i++){
    const sparkMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), sparkMat);
    spark.position.copy(pos);
    const angle = Math.random() * Math.PI * 2;
    const speed = kind === 'heal' ? 0.5 + Math.random() * 0.4 : 0.9 + Math.random() * 0.9;
    const upBias = kind === 'heal' ? 1.4 + Math.random() * 0.6 : Math.random() * 0.6;
    spark.userData.vel = new THREE.Vector3(Math.cos(angle) * speed, upBias, Math.sin(angle) * speed * 0.6);
    scene.add(spark);
    sparks.push(spark);
  }

  impacts.push({ ring, sparks, age: 0, life: kind === 'heal' ? 0.6 : 0.45, ringOpacity: 0.95 });
}

// Formation slots, col 0..4: the Tank always starts at 0 (center); 1/2 are
// the front line either side of it (closest to the enemy and to its own
// taunt radius), 3/4 are the back line (farther back, safer). These mirror
// game.js's FORMATION_XZ exactly -- keep both in sync if you tune one.
// Local {x,z} offsets are in the side's own facing space -- laneWorldPos
// flips z for the far side so both formations face each other. The Tank
// roams this same local space freely (see game.js moveSquadWithTank) and
// the other 4 lanes escort it, keeping this same offset relative to
// wherever it currently stands, instead of a fixed slot lookup.
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
const HALL_RADIUS = 11.0;
const COLUMN_RADIUS = 6.4;
const COLUMN_COUNT = 12;

function buildHall(){
  const floorGeo = new THREE.CircleGeometry(HALL_RADIUS, 48);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 0.92, metalness: 0.05 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.1;
  scene.add(floor);

  // Kept thin and dim -- it's a distant edge marker, not meant to compete
  // visually with the columns (which are the actual "big room" landmarks).
  const trimGeo = new THREE.RingGeometry(HALL_RADIUS - 0.15, HALL_RADIUS - 0.05, 48);
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a30, roughness: 0.6, metalness: 0.2,
    emissive: 0x8a6a30, emissiveIntensity: 0.08,
  });
  const trim = new THREE.Mesh(trimGeo, trimMat);
  trim.rotation.x = -Math.PI / 2;
  trim.position.y = -0.095;
  scene.add(trim);

  // Columns sit much closer than the outer trim so they read as distinct
  // pillars framing the play area, not a blur merging with the far ring.
  const colHeight = 4.8;
  const colGeo = new THREE.CylinderGeometry(0.3, 0.38, colHeight, 12);
  const capGeo = new THREE.CylinderGeometry(0.58, 0.46, 0.32, 12);
  const colMat = new THREE.MeshStandardMaterial({ color: 0x5c4530, roughness: 0.8, metalness: 0.1 });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xffcf5c, roughness: 0.35, metalness: 0.45,
    emissive: 0xffcf5c, emissiveIntensity: 0.5,
  });
  for (let i = 0; i < COLUMN_COUNT; i++){
    const angle = (i / COLUMN_COUNT) * Math.PI * 2;
    const x = Math.cos(angle) * COLUMN_RADIUS, z = Math.sin(angle) * COLUMN_RADIUS;
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.set(x, colHeight / 2, z);
    scene.add(col);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(x, colHeight + 0.15, z);
    scene.add(cap);
    const base = new THREE.Mesh(capGeo, capMat);
    base.position.set(x, -0.03, z);
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
