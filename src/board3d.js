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
// side:laneIndex -> { axie, side, laneIndex, targetPos, basePos, phase,
// introWalk, baseRotation, lastPos } -- baseRotation is the default
// "facing the enemy" orientation it settles back to while idle; lastPos
// tracks where it was last frame so animate() can infer a facing
// direction from movement (see faceDirection) even for live-driven slots
// whose position it doesn't own.
const slots = new Map();
const slotKey = (side, laneIndex) => side + ':' + laneIndex;
const MOVE_LERP_SPEED = 6; // higher = snappier slide into the new slot
const INTRO_LERP_SPEED = 1.8; // slower -- the opening "walk into the hall" entrance (~2.5-3s)
const PATROL_AMPLITUDE = 0.07; // how far idle units wander from their spot
const INTRO_SPAWN_OFFSET = 2.0; // extra distance back from the formation at match start
const ROTATE_LERP_SPEED = 8; // higher = snaps to face its movement direction faster
const impacts = []; // short-lived hit/heal burst effects -- see spawnImpact

// Some rigs may not expose every named locomotion clip -- never let a
// missing 'walk' state break the entrance.
function trySetLocomotion(axie, state){
  try { axie.setLocomotion(state); } catch (e) { /* unsupported locomotion state -- ignore */ }
}

// Shortest-path angle interpolation (plain lerp would spin the long way
// round across the +-PI wrap) -- used to smoothly turn a wrapper's
// rotation.y to face wherever it's currently moving.
function lerpAngle(a, b, t){
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// wrapper.rotation.y = 0 faces world +Z (see laneWorldPos/spawn: 'rival'
// starts at 0 and is already facing 'you' across the hall); turning by
// atan2(dx, dz) points the model at a given world-space {dx,dz} direction.
function faceDirection(s, dx, dz, dt){
  if (dx * dx + dz * dz < 0.0004) return; // too small to be real movement -- ignore patrol-wobble-scale noise
  const targetAngle = Math.atan2(dx, dz);
  s.axie.wrapper.rotation.y = lerpAngle(s.axie.wrapper.rotation.y, targetAngle, Math.min(1, dt * ROTATE_LERP_SPEED));
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
  camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  camera.position.set(0, 11.5, 12.6);
  camera.lookAt(0, 0, 0.2);
  // matrixWorldInverse (needed by Vector3.project, used for overlay
  // positioning) is normally only refreshed during a render() pass -- force
  // it now so projectLane() works before the first animation frame ticks.
  camera.updateMatrixWorld(true);
  // Cool sky light off the snow plus a warm low sun for contrast.
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x9ab8d6, 1.5));
  const dir = new THREE.DirectionalLight(0xffe6c4, 1.5);
  dir.position.set(3, 6, 3);
  scene.add(dir);
  clock = new THREE.Clock();
  buildHall();
  buildTauntRings();
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
    if (s.live){
      // Position is driven from outside (setLaneLivePosition, every frame
      // while the joystick/AI wander holds it) -- animate() shouldn't
      // fight the position, but it can still infer a facing direction
      // from how far it moved since the last tick.
      const dx = s.axie.wrapper.position.x - s.lastPos.x;
      const dz = s.axie.wrapper.position.z - s.lastPos.z;
      faceDirection(s, dx, dz, dt);
      s.lastPos.copy(s.axie.wrapper.position);
      return;
    }
    if (s.targetPos){
      const dx = s.targetPos.x - s.axie.wrapper.position.x;
      const dz = s.targetPos.z - s.axie.wrapper.position.z;
      faceDirection(s, dx, dz, dt);
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
      s.lastPos.copy(s.axie.wrapper.position);
    } else if (s.basePos){
      // Idle "patrol": a small sway around the assigned slot so the board
      // doesn't look frozen when nothing's happening -- purely cosmetic,
      // doesn't touch the HTML overlay (projectLane uses the exact spot).
      const t = elapsedTime + s.phase;
      s.axie.wrapper.position.x = s.basePos.x + Math.sin(t * 0.6) * PATROL_AMPLITUDE;
      s.axie.wrapper.position.z = s.basePos.z + Math.cos(t * 0.5) * PATROL_AMPLITUDE * 0.8;
      // Nothing to chase while idle -- gently settle back to facing the
      // enemy instead of freezing wherever the last real move left it.
      s.axie.wrapper.rotation.y = lerpAngle(s.axie.wrapper.rotation.y, s.baseRotation, Math.min(1, dt * ROTATE_LERP_SPEED * 0.4));
      s.lastPos.copy(s.axie.wrapper.position);
    }
  });
  tickImpacts(dt);
  tickScenery(dt);
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// Short-lived 3D feedback at a lane's current position: an expanding,
// fading ring plus a handful of sparks whose motion/color depend on
// `kind` (see IMPACT_STYLES/spawnImpact below) -- real visual effects for
// hits, glowing heals, defenses activating, poison ticking, bleed
// dripping, instead of just DOM flash/shake/floating text.
function tickImpacts(dt){
  for (let i = impacts.length - 1; i >= 0; i--){
    const im = impacts[i];
    im.age += dt;
    const t = Math.min(1, im.age / im.life);
    im.ring.scale.setScalar(1 + t * 7);
    im.ring.material.opacity = im.ringOpacity * (1 - t);
    im.sparks.forEach(sp => {
      sp.position.addScaledVector(sp.userData.vel, dt);
      sp.userData.vel.y -= dt * sp.userData.gravity;
      sp.material.opacity = 1 - t;
    });
    if (t >= 1){
      scene.remove(im.ring); im.ring.geometry.dispose(); im.ring.material.dispose();
      im.sparks.forEach(sp => { scene.remove(sp); sp.geometry.dispose(); sp.material.dispose(); });
      impacts.splice(i, 1);
    }
  }
}

// One tuning entry per status/effect "flavor" -- color, how many sparks,
// how they move (outward burst vs. rising sparkle vs. bubbling vs.
// dripping), and how long the whole thing lingers. `kind` is picked by
// the caller (see main.js's applyResultFx/applyBleedFx) to match what
// actually just happened: a plain hit, a heal "with a shine" (glowing
// sparkles that rise), a defense card activating (a calm outward glint,
// not a violent burst), poison ticking (slow purple bubbles), or bleed
// (dark red drops that just fall).
const IMPACT_STYLES = {
  hit:    { color: 0xff7a4d, count: 8, life: 0.45, speed: [0.9, 1.8], up: [0, 0.6], gravity: 2.4, spread: 0.6 },
  heal:   { color: 0x9be6a8, count: 9, life: 0.7,  speed: [0.3, 0.7], up: [1.4, 2.0], gravity: 1.1, spread: 0.3 },
  shield: { color: 0x8fd0ff, count: 7, life: 0.55, speed: [0.2, 0.45], up: [0.3, 0.6], gravity: 1.0, spread: 0.25 },
  poison: { color: 0x9b6fd6, count: 9, life: 0.85, speed: [0.15, 0.4], up: [0.5, 1.0], gravity: 0.5, spread: 0.35 },
  bleed:  { color: 0xb8452f, count: 5, life: 0.55, speed: [0.25, 0.55], up: [0.1, 0.25], gravity: 3.2, spread: 0.4 },
};

export function spawnImpact(side, laneIndex, kind = 'hit'){
  if (!scene) return;
  const style = IMPACT_STYLES[kind] || IMPACT_STYLES.hit;
  const s = slots.get(slotKey(side, laneIndex));
  const pos = s ? s.axie.wrapper.position.clone() : laneWorldPos(side, { x: 0, z: 0 });
  pos.y += 0.9;

  const ringGeo = new THREE.RingGeometry(0.06, 0.16, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: style.color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pos);
  ring.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
  scene.add(ring);

  const sparks = [];
  for (let i = 0; i < style.count; i++){
    const sparkMat = new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 1, depthWrite: false });
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), sparkMat);
    spark.position.copy(pos);
    const angle = Math.random() * Math.PI * 2;
    const speed = style.speed[0] + Math.random() * (style.speed[1] - style.speed[0]);
    const upBias = style.up[0] + Math.random() * style.up[1];
    spark.userData.vel = new THREE.Vector3(Math.cos(angle) * speed, upBias, Math.sin(angle) * speed * style.spread);
    spark.userData.gravity = style.gravity;
    scene.add(spark);
    sparks.push(spark);
  }

  impacts.push({ ring, sparks, age: 0, life: style.life, ringOpacity: 0.95 });
}

// Formation slots, col 0..2: the Tank always starts at 0 (center); 1/2
// flank it left/right at the front line. These mirror game.js's
// FORMATION_XZ exactly -- keep both in sync if you tune one. Local {x,z}
// offsets are in the side's own facing space -- laneWorldPos flips z for
// the far side so both formations face each other. The Tank roams this
// same local space freely (see game.js moveSquadWithTank) and the other
// 2 lanes escort it, keeping this same offset relative to wherever it
// currently stands, instead of a fixed slot lookup.
const FORMATION = [
  { x: 0,     z: 0 },     // 0: center (Tank's default)
  { x: -1.05, z: 0.65 },  // 1: left
  { x: 1.05,  z: 0.65 },  // 2: right
];
const ROW_Z = { you: 1.5, rival: -1.5 };

function laneWorldPos(side, localXZ){
  const faceSign = side === 'you' ? -1 : 1; // "forward" (+z offset) means toward the enemy
  return new THREE.Vector3(localXZ.x, 0, ROW_Z[side] + faceSign * localXZ.z);
}

// A pulsing ring under each Tank's default slot showing its taunt radius
// (see game.js TAUNT_RADIUS/getLegalTargets) -- the only floor marking
// left under the formation now that the Lunacia hall's own floor (see
// buildHall) grounds the whole board; the old per-slot square/diamond
// tiles were dropped for being visual clutter on top of it.
function buildTauntRings(){
  const ringGeo = new THREE.RingGeometry(1.35, 1.5, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
  ['you','rival'].forEach(side => {
    const pos = laneWorldPos(side, FORMATION[0]);
    const ring = new THREE.Mesh(ringGeo, ringMat.clone());
    ring.position.set(pos.x, -0.03, pos.z);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
  });
}

// The Lunacia snowfield: a wide snowy clearing under a twilight sky, with
// the Lunacia sigil carved glowing into the snow between the two squads,
// frosted pillars and pines on the far arc as a backdrop, and snow
// drifting down the whole time. Everything that could block the view
// (pillars, trees, drifts) stays on the far arc or well out on the flanks
// -- nothing stands between the camera and the fight.
const SNOW_RADIUS = 30;
const COLUMN_RADIUS = 8.5;
const COLUMN_COUNT = 16;
const COLUMN_MAX_SIN = -0.35; // far arc only
const SIGIL_RADIUS = 2.8;
const SNOWFLAKE_COUNT = 700;
const SNOW_BOX = { x: 13, yTop: 9, zMin: -13, zMax: 9 };

let sigilGlow = null;
let sigilRing = null;
let sigilLight = null;
let snowPoints = null;
let snowDrift = null;

function buildHall(){
  scene.background = buildSkyTexture();
  scene.fog = new THREE.Fog(0xb9d3ea, 15, 34);

  const floorGeo = new THREE.CircleGeometry(SNOW_RADIUS, 64);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: buildSnowTexture(), roughness: 0.95, metalness: 0,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.1;
  scene.add(floor);

  buildSigil();
  buildIcePillars();
  buildPines();
  buildDrifts();
  buildSnowfall();
}

function buildSigil(){
  const tex = buildLunaciaSigilTexture();
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(SIGIL_RADIUS, 64),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.085;
  scene.add(base);

  // Additive copy on top that pulses -- the sigil "breathes" light.
  sigilGlow = new THREE.Mesh(
    new THREE.CircleGeometry(SIGIL_RADIUS * 1.04, 64),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 0.5,
      blending: THREE.AdditiveBlending,
    }),
  );
  sigilGlow.rotation.x = -Math.PI / 2;
  sigilGlow.position.y = -0.08;
  scene.add(sigilGlow);

  // Outer rune ring turning slowly around the sigil.
  sigilRing = new THREE.Mesh(
    new THREE.RingGeometry(SIGIL_RADIUS * 1.08, SIGIL_RADIUS * 1.16, 96, 1),
    new THREE.MeshBasicMaterial({
      map: buildRuneRingTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
  );
  sigilRing.rotation.x = -Math.PI / 2;
  sigilRing.position.y = -0.075;
  scene.add(sigilRing);

  sigilLight = new THREE.PointLight(0x6fc3ff, 2, 7, 1.6);
  sigilLight.position.set(0, 0.6, 0);
  scene.add(sigilLight);
}

function buildIcePillars(){
  const colHeight = 4.8;
  const colGeo = new THREE.CylinderGeometry(0.3, 0.38, colHeight, 12);
  const capGeo = new THREE.CylinderGeometry(0.58, 0.46, 0.32, 12);
  const snowCapGeo = new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const colMat = new THREE.MeshStandardMaterial({
    color: 0x9fd4f5, roughness: 0.25, metalness: 0.1,
    emissive: 0x2a7fc0, emissiveIntensity: 0.35, transparent: true, opacity: 0.92,
  });
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xffcf5c, roughness: 0.35, metalness: 0.45,
    emissive: 0xffb830, emissiveIntensity: 0.45,
  });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  for (let i = 0; i < COLUMN_COUNT; i++){
    const angle = (i / COLUMN_COUNT) * Math.PI * 2;
    if (Math.sin(angle) > COLUMN_MAX_SIN) continue;
    const x = Math.cos(angle) * COLUMN_RADIUS, z = Math.sin(angle) * COLUMN_RADIUS;
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.set(x, colHeight / 2, z);
    scene.add(col);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(x, colHeight + 0.15, z);
    scene.add(cap);
    const snowCap = new THREE.Mesh(snowCapGeo, snowMat);
    snowCap.scale.set(1, 0.45, 1);
    snowCap.position.set(x, colHeight + 0.3, z);
    scene.add(snowCap);
    const base = new THREE.Mesh(capGeo, capMat);
    base.position.set(x, -0.03, z);
    scene.add(base);
  }
}

// Snow-dusted pines: only behind the pillars and far out on the flanks.
function buildPines(){
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3b24, roughness: 0.9 });
  const leafMats = [0x1f6b4a, 0x2a7d52, 0x185c44].map(c =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf6fbff, roughness: 1 });
  const spots = [];
  for (let i = 0; i < 14; i++){
    const a = Math.PI * (1.08 + (i / 13) * 0.84); // back arc
    const r = 11 + (i % 3) * 1.4;
    spots.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (const side of [-1, 1]){
    for (let i = 0; i < 4; i++) spots.push([side * (10.5 + (i % 2) * 1.6), -4 + i * 1.7]);
  }
  spots.forEach(([x, z], i) => {
    const s = 0.8 + ((i * 37) % 10) / 16;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 8), trunkMat);
    trunk.position.y = 0.3;
    tree.add(trunk);
    for (let k = 0; k < 3; k++){
      const rad = 1.0 - k * 0.25, h = 1.2 - k * 0.2, y = 0.8 + k * 0.62;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 10), leafMats[(i + k) % 3]);
      leaf.position.y = y;
      tree.add(leaf);
      const snow = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.55, h * 0.4, 10), snowMat);
      snow.position.y = y + h * 0.32;
      tree.add(snow);
    }
    tree.position.set(x, -0.1, z);
    tree.scale.setScalar(s);
    scene.add(tree);
  });
}

function buildDrifts(){
  const mat = new THREE.MeshStandardMaterial({ color: 0xf4f9ff, roughness: 1 });
  const geo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const drifts = [[-7.5, -6, 1.2], [7, -6.5, 1.0], [-11.5, -1, 1.0], [11.5, -2.5, 1.1], [-4, -10, 1.4], [3.5, -10.5, 1.1]];
  drifts.forEach(([x, z, r]) => {
    const d = new THREE.Mesh(geo, mat);
    d.scale.set(r * 1.3, r * 0.25, r);
    d.position.set(x, -0.1, z);
    scene.add(d);
  });
}

function buildSnowfall(){
  const pos = new Float32Array(SNOWFLAKE_COUNT * 3);
  snowDrift = new Float32Array(SNOWFLAKE_COUNT);
  for (let i = 0; i < SNOWFLAKE_COUNT; i++){
    pos[i * 3] = (Math.random() * 2 - 1) * SNOW_BOX.x;
    pos[i * 3 + 1] = Math.random() * SNOW_BOX.yTop;
    pos[i * 3 + 2] = SNOW_BOX.zMin + Math.random() * (SNOW_BOX.zMax - SNOW_BOX.zMin);
    snowDrift[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.24, map: buildFlakeTexture(), transparent: true, depthWrite: false,
    color: 0xffffff, opacity: 0.9,
  });
  snowPoints = new THREE.Points(geo, mat);
  scene.add(snowPoints);
}

function tickScenery(dt){
  if (snowPoints){
    const attr = snowPoints.geometry.getAttribute('position');
    const arr = attr.array;
    for (let i = 0; i < SNOWFLAKE_COUNT; i++){
      const iy = i * 3 + 1;
      arr[iy] -= dt * (0.6 + (i % 5) * 0.12);
      arr[i * 3] += Math.sin(elapsedTime * 0.8 + snowDrift[i]) * dt * 0.25;
      if (arr[iy] < -0.1){
        arr[iy] = SNOW_BOX.yTop;
        arr[i * 3] = (Math.random() * 2 - 1) * SNOW_BOX.x;
      }
    }
    attr.needsUpdate = true;
  }
  const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 1.6);
  if (sigilGlow) sigilGlow.material.opacity = 0.08 + pulse * 0.22;
  if (sigilRing) sigilRing.rotation.z += dt * 0.15;
  if (sigilLight) sigilLight.intensity = 1.2 + pulse * 1.6;
}

function makeCanvas(w, h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTex(c){
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Twilight: deep violet overhead fading to a warm pink/peach glow at the
// horizon, where the fog's pale blue takes over.
function buildSkyTexture(){
  const [c, ctx] = makeCanvas(4, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2b2466');
  g.addColorStop(0.45, '#6b5aa8');
  g.addColorStop(0.75, '#e7a6c0');
  g.addColorStop(1, '#b9d3ea');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return canvasTex(c);
}

// Soft blue shading and sparkle specks so the snow reads as snow, not a
// flat white disc.
function buildSnowTexture(){
  const size = 512;
  const [c, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#eef5fc';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++){
    const x = Math.random() * size, y = Math.random() * size, r = 20 + Math.random() * 70;
    // Drawn at every wrapped offset so the texture tiles without seams.
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]){
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, 'rgba(160,195,230,0.22)');
      g.addColorStop(1, 'rgba(160,195,230,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 900; i++){
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(190,225,255,0.8)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }
  const tex = canvasTex(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

function buildFlakeTexture(){
  const [c, ctx] = makeCanvas(32, 32);
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return canvasTex(c);
}

// Draws a stylized Lunacia sigil (rune circle, crescent moon, orbiting
// land-plot dots) onto a canvas at runtime -- there's no illustrated
// emblem asset in this prototype, so it's generated instead. Colored to
// glow against snow: icy cyan runes, a gold crescent, violet/pink plots.
function buildLunaciaSigilTexture(){
  const size = 1024;
  const [c, ctx] = makeCanvas(size, size);
  const cx = size / 2, cy = size / 2;

  const halo = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.5);
  halo.addColorStop(0, 'rgba(111,195,255,0.18)');
  halo.addColorStop(0.7, 'rgba(111,195,255,0.12)');
  halo.addColorStop(1, 'rgba(111,195,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#2f9bff';
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.4, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 6;
  for (let i = 0; i < 24; i++){
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * size * 0.4, cy + Math.sin(a) * size * 0.4);
    ctx.lineTo(cx + Math.cos(a) * size * 0.46, cy + Math.sin(a) * size * 0.46);
    ctx.stroke();
  }

  // Four-point star behind the moon.
  ctx.fillStyle = 'rgba(159,122,234,0.55)';
  ctx.beginPath();
  for (let i = 0; i < 8; i++){
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? size * 0.34 : size * 0.1;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Crescent: gold disc with an offset cut-out.
  ctx.fillStyle = '#ffc233';
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(cx + size * 0.09, cy - size * 0.02, size * 0.19, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const plotColors = ['#ff7eb6', '#9f7aea', '#6fe3ff', '#ffd23f', '#7ee08a', '#ff9f5a'];
  for (let i = 0; i < 6; i++){
    const a = (i / 6) * Math.PI * 2 + 0.3;
    ctx.fillStyle = plotColors[i];
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * size * 0.33, cy + Math.sin(a) * size * 0.33, size * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTex(c);
}

function buildRuneRingTexture(){
  const [c, ctx] = makeCanvas(512, 32);
  ctx.fillStyle = 'rgba(111,195,255,0.15)';
  ctx.fillRect(0, 0, 512, 32);
  for (let i = 0; i < 32; i++){
    ctx.fillStyle = i % 2 ? 'rgba(255,194,51,0.9)' : 'rgba(111,195,255,0.95)';
    ctx.fillRect(i * 16 + 4, 10, 8, 12);
  }
  return canvasTex(c);
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
    const baseRotation = side === 'you' ? Math.PI : 0;
    axie.wrapper.position.copy(spawnPos);
    axie.wrapper.scale.setScalar(0.62);
    axie.wrapper.rotation.y = baseRotation;
    axie.wrapper.visible = lane.alive;
    scene.add(axie.wrapper);
    trySetLocomotion(axie, walking ? 'walk' : 'idle');
    slots.set(slotKey(side, i), {
      axie, side, laneIndex: i, targetPos: walking ? basePos.clone() : null, live: false,
      basePos: spawnPos.clone(), phase: Math.random() * Math.PI * 2, introWalk: walking,
      baseRotation, lastPos: spawnPos.clone(),
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
