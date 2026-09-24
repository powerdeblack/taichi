// Live 3D battle board: every alive Axie on both squads (up to 10) rendered
// as a real 3D model via the Axie Mixer 3D toolkit, sharing ONE renderer/
// scene/camera instead of one WebGL context per Axie (heavy on mobile).
// HP/name/status stay plain HTML, positioned over each model by projecting
// its world position through the camera -- same technique games like
// Apeiron use for floating unit UI over a 3D battlefield.
import * as THREE from 'three';
import { createAxieMixer3D } from '@jaatster/threejs-axie-mixer3d-public';
import { ROW_Z, TAUNT_RADIUS } from './game.js';
import * as cine from './cinematics.js';
import { buildDescriptor, equipSetWeapon, weaponPrefix, playClip, renderPortrait } from './axieLook.js';

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
    // A failed download (flaky mobile data) is retried on the next match
    // instead of leaving the board without models for the whole session.
    mixerPromise.catch(() => { mixerPromise = null; });
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
  if (renderer) return ensureMixer(); // already initialized once
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
  // Screen-space layer for the cinematic flash / letterbox bars, above the
  // canvas and the name/HP tags but under the HUD.
  const cineOverlay = document.createElement('div');
  cineOverlay.className = 'cine-overlay';
  canvas.parentElement?.appendChild(cineOverlay);
  loadPill = document.createElement('div');
  loadPill.className = 'load-pill';
  canvas.parentElement?.appendChild(loadPill);
  cine.initCinematics({
    scene, camera, overlay: cineOverlay,
    lanePos: (side, i) => slotWorld(side, i),
    cameraBase: { pos: camera.position.clone(), target: new THREE.Vector3(0, 0, 0.2), fov: camera.fov },
  });
  buildHall();
  buildTauntRings();
  resizeBoard3D();
  window.addEventListener('resize', resizeBoard3D);
  // The board's size follows the page layout (full-screen duel, rotation),
  // not just the window -- keep the render size in step with the canvas.
  if (window.ResizeObserver) new ResizeObserver(resizeBoard3D).observe(canvas);
  if (!loopStarted){
    loopStarted = true;
    requestAnimationFrame(animate);
  }
  return ensureMixer();
}

function animate(){
  requestAnimationFrame(animate);
  // Real frame time drives the slow-motion clock; everything visual runs
  // on the scaled time so a KO slow-mo / hit-stop freezes the whole scene.
  const realDt = clock ? Math.min(0.05, clock.getDelta()) : 0;
  cine.tickTime(realDt);
  const dt = realDt * cine.getTimeScale();
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
      stepGait(s, dt > 0 ? Math.hypot(dx, dz) / dt : 0, dt);
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
  tickDeaths();
  tickImpacts(dt);
  tickCasts(dt);
  tickScenery(dt);
  tickSquash(dt);
  if (scene) cine.tickCinematics(dt, realDt);
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// The toolkit's walk/run cycles (with the weapon's own stance) while a
// squad is actually moving, idle once it stops -- smoothed so a one-frame
// stall doesn't flicker the gait.
function stepGait(s, speed, dt){
  s.gaitSpeed = (s.gaitSpeed || 0) + (speed - (s.gaitSpeed || 0)) * Math.min(1, dt * 8);
  const want = s.gaitSpeed > 1.6 ? 'run' : s.gaitSpeed > 0.25 ? 'walk' : 'idle';
  if (want !== s.gait){ s.gait = want; trySetLocomotion(s.axie, want); }
}

// ================= Toolkit character animations =================
// Card casts, hits, knockouts and the victory pose use the Axie Mixer 3D
// clips: each set's weapon has its own Attack and Skill swing (Sword.Attack,
// Bow.Skill...), plus the shared Action.IdleGetHit, Default.Stun and
// Default.Dead. They play over movement, so a squad keeps walking while
// it strikes.
export function playLaneAction(side, laneIndex, action){
  const s = slots.get(slotKey(side, laneIndex));
  if (!s || s.dying) return;
  const w = s.weapon;
  switch (action){
    case 'attack': playClip(s.axie, w ? `${w}.Attack` : 'Action.AttackHead') || playClip(s.axie, 'Action.AttackRange'); break;
    case 'skill': playClip(s.axie, w ? `${w}.Skill` : 'Action.AttackCombo', { timeScale: w && SLOW_SKILLS.has(w) ? 1.6 : 1 }); break;
    case 'hit': playClip(s.axie, 'Action.IdleGetHit'); break;
    case 'stun': playClip(s.axie, 'Default.Stun'); break;
    case 'victory': playClip(s.axie, w ? `${w}.Skill` : 'Action.AttackCombo'); break;
  }
}
// Long skill clips (the Staff's is ~3s) are sped up to fit a cast.
const SLOW_SKILLS = new Set(['Staff', 'Tome', 'Bow']);

// A knockout plays the toolkit's death clip, then the model fades out of
// the scene instead of vanishing on the spot.
const DEATH_HIDE_AFTER = 1.4;
function tickDeaths(){
  slots.forEach(s => {
    if (s.dying && elapsedTime - s.diedAt > DEATH_HIDE_AFTER){ s.axie.wrapper.visible = false; s.dying = false; }
  });
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
  frost:  { color: 0x5fb4ff, count: 8, life: 0.8,  speed: [0.6, 1.2], up: [-0.2, 0.3], gravity: 0.6, spread: 0.9 },
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

// ================= Card casts =================
// A card goes off in three beats, driven by main.js's cast timeline:
//  1. charge -- a spinning rune ring on the snow, a light column and an orb
//     gathering over the caster, with motes spiraling into it;
//  2. flight -- the orb arcs to its target (homing on the target's live
//     position; a miss veers off to the side), motes trailing behind;
//  3. aftermath -- a slow shockwave rolls out under the target while the
//     cast lock runs out.
// Self-targeted cards skip the flight and just keep charging until impact.
const casts = new Map();
const AFTERMATH_TIME = 1.8;
const ARROW_UP = new THREE.Vector3(0, 1, 0);

// Normal (not additive) blending: additive glow washes out to white
// against the bright snow, solid color reads.
function castMaterial(color, opacity){
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
  });
}

function slotWorld(side, laneIndex){
  const s = slots.get(slotKey(side, laneIndex));
  return s ? s.axie.wrapper.position : null;
}

export function startCastFX(id, side, laneIndex, color, chargeTime){
  if (!scene) return;
  const c = new THREE.Color(color);
  const deep = c.clone().multiplyScalar(0.75);
  const core = c.clone().lerp(new THREE.Color(0xffffff), 0.55);
  const rune = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.58, 6, 1), castMaterial(deep, 0));
  rune.rotation.x = -Math.PI / 2;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 1.8, 24, 1, true), castMaterial(c, 0));
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), castMaterial(core, 1));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), castMaterial(c, 0.55));
  const motes = [];
  for (let i = 0; i < 10; i++){
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), castMaterial(deep, 0.95));
    m.userData.angle = (i / 10) * Math.PI * 2;
    m.userData.lift = Math.random();
    motes.push(m);
  }
  [rune, column, orb, halo, ...motes].forEach(o => { o.renderOrder = 6; scene.add(o); });
  casts.set(id, { side, laneIndex, age: 0, chargeTime, phase: 'charge', rune, column, orb, halo, motes, proj: null });
}

// `style` shapes the projectile after the card's set: 'arrow' (Ranger) is
// a real arrow on a flat, fast arc that points where it flies; 'blade'
// (Warrior/Rogue) is a spinning crescent thrown low; 'orb' (magic sets)
// keeps the glowing orb on a high lob.
export function launchCastFX(id, toSide, toIndex, duration, miss, style = 'orb'){
  const cast = casts.get(id);
  if (!cast) return;
  const side = new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * 1.1, 0, 0.4);
  cast.proj = {
    toSide, toIndex, dur: duration, t: 0, from: cast.orb.position.clone(), miss, style,
    offset: miss ? side : new THREE.Vector3(), arc: style === 'arrow' ? 0.7 : style === 'blade' ? 0.45 : 1.3,
  };
  if (style !== 'orb'){
    const color = cast.halo.material.color.clone();
    cast.shape = style === 'arrow' ? buildArrow(color) : buildBlade(color);
    cast.shape.position.copy(cast.orb.position);
    cast.shape.renderOrder = 7;
    scene.add(cast.shape);
    cast.orb.visible = false;
    cast.halo.material.opacity = 0.3;
  }
  cast.phase = 'fly';
}

function buildArrow(color){
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), castMaterial(0x6b4a2b, 1));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 8), castMaterial(0xe8eef5, 1));
  tip.position.y = 0.55;
  const fletch = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.24), castMaterial(color, 1));
  fletch.position.y = -0.38;
  const fletch2 = fletch.clone(); fletch2.material = fletch.material.clone(); fletch2.rotation.y = Math.PI / 2;
  g.add(shaft, tip, fletch, fletch2);
  return g;
}

function buildBlade(color){
  const g = new THREE.Group();
  const edge = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.42, 24, 1, 0, Math.PI * 1.3), castMaterial(0xf4f7fb, 1));
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.48, 24, 1, 0, Math.PI * 1.3), castMaterial(color, 0.55));
  [edge, glow].forEach(m => { m.rotation.x = -Math.PI / 2; g.add(m); });
  return g;
}

// A quick squash-and-stretch on a struck Axie's model (base scale 0.62).
const squashes = new Map();
export function hitSquash(side, laneIndex, strength = 1){
  const s = slots.get(slotKey(side, laneIndex));
  if (s) squashes.set(s, { t: 0, strength });
}
function tickSquash(dt){
  squashes.forEach((q, s) => {
    q.t += dt;
    const k = Math.min(1, q.t / 0.4);
    const wob = Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.22 * q.strength;
    s.axie.wrapper.scale.set(0.62 * (1 + wob * 0.6), 0.62 * (1 - wob), 0.62 * (1 + wob * 0.6));
    if (k >= 1){ s.axie.wrapper.scale.setScalar(0.62); squashes.delete(s); }
  });
}

// Impact: drops the orb/column/motes and turns the rune into the slow
// aftermath shockwave at the target (or where the missed shot landed).
export function landCastFX(id){
  const cast = casts.get(id);
  if (!cast) return;
  const at = cast.orb.position.clone();
  [cast.column, cast.orb, cast.halo, ...cast.motes].forEach(o => { scene.remove(o); o.geometry.dispose(); o.material.dispose(); });
  if (cast.shape){ disposeGroup(cast.shape); cast.shape = null; }
  cast.column = cast.orb = cast.halo = null;
  cast.motes = [];
  cast.rune.position.set(at.x, -0.04, at.z);
  cast.phase = 'aftermath';
  cast.age = 0;
}

function disposeGroup(g){
  scene.remove(g);
  g.traverse(n => { n.geometry?.dispose(); n.material?.dispose(); });
}

function disposeCast(cast){
  if (cast.shape) disposeGroup(cast.shape);
  [cast.rune, cast.column, cast.orb, cast.halo, ...cast.motes].forEach(o => {
    if (!o) return;
    scene.remove(o); o.geometry.dispose(); o.material.dispose();
  });
}

export function clearCastsFX(){
  casts.forEach(disposeCast);
  casts.clear();
}

function tickCasts(dt){
  casts.forEach((cast, id) => {
    cast.age += dt;
    if (cast.phase === 'aftermath'){
      const t = Math.min(1, cast.age / AFTERMATH_TIME);
      cast.rune.scale.setScalar(1 + t * 2);
      cast.rune.rotation.z += dt * 0.8;
      cast.rune.material.opacity = 0.85 * (1 - t);
      if (t >= 1){ disposeCast(cast); casts.delete(id); }
      return;
    }
    const caster = slotWorld(cast.side, cast.laneIndex);
    const pulse = 0.5 + 0.5 * Math.sin(cast.age * 9);

    if (cast.phase === 'charge'){
      const k = Math.min(1, cast.age / cast.chargeTime);
      if (caster){
        cast.rune.position.set(caster.x, -0.04, caster.z);
        cast.column.position.set(caster.x, 0.9, caster.z);
        cast.orb.position.set(caster.x, 1.45 + Math.sin(cast.age * 3) * 0.06, caster.z);
      }
      cast.rune.rotation.z += dt * (1.5 + k * 5);
      cast.rune.scale.setScalar(1 + k * 1.1);
      cast.rune.material.opacity = 0.45 + 0.5 * k;
      cast.column.material.opacity = (0.1 + 0.25 * k) * (0.7 + 0.3 * pulse);
      cast.column.scale.set(1 - k * 0.35, 0.6 + k * 0.4, 1 - k * 0.35);
      cast.orb.scale.setScalar(0.4 + k * 1.1);
      cast.halo.position.copy(cast.orb.position);
      cast.halo.scale.setScalar((0.6 + k * 1.4) * (0.9 + 0.2 * pulse));
      cast.motes.forEach(m => {
        m.userData.angle += dt * (3 + k * 5);
        const r = 0.75 * (1 - k) + 0.2;
        m.position.set(
          cast.orb.position.x + Math.cos(m.userData.angle) * r,
          cast.orb.position.y - 0.9 * (1 - k) * (1 - m.userData.lift) + Math.sin(m.userData.angle * 2) * 0.05,
          cast.orb.position.z + Math.sin(m.userData.angle) * r,
        );
      });
      return;
    }

    // flight
    const p = cast.proj;
    p.t += dt;
    const t = Math.min(1, p.t / p.dur);
    const ease = t * t * (3 - 2 * t);
    const target = slotWorld(p.toSide, p.toIndex);
    const to = target ? target.clone() : p.from.clone();
    to.y = 0.9;
    to.add(p.offset);
    const pos = p.from.clone().lerp(to, ease);
    pos.y += Math.sin(Math.PI * t) * p.arc;
    const prev = cast.orb.position.clone();
    cast.orb.position.copy(pos);
    if (cast.shape){
      cast.shape.position.copy(pos);
      if (p.style === 'arrow'){
        const v = pos.clone().sub(prev);
        if (v.lengthSq() > 1e-8) cast.shape.quaternion.setFromUnitVectors(ARROW_UP, v.normalize());
      } else {
        cast.shape.rotation.y += dt * 22;
      }
    }
    cast.halo.position.copy(pos);
    cast.halo.scale.setScalar(p.style === 'orb' ? 1.6 + 0.4 * pulse : 0.9 + 0.2 * pulse);
    cast.column.material.opacity *= 0.9;
    cast.rune.material.opacity *= 0.93;
    let lead = prev;
    cast.motes.forEach((m, i) => {
      m.position.lerp(lead, Math.min(1, dt * 14));
      m.material.opacity = 0.85 * (1 - i / cast.motes.length);
      lead = m.position;
    });
  });
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

function laneWorldPos(side, localXZ){
  const faceSign = side === 'you' ? -1 : 1; // "forward" (+z offset) means toward the enemy
  return new THREE.Vector3(localXZ.x, 0, ROW_Z[side] + faceSign * localXZ.z);
}

// A ring under each Tank showing its taunt radius (game.js TAUNT_RADIUS),
// kept under the Tank's live position by setTauntRing.
const tauntRings = {};
function buildTauntRings(){
  const ringGeo = new THREE.RingGeometry(TAUNT_RADIUS - 0.08, TAUNT_RADIUS, 48);
  ['you','rival'].forEach(side => {
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: side === 'you' ? 0xffd23f : 0xff7a5a, transparent: true, opacity: 0.45,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, -0.06, ROW_Z[side]);
    scene.add(ring);
    tauntRings[side] = ring;
  });
}

export function setTauntRing(side, localXZ, visible){
  const ring = tauntRings[side];
  if (!ring) return;
  ring.visible = visible;
  if (!visible) return;
  const p = laneWorldPos(side, localXZ);
  ring.position.x = p.x;
  ring.position.z = p.z;
}

// Shown while a card is held: a disc + edge ring of the card's reach around
// the caster, and a line to whoever it would hit. Green = the aimed enemy
// is inside the reach, red = it's outside (releasing now misses), gold =
// support card (no range limit, just shows who it lands on).
const AIM_COLORS = { ok: 0x5fe07a, out: 0xff4f4f, support: 0xffd23f };
let aim = null;
function ensureAim(){
  if (aim) return aim;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(0.965, 1, 96),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  edge.rotation.x = -Math.PI / 2;
  // A flat ribbon on the snow (WebGL lines are always 1px -- too thin to read).
  const ribbon = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  );
  ribbon.rotation.x = -Math.PI / 2;
  const line = new THREE.Group();
  line.add(ribbon);
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.42, 32),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  marker.rotation.x = -Math.PI / 2;
  [disc, edge, line, marker].forEach(o => { o.renderOrder = 5; scene.add(o); });
  aim = { disc, edge, line, marker };
  hideAim();
  return aim;
}

export function showAim({ side, casterXZ, radius, state, targetSide, targetXZ }){
  if (!scene) return;
  const a = ensureAim();
  const color = AIM_COLORS[state] ?? AIM_COLORS.support;
  const c = laneWorldPos(side, casterXZ);
  const hasRing = radius != null;
  a.disc.visible = a.edge.visible = hasRing;
  if (hasRing){
    [a.disc, a.edge].forEach(o => {
      o.position.set(c.x, -0.05, c.z);
      o.scale.setScalar(radius);
      o.material.color.setHex(color);
    });
  }
  const hasTarget = targetXZ != null;
  a.line.visible = a.marker.visible = hasTarget;
  if (hasTarget){
    const t = laneWorldPos(targetSide, targetXZ);
    const dx = t.x - c.x, dz = t.z - c.z;
    a.line.position.set((c.x + t.x) / 2, -0.03, (c.z + t.z) / 2);
    a.line.rotation.y = -Math.atan2(dz, dx);
    a.line.scale.set(Math.max(0.01, Math.hypot(dx, dz)), 1, 1);
    a.line.children[0].material.color.setHex(color);
    a.marker.position.set(t.x, -0.04, t.z);
    a.marker.material.color.setHex(color);
  }
}

export function hideAim(){
  if (!aim) return;
  Object.values(aim).forEach(o => { o.visible = false; });
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
let blizzard = false;

// Sudden death look: snow falls hard and sideways, the haze closes in.
export function setBlizzard(on){
  blizzard = on;
  if (scene && scene.fog){ scene.fog.near = on ? 8 : 15; scene.fog.far = on ? 24 : 34; }
  if (snowPoints){ snowPoints.material.size = on ? 0.3 : 0.24; }
}

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
      arr[iy] -= dt * (0.6 + (i % 5) * 0.12) * (blizzard ? 3.2 : 1);
      arr[i * 3] += (Math.sin(elapsedTime * 0.8 + snowDrift[i]) * 0.25 + (blizzard ? 2.4 : 0)) * dt;
      if (arr[i * 3] > SNOW_BOX.x) arr[i * 3] -= SNOW_BOX.x * 2;
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
  const token = ++matchToken;
  clearBoard3D();
  // 1) Right away, a simple marker in the Axie's class colour stands at its
  // real (rules) position. The fight -- aim line, projectiles, card effects
  // -- is anchored to the right spot from the first frame, even while the
  // 3D models are still downloading on a slow phone, or if they never load.
  const lanes = [...youLanes.map((lane, i) => ({ side: 'you', lane, i })), ...rivalLanes.map((lane, i) => ({ side: 'rival', lane, i }))];
  lanes.forEach(({ side, lane, i }) => {
    const basePos = laneWorldPos(side, lane.localPos);
    const introOffset = new THREE.Vector3(0, 0, side === 'you' ? INTRO_SPAWN_OFFSET : -INTRO_SPAWN_OFFSET);
    const spawnPos = basePos.clone().add(introOffset);
    const walking = lane.alive;
    const baseRotation = side === 'you' ? Math.PI : 0;
    const marker = makeMarker(lane.color);
    marker.wrapper.position.copy(spawnPos);
    marker.wrapper.scale.setScalar(0.62);
    marker.wrapper.rotation.y = baseRotation;
    marker.wrapper.visible = lane.alive;
    scene.add(marker.wrapper);
    slots.set(slotKey(side, i), {
      axie: marker, side, laneIndex: i, targetPos: walking ? basePos.clone() : null, live: false,
      basePos: spawnPos.clone(), phase: Math.random() * Math.PI * 2, introWalk: walking,
      baseRotation, lastPos: spawnPos.clone(), weapon: weaponPrefix(lane.setId),
      alive: lane.alive, dying: false, diedAt: 0, gait: null,
    });
  });
  loadStatus = { total: lanes.length, done: 0, failed: 0, error: null };
  renderLoadPill();

  // 2) The real toolkit models load concurrently and each replaces its
  // marker in place (same position, facing and state) as soon as it's ready.
  let mixer;
  try { mixer = await ensureMixer(); }
  catch (err){ loadStatus.failed = lanes.length; loadStatus.error = err?.message || String(err); renderLoadPill(); return; }
  if (token !== matchToken) return;
  await Promise.all(lanes.map(async ({ side, lane, i }) => {
    let axie;
    try {
      axie = await mixer.create({ descriptor: buildDescriptor(lane.classId, { evolved: lane.evolved }), quality: 'balanced', artMode: 'faithful', strict: true });
    } catch (err){
      loadStatus.failed++; loadStatus.error = loadStatus.error || err?.message || String(err);
      console.error('Axie model failed:', lane.classId, err);
      renderLoadPill();
      return;
    }
    const s = slots.get(slotKey(side, i));
    if (token !== matchToken || !s){ axie.dispose(); return; }
    const old = s.axie;
    axie.wrapper.position.copy(old.wrapper.position);
    axie.wrapper.rotation.y = old.wrapper.rotation.y;
    axie.wrapper.scale.setScalar(0.62);
    axie.wrapper.visible = old.wrapper.visible;
    scene.remove(old.wrapper); old.dispose();
    scene.add(axie.wrapper);
    s.axie = axie;
    s.gait = null;
    trySetLocomotion(axie, s.introWalk ? 'walk' : 'idle');
    loadStatus.done++;
    renderLoadPill();
    // The weapon never holds the model back: equip in the background (with
    // a time limit), then take the card portrait with whatever it has.
    await Promise.race([equipSetWeapon(axie, lane.setId, lane.evolved), new Promise(r => setTimeout(r, 6000))]);
    if (token !== matchToken || axie.disposed) return;
    const url = renderPortrait(axie, renderer);
    if (url) portraits.set(slotKey(side, i), url);
  }));
}

// Stand-in body (class-coloured sphere with eyes) used until -- or instead
// of -- the real model. Same interface bits the board calls on a model.
function makeMarker(color){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), new THREE.MeshLambertMaterial({ color: color || '#cccccc' }));
  body.position.y = 0.6; body.scale.set(1, 0.9, 1);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), eyeMat);
  e1.position.set(-0.22, 0.72, 0.52);
  const e2 = e1.clone(); e2.position.x = 0.22;
  g.add(body, e1, e2);
  return {
    wrapper: g, disposed: false, animationNames: [], isMarker: true,
    update(){}, setLocomotion(){}, playAnimation(){ return false; },
    dispose(){ this.disposed = true; body.geometry.dispose(); body.material.dispose(); e1.geometry.dispose(); eyeMat.dispose(); },
  };
}

let matchToken = 0;
let loadStatus = { total: 0, done: 0, failed: 0, error: null };
let loadPill = null;
function renderLoadPill(){
  if (!loadPill) return;
  const { total, done, failed, error } = loadStatus;
  if (failed){
    loadPill.textContent = `⚠️ ${failed} 3D model${failed > 1 ? 's' : ''} couldn't load (${String(error).slice(0, 80)}) — showing coloured markers`;
    loadPill.className = 'load-pill show warn';
  } else if (done < total){
    loadPill.textContent = `Loading 3D Axies ${done}/${total}…`;
    loadPill.className = 'load-pill show';
  } else {
    loadPill.className = 'load-pill';
  }
}

const portraits = new Map();
export function getLanePortrait(side, laneIndex){ return portraits.get(slotKey(side, laneIndex)) || null; }

// Called on every board refresh -- only acts on a change: a fresh knockout
// plays the death clip (see tickDeaths), a revive shows the model again.
export function setLaneAlive(side, laneIndex, alive){
  const s = slots.get(slotKey(side, laneIndex));
  if (!s || s.alive === alive) return;
  s.alive = alive;
  if (!alive){
    if (playClip(s.axie, 'Default.Dead')){ s.dying = true; s.diedAt = elapsedTime; }
    else s.axie.wrapper.visible = false;
  } else {
    s.dying = false;
    s.axie.wrapper.visible = true;
  }
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
  clearCastsFX();
  portraits.clear();
  slots.forEach(s => { scene.remove(s.axie.wrapper); s.axie.dispose(); });
  slots.clear();
}

// Card cinematics (see cinematics.js) -- re-exported so ui.js stays the
// single facade main.js talks to.
export const cinematics = cine;
