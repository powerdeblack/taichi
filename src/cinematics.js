// Cinematic card effects: one short 3D "scene" per card function, played
// at the moment a card lands (see main.js applyResultFx), plus the camera
// work that sells the big moments (shake, zoom punch, focus, hit-stop,
// slow motion) and the screen flash / letterbox bars for knockouts.
// board3d.js owns the scene and camera and feeds this module through
// initCinematics(); every effect here is purely visual.
import * as THREE from 'three';

let ctx = null; // { scene, camera, lanePos(side, i) -> Vector3|null, overlay: HTMLElement }
const active = [];

export function initCinematics(context){ ctx = context; }

// ---------- small helpers ----------

function mat(color, opacity = 1, extra = {}){
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, ...extra,
  });
}

// `anchor` ({ side, i, p }) pins an effect to an Axie: every frame the
// whole effect slides by however far that Axie moved, and `p` (the point
// the effect's update code positions things from) moves with it -- so an
// effect stays on the Axie while squads walk instead of being left behind
// on the floor.
function spawn(update, objects, anchor = null){
  objects.forEach(o => ctx.scene.add(o));
  active.push({ t: 0, update, objects, anchor });
}

function follow(fx){
  const a = fx.anchor;
  const cur = ctx.lanePos(a.side, a.i);
  if (!cur) return;
  const dx = cur.x - a.p.x, dz = cur.z - a.p.z;
  if (!dx && !dz) return;
  fx.objects.forEach(o => { o.position.x += dx; o.position.z += dz; });
  a.p.x += dx; a.p.z += dz;
}

// Shared resources (the soft particle texture, the arrow geometries) are
// reused by every effect and must survive a single effect's cleanup.
function dispose(o){
  o.traverse?.(n => {
    if (n.geometry && !SHARED_GEOS.has(n.geometry)) n.geometry.dispose();
    const m = n.material;
    if (m){ if (m.map && m.map !== softTex) m.map.dispose(); m.dispose?.(); }
  });
  ctx.scene.remove(o);
}
const SHARED_GEOS = new Set();

// dt is the (slow-motion scaled) game time; realDt drives the camera so a
// shake still settles on schedule during a slow-mo moment.
export function tickCinematics(dt, realDt = dt){
  for (let i = active.length - 1; i >= 0; i--){
    const fx = active[i];
    fx.t += dt;
    if (fx.anchor) follow(fx);
    if (fx.update(fx.t, dt) === false){
      fx.objects.forEach(dispose);
      active.splice(i, 1);
    }
  }
  tickCamera(realDt);
}

export function clearCinematics(){
  active.splice(0).forEach(fx => fx.objects.forEach(dispose));
  resetTime();
}

const ease = t => 1 - Math.pow(1 - Math.min(1, t), 3);
const at = (side, i, y = 0) => {
  const p = ctx?.lanePos(side, i);
  return p ? new THREE.Vector3(p.x, y, p.z) : null;
};

function emojiTexture(char, size = 128){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.font = `${size * 0.8}px serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(char, size / 2, size / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- attacks ----------

// A crescent blade stroke across the target, facing the camera.
export function slash(side, i, color = 0xffffff, cross = false){
  const p = at(side, i, 0.9);
  if (!p) return;
  const strokes = (cross ? [0.6, -0.6] : [Math.random() - 0.5]).map((tilt, k) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.2, 40, 1, 0, Math.PI * 1.05), mat(color, 1, { depthTest: false }));
    m.renderOrder = 10;
    m.position.copy(p);
    m.lookAt(ctx.camera.position);
    m.rotateZ(tilt * 1.4 + Math.PI * 0.2 + k * 0.2);
    m.userData.delay = k * 0.08;
    return m;
  });
  const core = strokes.map(s => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.06, 40, 1, 0, Math.PI * 1.05), mat(0xffffff, 1, { depthTest: false }));
    m.renderOrder = 11;
    m.position.copy(s.position); m.quaternion.copy(s.quaternion);
    m.userData.delay = s.userData.delay;
    return m;
  });
  spawn(t => {
    let alive = false;
    [...strokes, ...core].forEach(m => {
      const k = (t - m.userData.delay) / 0.5;
      if (k < 0){ m.visible = false; alive = true; return; }
      m.visible = true;
      m.scale.set(0.4 + ease(k) * 0.9, 0.4 + ease(k) * 0.9, 1);
      m.material.opacity = Math.max(0, 1 - k);
      if (k < 1) alive = true;
    });
    return alive;
  }, [...strokes, ...core], { side, i, p });
}

// Arrows falling from the sky onto the target, one after another, then
// staying stuck in the snow for a moment.
const SKY = new THREE.Vector3(-1.2, 5.5, 1.2);
export function arrowRain(side, i, count = 3, color = 0xd9b44a){
  const p = at(side, i, 0);
  if (!p) return;
  const arrows = [];
  for (let k = 0; k < count; k++){
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.8, 6), mat(0x6b4a2b));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), mat(0xdfe6ee));
    tip.position.y = -0.48; tip.rotation.x = Math.PI;
    const fletch = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.2), mat(color));
    fletch.position.y = 0.36;
    g.add(shaft, tip, fletch);
    const off = new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.35, (Math.random() - 0.5) * 0.7);
    g.userData = { off, delay: k * 0.14, puffed: false };
    g.rotation.z = -0.2; g.rotation.x = 0.2;
    arrows.push(g);
  }
  spawn(t => {
    let alive = false;
    arrows.forEach(a => {
      const u = a.userData;
      const k = (t - u.delay) / 0.32;
      if (k < 0){ a.visible = false; alive = true; return; }
      a.visible = true;
      const land = p.clone().add(u.off);
      a.position.lerpVectors(land.clone().add(SKY), land, Math.min(1, k));
      if (k >= 1 && !u.puffed){ u.puffed = true; puff(land, 0xffffff, 6); }
      const fade = (t - u.delay - 0.32 - 1.0) / 0.4;
      a.children.forEach(c => { c.material.opacity = fade > 0 ? Math.max(0, 1 - fade) : 1; });
      if (fade < 1) alive = true;
    });
    return alive;
  }, arrows, { side, i, p });
}

// A streak of light from the attacker to the target, drawn at impact so
// every hit visibly connects the two Axies. Both ends follow their Axie.
export function strikeTrail(fromSide, fromI, toSide, toI, color = 0xffffff){
  if (!ctx?.lanePos(fromSide, fromI) || !ctx.lanePos(toSide, toI)) return;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8, 1, true), mat(color, 0.95, { depthTest: false }));
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6, 1, true), mat(0xffffff, 1, { depthTest: false }));
  beam.renderOrder = 9; core.renderOrder = 10;
  const UP = new THREE.Vector3(0, 1, 0);
  spawn(t => {
    const a = ctx.lanePos(fromSide, fromI), b = ctx.lanePos(toSide, toI);
    if (!a || !b) return false;
    const from = new THREE.Vector3(a.x, 0.8, a.z), to = new THREE.Vector3(b.x, 0.8, b.z);
    const k = t / 0.45;
    // The streak shoots from the attacker to the target, then thins out.
    const head = from.clone().lerp(to, Math.min(1, ease(k * 2.5)));
    const len = Math.max(0.01, head.distanceTo(from));
    const dir = head.clone().sub(from).normalize();
    [beam, core].forEach(m => {
      m.position.copy(from).lerp(head, 0.5);
      m.quaternion.setFromUnitVectors(UP, dir.lengthSq() ? dir : UP);
      m.scale.set(1 + (1 - k) * 1.5, len, 1 + (1 - k) * 1.5);
    });
    beam.material.opacity = Math.max(0, 0.95 * (1 - k));
    core.material.opacity = Math.max(0, 1 - k);
    return k < 1;
  }, [beam, core]);
}

// A magic blast: a bright sphere that swells and pops, a light column and
// a flat shock ring.
export function arcaneBlast(side, i, color = 0x6fc3ff){
  const p = at(side, i, 0.9);
  if (!p) return;
  const c = new THREE.Color(color);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), mat(c.clone().lerp(new THREE.Color(0xffffff), 0.4), 0.9));
  ball.position.copy(p);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 5, 20, 1, true), mat(c, 0.55));
  pillar.position.set(p.x, 2.5, p.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 48), mat(c, 0.9));
  ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.02, p.z);
  spawn(t => {
    const k = t / 0.7;
    ball.scale.setScalar(0.3 + ease(k) * 1.6);
    ball.material.opacity = Math.max(0, 0.9 * (1 - k));
    pillar.scale.set(1 - k * 0.7, 1, 1 - k * 0.7);
    pillar.material.opacity = Math.max(0, 0.55 * (1 - k));
    ring.scale.setScalar(1 + ease(k) * 1.6);
    ring.material.opacity = Math.max(0, 0.9 * (1 - k));
    return k < 1;
  }, [ball, pillar, ring], { side, i, p });
}

// Heavy-hit shockwave on the snow plus flying debris.
export function shockwave(side, i, color = 0xffd23f, strength = 1){
  const p = at(side, i, 0.03);
  if (!p) return;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 48), mat(color, 0.95));
  ring.rotation.x = -Math.PI / 2; ring.position.copy(p);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), mat(0xffffff, 0.6));
  inner.rotation.x = -Math.PI / 2; inner.position.copy(p).add(new THREE.Vector3(0, 0.01, 0));
  const debris = [];
  for (let k = 0; k < 10 + strength * 6; k++){
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat(k % 3 ? 0xf2f7fc : 0x9ab8d6));
    d.position.copy(p).add(new THREE.Vector3(0, 0.1, 0));
    const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 1.1 * strength;
    d.userData.v = new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 2.5, Math.sin(a) * sp);
    debris.push(d);
  }
  spawn((t, dt) => {
    const k = t / 0.9;
    ring.scale.setScalar(1 + ease(k) * 2.2 * strength);
    ring.material.opacity = Math.max(0, 0.95 * (1 - k));
    inner.scale.setScalar(1 + ease(k * 2) * 2);
    inner.material.opacity = Math.max(0, 0.6 * (1 - k * 2));
    debris.forEach(d => {
      d.userData.v.y -= 9 * dt;
      d.position.addScaledVector(d.userData.v, dt);
      if (d.position.y < 0.03){ d.position.y = 0.03; d.userData.v.multiplyScalar(0.3); }
      d.rotation.x += dt * 8; d.rotation.y += dt * 6;
      d.material.opacity = Math.max(0, 1 - k);
    });
    return k < 1;
  }, [ring, inner, ...debris], { side, i, p });
}

function puff(pos, color, n){
  const bits = [];
  for (let k = 0; k < n; k++){
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), mat(color, 0.9));
    b.position.copy(pos);
    const a = Math.random() * Math.PI * 2;
    b.userData.v = new THREE.Vector3(Math.cos(a) * 0.8, 0.8 + Math.random(), Math.sin(a) * 0.8);
    bits.push(b);
  }
  spawn((t, dt) => {
    bits.forEach(b => { b.userData.v.y -= 4 * dt; b.position.addScaledVector(b.userData.v, dt); b.material.opacity = Math.max(0, 0.9 - t * 1.8); });
    return t < 0.5;
  }, bits);
}

// Blood splatter decals on the snow around the target.
export function bloodSplash(side, i){
  const p = at(side, i, 0.02);
  if (!p) return;
  const blots = [];
  for (let k = 0; k < 6; k++){
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.08 + Math.random() * 0.14, 12), mat(k % 2 ? 0x8b1a1a : 0xb3261e, 0.95));
    b.rotation.x = -Math.PI / 2;
    b.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 1.1, 0.005 * k, (Math.random() - 0.5) * 0.9));
    b.scale.setScalar(0.01);
    blots.push(b);
  }
  spawn(t => {
    blots.forEach((b, k) => { b.scale.setScalar(Math.max(0.01, Math.min(1, (t - k * 0.04) / 0.15))); b.material.opacity = t > 1.8 ? Math.max(0, 0.95 - (t - 1.8) * 1.5) : 0.95; });
    return t < 2.45;
  }, blots, { side, i, p });
}

// A lingering toxic cloud: puffy green/purple spheres swelling and
// drifting upward.
// A thick toxic cloud (soft smoke billboards swirling slowly), a venom pool
// on the snow, glowing bubbles rising and popping -- it hangs over the
// Axie for a few seconds.
export function poisonCloud(side, i){
  const p = at(side, i, 0.55);
  if (!p) return;
  const DUR = 3;
  const clouds = [];
  for (let k = 0; k < 16; k++){
    const col = [0x4fae2e, 0x6fd048, 0x2f6e1f, 0x7a4fb0][k % 4];
    const s = smoke(col, 0.9, k % 4 === 3 ? 0.35 : 0.55);
    s.userData = { a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.6, y: Math.random() * 0.9 - 0.2, sp: (Math.random() - 0.5) * 0.8, size: 0.8 + Math.random() * 0.7, spin: (Math.random() - 0.5) * 0.8, base: s.userData.base };
    clouds.push(s);
  }
  const bubbles = [];
  for (let k = 0; k < 10; k++){
    const b = glow(0xb8ff7a, 0.12, 1);
    b.userData = { t0: Math.random() * (DUR - 0.8), x: (Math.random() - 0.5) * 1.1, z: (Math.random() - 0.5) * 0.9, base: 1 };
    b.visible = false;
    bubbles.push(b);
  }
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.95, 36), mat(0x3f9a24, 0.55));
  pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, 0.015, p.z); pool.scale.setScalar(0.01);
  const sheen = glow(0x7dff4a, 2.6, 0.35);
  sheen.position.copy(p);
  spawn((t, dt) => {
    const grow = ease(t / 0.5);
    const fade = t > DUR - 0.8 ? Math.max(0, (DUR - t) / 0.8) : 1;
    clouds.forEach(s => {
      const u = s.userData;
      u.a += dt * u.sp;
      s.position.set(p.x + Math.cos(u.a) * u.r, p.y + u.y + t * 0.08, p.z + Math.sin(u.a) * u.r * 0.8);
      s.scale.setScalar(u.size * (0.3 + grow * 0.9));
      s.material.rotation += dt * u.spin;
      s.material.opacity = u.base * fade;
    });
    bubbles.forEach(b => {
      const q = (t - b.userData.t0) / 0.8;
      b.visible = q > 0 && q < 1;
      if (!b.visible) return;
      b.position.set(p.x + b.userData.x, 0.1 + q * 1.3, p.z + b.userData.z);
      b.scale.setScalar(q > 0.85 ? 0.3 : 0.12);
      b.material.opacity = q > 0.85 ? (1 - q) * 6 : 1;
    });
    pool.scale.setScalar(Math.max(0.01, grow));
    pool.material.opacity = 0.55 * fade;
    sheen.material.opacity = 0.35 * fade * (0.8 + 0.2 * Math.sin(t * 6));
    return t < DUR;
  }, [...clouds, ...bubbles, pool, sheen], { side, i, p });
}

// A skull hovering over the marked target, with a spinning purple ring.
export function deathmark(side, i){
  const p = at(side, i, 2.1);
  if (!p) return;
  const skull = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('💀'), transparent: true, depthWrite: false }));
  skull.position.copy(p); skull.scale.setScalar(0.01);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 6), mat(0x9f7aea, 0.9));
  ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.03, p.z);
  spawn((t, dt) => {
    skull.scale.setScalar(Math.min(0.7, ease(t / 0.3) * 0.7) * (1 + 0.06 * Math.sin(t * 10)));
    skull.position.y = p.y + Math.sin(t * 3) * 0.08;
    skull.material.opacity = t > 1.8 ? Math.max(0, 1 - (t - 1.8) * 2.5) : 1;
    ring.rotation.z += dt * 3;
    ring.scale.setScalar(1 + ease(t / 0.4) * 0.6);
    ring.material.opacity = skull.material.opacity * 0.9;
    return t < 2.2;
  }, [skull, ring], { side, i, p });
}

// Dodged: ghostly afterimage rings sliding aside plus speed streaks.
export function afterimage(side, i, color = 0xbfe6ff){
  const p = at(side, i, 0.8);
  if (!p) return;
  const dir = Math.random() < 0.5 ? -1 : 1;
  const ghosts = [0, 1, 2].map(k => {
    const g = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), mat(color, 0.45 - k * 0.12));
    g.position.copy(p); g.lookAt(ctx.camera.position); g.userData.k = k;
    return g;
  });
  const streaks = [0, 1, 2, 3].map(k => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.035), mat(0xffffff, 0.8));
    s.position.copy(p).add(new THREE.Vector3(0, -0.3 + k * 0.2, 0)); s.lookAt(ctx.camera.position);
    return s;
  });
  spawn(t => {
    const k = t / 0.5;
    ghosts.forEach(g => { g.position.x = p.x + dir * (0.25 + g.userData.k * 0.25) * ease(k); g.material.opacity = Math.max(0, (0.45 - g.userData.k * 0.12) * (1 - k)); });
    streaks.forEach((s, n) => { s.position.x = p.x - dir * ease(k) * (0.6 + n * 0.1); s.material.opacity = Math.max(0, 0.8 * (1 - k)); });
    return k < 1;
  }, [...ghosts, ...streaks], { side, i, p });
}

// ---------- defenses ----------

// Guard: a dome that pops up over the Axie and fades slowly.
export function dome(side, i, color = 0x8fd0ff){
  const p = at(side, i, 0);
  if (!p) return;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, 0.32));
  const wire = new THREE.Mesh(new THREE.SphereGeometry(0.97, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff, 0.55, { wireframe: true }));
  [shell, wire].forEach(m => { m.position.copy(p); m.scale.setScalar(0.01); });
  spawn((t, dt) => {
    const pop = t < 0.35 ? ease(t / 0.35) * 1.1 : 1.1 - Math.min(0.1, (t - 0.35) * 0.5);
    [shell, wire].forEach(m => m.scale.setScalar(pop));
    const fade = t > 1.3 ? Math.max(0, 1 - (t - 1.3) / 0.5) : 1;
    shell.material.opacity = 0.32 * fade;
    wire.material.opacity = 0.55 * fade;
    wire.rotation.y += dt * 0.6;
    return t < 1.8;
  }, [shell, wire], { side, i, p });
}

// Bulwark: a golden hexagonal wall rising in front of the Axie.
export function bulwarkWall(side, i){
  const p = at(side, i, 0);
  if (!p) return;
  const forward = side === 'you' ? -1 : 1;
  const wall = new THREE.Mesh(new THREE.CircleGeometry(0.75, 6), mat(0xffc233, 0.55));
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.78, 6), mat(0xffe07a, 0.95));
  [wall, rim].forEach(m => { m.position.set(p.x, -0.8, p.z + forward * 0.7); m.rotation.z = Math.PI / 6; });
  spawn(t => {
    const y = -0.8 + ease(t / 0.35) * 1.6;
    const fade = t > 1.2 ? Math.max(0, 1 - (t - 1.2) / 0.5) : 1;
    [wall, rim].forEach(m => { m.position.y = y; });
    wall.material.opacity = 0.55 * fade;
    rim.material.opacity = 0.95 * fade;
    return t < 1.7;
  }, [wall, rim], { side, i, p });
}

// Barrier: a bubble with a turning crystal lattice.
export function bubble(side, i){
  const p = at(side, i, 0.75);
  if (!p) return;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 28, 20), mat(0x6fe3ff, 0.22));
  const lattice = new THREE.Mesh(new THREE.IcosahedronGeometry(0.93, 1), mat(0x2f9bff, 0.7, { wireframe: true }));
  [ball, lattice].forEach(m => { m.position.copy(p); m.scale.setScalar(0.01); });
  spawn((t, dt) => {
    const s = t < 0.4 ? ease(t / 0.4) : 1 + 0.03 * Math.sin(t * 8);
    [ball, lattice].forEach(m => m.scale.setScalar(s));
    lattice.rotation.y += dt * 1.2; lattice.rotation.x += dt * 0.6;
    const fade = t > 1.5 ? Math.max(0, 1 - (t - 1.5) / 0.5) : 1;
    ball.material.opacity = 0.22 * fade;
    lattice.material.opacity = 0.7 * fade;
    return t < 2;
  }, [ball, lattice], { side, i, p });
}

// Thorns: a ring of spikes bursting out of the snow.
export function thornSpikes(side, i){
  const p = at(side, i, 0);
  if (!p) return;
  const spikes = [];
  for (let k = 0; k < 10; k++){
    const a = (k / 10) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7, 6), mat(k % 2 ? 0x5a7a2c : 0x7c9a3c));
    s.position.set(p.x + Math.cos(a) * 0.75, 0, p.z + Math.sin(a) * 0.6);
    s.rotation.z = -Math.cos(a) * 0.35; s.rotation.x = Math.sin(a) * 0.35;
    s.scale.set(1, 0.01, 1);
    spikes.push(s);
  }
  spawn(t => {
    const grow = t < 0.2 ? ease(t / 0.2) : t > 1.1 ? Math.max(0.01, 1 - (t - 1.1) / 0.4) : 1;
    spikes.forEach(s => { s.scale.y = grow; s.position.y = 0.35 * grow; });
    return t < 1.5;
  }, spikes, { side, i, p });
}

// Cleanse: a white-gold column of light with a ring sweeping up it.
export function cleansePillar(side, i){
  const p = at(side, i, 0);
  if (!p) return;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 5, 24, 1, true), mat(0xfff3c4, 0.45));
  beam.position.set(p.x, 2.5, p.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40), mat(0xffd23f, 0.9));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(p.x, 0.05, p.z);
  spawn(t => {
    const k = t / 1.2;
    ring.position.y = 0.05 + ease(k) * 2.6;
    ring.material.opacity = Math.max(0, 0.9 * (1 - k));
    beam.material.opacity = Math.max(0, 0.45 * (1 - k));
    return k < 1;
  }, [beam, ring], { side, i, p });
}

// ---------- heals ----------

// Instant heal: a beam of light from the sky with leaves rising.
export function healBeam(side, i){
  const p = at(side, i, 0);
  if (!p) return;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 24, 1, true), mat(0xc8ffb0, 0.0));
  beam.position.set(p.x, 3.5, p.z);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.7, 40), mat(0x9be6a8, 0.8));
  halo.rotation.x = -Math.PI / 2; halo.position.set(p.x, 0.03, p.z);
  const leaves = leafSwarm(p, 8);
  spawn((t, dt) => {
    const k = t / 1.4;
    beam.material.opacity = k < 0.2 ? k * 2.5 : Math.max(0, 0.5 * (1 - (k - 0.2) / 0.8));
    halo.scale.setScalar(1 + ease(k) * 1.5);
    halo.material.opacity = Math.max(0, 0.8 * (1 - k));
    stepLeaves(leaves, t, dt, p, false);
    return k < 1;
  }, [beam, halo, ...leaves], { side, i, p });
}

// Regeneration: leaves spiraling up around the Axie.
export function regenSpiral(side, i){
  const p = at(side, i, 0);
  if (!p) return;
  const leaves = leafSwarm(p, 12);
  spawn((t, dt) => { stepLeaves(leaves, t, dt, p, true); return t < 1.8; }, leaves, { side, i, p });
}

function leafSwarm(p, n){
  const leaves = [];
  for (let k = 0; k < n; k++){
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.09, 5), mat(k % 3 ? 0x58c46a : 0xb5f08a, 0.95));
    l.scale.set(1, 0.55, 1);
    l.userData = { a: (k / n) * Math.PI * 2, r: 0.55 + Math.random() * 0.25, y: Math.random() * 0.3, sp: 2.2 + Math.random() };
    l.position.copy(p);
    leaves.push(l);
  }
  return leaves;
}

function stepLeaves(leaves, t, dt, p, spiral){
  leaves.forEach(l => {
    const u = l.userData;
    u.a += dt * u.sp;
    u.y += dt * (spiral ? 1.3 : 1.8);
    const r = spiral ? u.r * (1 - Math.min(0.6, t * 0.3)) : u.r * 0.7;
    l.position.set(p.x + Math.cos(u.a) * r, u.y, p.z + Math.sin(u.a) * r);
    l.rotation.set(u.a, u.a * 0.7, 0);
    l.material.opacity = Math.max(0, 0.95 - Math.max(0, t - (spiral ? 1.2 : 0.9)) * 1.6);
  });
}

// ---------- reversed support ----------

// Vulnerable: a red ring that cracks inward, with a red flash.
export function vulnerable(side, i){
  const p = at(side, i, 0.03);
  if (!p) return;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 8), mat(0xff4f4f, 0.9));
  ring.rotation.x = -Math.PI / 2; ring.position.copy(p);
  const cracks = [0, 1, 2, 3, 4].map(k => {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.04), mat(0xff4f4f, 0.9));
    c.rotation.x = -Math.PI / 2; c.rotation.z = (k / 5) * Math.PI * 2;
    c.position.copy(p).add(new THREE.Vector3(0, 0.005, 0));
    return c;
  });
  spawn((t, dt) => {
    const k = t / 1.1;
    ring.scale.setScalar(1.3 - ease(k) * 0.5);
    ring.rotation.z += dt * 1.8;
    const o = Math.max(0, 0.9 * (1 - k));
    ring.material.opacity = o;
    cracks.forEach(c => { c.scale.x = ease(k * 1.5); c.material.opacity = o; });
    return k < 1;
  }, [ring, ...cracks], { side, i, p });
}

// Reverse heal / rot: a dark column pulling motes out of the target.
export function drainBeam(side, i){
  const p = at(side, i, 0);
  if (!p) return;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 5, 20, 1, true), mat(0x3b1f4f, 0.55));
  beam.position.set(p.x, 2.5, p.z);
  const motes = [];
  for (let k = 0; k < 10; k++){
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mat(0x9f4fd6, 0.9));
    m.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6));
    motes.push(m);
  }
  spawn((t, dt) => {
    const k = t / 1.1;
    beam.material.opacity = Math.max(0, 0.55 * (1 - k));
    motes.forEach(m => { m.position.y += dt * 2.5; m.material.opacity = Math.max(0, 0.9 * (1 - k)); });
    return k < 1;
  }, [beam, ...motes], { side, i, p });
}

// ---------- soft particles (WoW-style spell look) ----------
// One shared radial-gradient texture drives every soft particle: additive
// "glow" sprites for light (sparks, spell cores) and normal-blended "smoke"
// sprites for clouds, so effects read as volumes instead of solid balls.
let softTex = null;
function softTexture(){
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}
function glow(color, size, opacity = 1){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  s.userData.base = opacity;
  return s;
}
function smoke(color, size, opacity = 0.6){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(), color, transparent: true, opacity, depthWrite: false }));
  s.scale.setScalar(size);
  s.material.rotation = Math.random() * Math.PI * 2;
  s.userData.base = opacity;
  return s;
}

const lerpAt = (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t);
const liveAt = (side, i, y) => { const q = ctx?.lanePos(side, i); return q ? new THREE.Vector3(q.x, y, q.z) : null; };

// ---------- Volley: a real rain of arrows ----------
// Launched from the caster the moment the card fires: a sheaf of arrows
// shoots up out of view, a golden target circle marks the ground under the
// target, then dozens of arrows hail down over the area around impact,
// punch into the snow with a puff and stay stuck there for a moment.
const ARROW_GEO = {
  shaft: new THREE.CylinderGeometry(0.024, 0.024, 0.78, 5),
  tip: new THREE.ConeGeometry(0.065, 0.19, 6),
  fletch: new THREE.PlaneGeometry(0.16, 0.2),
  streak: new THREE.CylinderGeometry(0.01, 0.055, 1.8, 6, 1, true),
};
Object.values(ARROW_GEO).forEach(g => SHARED_GEOS.add(g));
function makeArrow(mats){
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(ARROW_GEO.shaft, mats.shaft);
  const tip = new THREE.Mesh(ARROW_GEO.tip, mats.tip);
  tip.position.y = -0.47; tip.rotation.x = Math.PI;
  const f1 = new THREE.Mesh(ARROW_GEO.fletch, mats.fletch);
  f1.position.y = 0.33;
  const f2 = new THREE.Mesh(ARROW_GEO.fletch, mats.fletch);
  f2.position.y = 0.33; f2.rotation.y = Math.PI / 2;
  g.add(shaft, tip, f1, f2);
  // A glowing streak behind the arrow while it flies (hidden once stuck).
  const streak = new THREE.Mesh(ARROW_GEO.streak, mats.streak);
  streak.position.y = 1.25;
  streak.renderOrder = 8;
  g.add(streak);
  g.userData.streak = streak;
  g.userData.shared = true;
  return g;
}
const DOWN = new THREE.Vector3(0, -1, 0);


export function volley(fromSide, fromI, toSide, toI, flight = 2, miss = false, color = 0xd9b44a){
  const from = liveAt(fromSide, fromI, 1.1);
  const first = liveAt(toSide, toI, 0);
  if (!from || !first) return;
  const mats = { shaft: mat(0x8a5a2e), tip: mat(0xf4f8ff), fletch: mat(color), streak: mat(0xfff1b8, 0.75, { blending: THREE.AdditiveBlending }) };
  const away = first.clone().sub(from).setY(0).normalize();
  const missOff = miss ? new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(Math.random() < 0.5 ? -1.7 : 1.7) : new THREE.Vector3();
  const objects = [];

  // Up-shot: a fan of arrows leaving the bow.
  const up = [];
  for (let k = 0; k < 9; k++){
    const a = makeArrow(mats);
    a.position.copy(from);
    a.userData.v = new THREE.Vector3(away.x * 1.5 + (Math.random() - 0.5) * 1.4, 11 + Math.random() * 3, away.z * 1.5 + (Math.random() - 0.5) * 1.4);
    a.userData.delay = k * 0.035;
    a.visible = false;
    up.push(a);
  }
  // Ground telegraph under the target.
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.32, 48), mat(0xffd76a, 0, { blending: THREE.AdditiveBlending }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40), mat(0xffb84a, 0, { blending: THREE.AdditiveBlending }));
  [ring, disc].forEach(m => { m.rotation.x = -Math.PI / 2; });
  // The hail.
  const rain = [];
  const RAIN = 28;
  for (let k = 0; k < RAIN; k++){
    const a = makeArrow(mats);
    const r = Math.sqrt(Math.random()) * 1.15, ang = Math.random() * Math.PI * 2;
    Object.assign(a.userData, { off: new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r), start: flight - 0.6 + Math.random() * 0.75, landed: false, land: null, sky: null });
    a.visible = false;
    rain.push(a);
  }
  const puffs = [];
  objects.push(...up, ring, disc, ...rain);

  spawn((t, dt) => {
    up.forEach(a => {
      const k = t - a.userData.delay;
      if (k < 0) return;
      a.visible = k < 0.6;
      a.userData.v.y -= 6 * dt;
      a.position.addScaledVector(a.userData.v, dt);
      a.quaternion.setFromUnitVectors(DOWN, a.userData.v.clone().normalize());
    });
    const center = (liveAt(toSide, toI, 0.02) || first).add(missOff);
    const tele = Math.min(1, Math.max(0, (t - (flight - 1.1)) / 0.4));
    const teleFade = t > flight + 0.6 ? Math.max(0, 1 - (t - flight - 0.6) / 0.4) : 1;
    ring.position.copy(center); disc.position.copy(center).setY(0.015);
    ring.material.opacity = 1 * tele * teleFade;
    disc.material.opacity = 0.3 * tele * teleFade * (0.8 + 0.2 * Math.sin(t * 14));
    ring.scale.setScalar(1.25 - 0.25 * ease(tele));
    rain.forEach(a => {
      const u = a.userData;
      const k = (t - u.start) / 0.26;
      if (k < 0) return;
      if (!u.land){
        u.land = center.clone().add(u.off).setY(0.3);
        u.sky = u.land.clone().add(new THREE.Vector3(-away.x * 1.6, 6.5, -away.z * 1.6));
        a.quaternion.setFromUnitVectors(DOWN, u.land.clone().sub(u.sky).normalize());
        a.visible = true;
      }
      if (k < 1){ a.position.lerpVectors(u.sky, u.land, k); return; }
      if (!u.landed){
        u.landed = true;
        a.position.copy(u.land);
        a.userData.streak.visible = false;
        for (let n = 0; n < 2; n++){
          const s = smoke(0xffffff, 0.25, 0.8);
          s.position.copy(u.land).setY(0.12);
          s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.9);
          s.userData.t0 = t;
          ctx.scene.add(s);
          puffs.push(s);
          objects.push(s);
        }
      }
    });
    puffs.forEach(s => {
      const k = (t - s.userData.t0) / 0.5;
      s.position.addScaledVector(s.userData.v, dt);
      s.scale.setScalar(0.25 + k * 0.45);
      s.material.opacity = Math.max(0, 0.8 * (1 - k));
    });
    const fade = Math.max(0, 1 - (t - flight - 1.6) / 0.5);
    mats.shaft.opacity = mats.tip.opacity = mats.fletch.opacity = Math.min(1, fade);
    mats.streak.opacity = 0.75 * Math.min(1, fade);
    return fade > 0;
  }, objects);
}

// ---------- Poison: a venom glob thrown from the hand ----------
// A bubbling green glob leaves the caster's front, arcs over to the target
// trailing toxic smoke and dripping venom, then bursts into a splash. The
// lingering cloud itself is poisonCloud(), played on impact.
export function poisonBolt(fromSide, fromI, toSide, toI, flight = 2, miss = false){
  const start = liveAt(fromSide, fromI, 1.0);
  const first = liveAt(toSide, toI, 0.9);
  if (!start || !first) return;
  const fwd = first.clone().sub(start).setY(0).normalize();
  start.addScaledVector(fwd, 0.45);
  const missOff = miss ? new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(Math.random() < 0.5 ? -1.4 : 1.4) : new THREE.Vector3();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat(0x7dff4a, 0.95));
  const aura = glow(0x6dff3a, 1.1, 0.9);
  const inner = glow(0xeaffb0, 0.45, 1);
  const trail = [];
  const drops = [];
  const objects = [core, aura, inner];
  let lastPuff = 0;
  spawn((t, dt) => {
    const k = Math.min(1, t / flight);
    const to = (liveAt(toSide, toI, 0.9) || first).add(missOff);
    const pos = lerpAt(start, to, k);
    pos.y += Math.sin(Math.PI * k) * 1.4;
    if (k < 1){
      core.position.copy(pos); aura.position.copy(pos); inner.position.copy(pos);
      const wob = 1 + 0.18 * Math.sin(t * 26);
      core.scale.set(wob, 2 - wob, wob);
      aura.scale.setScalar(1.1 * (0.9 + 0.2 * Math.sin(t * 13)));
      if (t - lastPuff > 0.035){
        lastPuff = t;
        const s = smoke(Math.random() < 0.3 ? 0x2f7a22 : 0x6fd048, 0.3, 0.55);
        s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12));
        s.userData.t0 = t;
        ctx.scene.add(s); trail.push(s); objects.push(s);
        if (Math.random() < 0.45){
          const d = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), mat(0x8cff5a, 0.95));
          d.position.copy(pos); d.userData = { v: new THREE.Vector3(0, -0.4, 0), t0: t };
          ctx.scene.add(d); drops.push(d); objects.push(d);
        }
      }
    } else if (core.visible){
      core.visible = false; inner.visible = false;
      aura.scale.setScalar(2.4);
      // Splash: a burst of venom droplets.
      for (let n = 0; n < 16; n++){
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), mat(n % 3 ? 0x7dff4a : 0x2f7a22, 0.95));
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 1.6;
        d.position.copy(pos);
        d.userData = { v: new THREE.Vector3(Math.cos(a) * sp, 1.5 + Math.random() * 2, Math.sin(a) * sp), t0: t };
        ctx.scene.add(d); drops.push(d); objects.push(d);
      }
    }
    if (!core.visible) aura.material.opacity = Math.max(0, 0.9 - (t - flight) * 3);
    trail.forEach(s => {
      const q = (t - s.userData.t0) / 0.7;
      s.scale.setScalar(0.3 + q * 0.7);
      s.position.y += dt * 0.25;
      s.material.opacity = Math.max(0, s.userData.base * (1 - q));
    });
    drops.forEach(d => {
      d.userData.v.y -= 7 * dt;
      d.position.addScaledVector(d.userData.v, dt);
      if (d.position.y < 0.03){ d.position.y = 0.03; d.userData.v.set(0, 0, 0); }
      d.material.opacity = Math.max(0, 0.95 - (t - d.userData.t0) * 1.2);
    });
    return t < flight + 0.9;
  }, objects);
}

// Poison ticking on an Axie: a few bubbles rise and pop in a small green haze.
export function poisonTick(side, i){
  const p = at(side, i, 0.4);
  if (!p) return;
  const parts = [];
  for (let k = 0; k < 7; k++){
    const b = k < 3 ? smoke(0x5fbf3a, 0.5, 0.35) : glow(0x9dff6a, 0.14, 0.9);
    b.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.5, (Math.random() - 0.5) * 0.5));
    b.userData.rise = 0.4 + Math.random() * 0.7;
    parts.push(b);
  }
  spawn((t, dt) => {
    parts.forEach(b => { b.position.y += b.userData.rise * dt; b.material.opacity = Math.max(0, b.userData.base * (1 - t / 0.9)); });
    return t < 0.9;
  }, parts, { side, i, p });
}

// ---------- spell bolts (magic sets) ----------
// A glowing bolt with a hot core and a comet tail of soft particles, thrown
// from the caster to the target. `kind` picks the school's look: arcane
// (blue-violet), holy (gold, with rays), spirit (teal wisps) and frost
// (icy shards and snowflakes).
const SCHOOL = {
  arcane: { core: 0xe6f0ff, glow: 0x6f8dff, trail: 0x9a6bff, arc: 0.9, size: 1 },
  holy:   { core: 0xfffbe6, glow: 0xffd84a, trail: 0xffe9a0, arc: 0.5, size: 1.05 },
  spirit: { core: 0xe6fff8, glow: 0x3fe0c0, trail: 0x7affd9, arc: 1.2, size: 0.95 },
  frost:  { core: 0xffffff, glow: 0x7fd4ff, trail: 0xcff0ff, arc: 0.6, size: 1 },
};
export function spellBolt(fromSide, fromI, toSide, toI, flight = 2, miss = false, kind = 'arcane'){
  const sc = SCHOOL[kind] || SCHOOL.arcane;
  const start = liveAt(fromSide, fromI, 1.25);
  const first = liveAt(toSide, toI, 0.9);
  if (!start || !first) return;
  const fwd = first.clone().sub(start).setY(0).normalize();
  start.addScaledVector(fwd, 0.35);
  const missOff = miss ? new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(Math.random() < 0.5 ? -1.4 : 1.4) : new THREE.Vector3();
  const core = glow(sc.core, 0.42 * sc.size, 1);
  const halo = glow(sc.glow, 1.2 * sc.size, 0.95);
  const shards = [];
  if (kind === 'frost'){
    for (let n = 0; n < 5; n++){
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), mat(0xdff6ff, 0.95));
      s.scale.set(0.6, 1.8, 0.6);
      s.userData.a = (n / 5) * Math.PI * 2;
      shards.push(s);
    }
  }
  const tail = [];
  const objects = [core, halo, ...shards];
  let last = 0;
  spawn((t, dt) => {
    const k = Math.min(1, t / flight);
    const to = (liveAt(toSide, toI, 0.9) || first).add(missOff);
    const pos = lerpAt(start, to, ease(k * 0.85 + k * 0.15));
    pos.y += Math.sin(Math.PI * k) * sc.arc;
    if (k < 1){
      core.position.copy(pos); halo.position.copy(pos);
      halo.scale.setScalar(1.2 * sc.size * (0.85 + 0.25 * Math.sin(t * 20)));
      shards.forEach(s => {
        s.userData.a += dt * 9;
        s.position.copy(pos).add(new THREE.Vector3(Math.cos(s.userData.a) * 0.22, Math.sin(s.userData.a * 1.3) * 0.12, Math.sin(s.userData.a) * 0.22));
        s.rotation.y += dt * 12;
      });
      if (t - last > 0.022){
        last = t;
        const p = glow(Math.random() < 0.5 ? sc.trail : sc.glow, (0.2 + Math.random() * 0.25) * sc.size, 0.9);
        p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15));
        p.userData.t0 = t;
        p.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.5, kind === 'spirit' ? 0.5 : kind === 'frost' ? -0.3 : 0.1, (Math.random() - 0.5) * 0.5);
        ctx.scene.add(p); tail.push(p); objects.push(p);
      }
    } else {
      core.visible = halo.visible = false;
      shards.forEach(s => { s.visible = false; });
    }
    tail.forEach(p => {
      const q = (t - p.userData.t0) / 0.45;
      p.position.addScaledVector(p.userData.v, dt);
      p.material.opacity = Math.max(0, p.userData.base * (1 - q));
      p.scale.multiplyScalar(1 - dt * 1.5);
    });
    return t < flight + 0.5;
  }, objects);
}

// Sparks: a burst of hot additive particles flying out of an impact.
export function sparks(side, i, color = 0xffe7a0, n = 14, y = 0.9){
  const p = at(side, i, y);
  if (!p) return;
  const bits = [];
  for (let k = 0; k < n; k++){
    const s = glow(k % 3 ? color : 0xffffff, 0.12 + Math.random() * 0.12, 1);
    s.position.copy(p);
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.4;
    const sp = 2.5 + Math.random() * 3;
    s.userData.v = new THREE.Vector3(Math.cos(a) * sp, e * sp * 0.6 + 1, Math.sin(a) * sp);
    bits.push(s);
  }
  const flare = glow(color, 1.8, 0.9);
  flare.position.copy(p);
  spawn((t, dt) => {
    bits.forEach(s => {
      s.userData.v.y -= 9 * dt;
      s.userData.v.multiplyScalar(1 - dt * 2.5);
      s.position.addScaledVector(s.userData.v, dt);
      s.material.opacity = Math.max(0, 1 - t / 0.55);
    });
    flare.scale.setScalar(1.8 + t * 3);
    flare.material.opacity = Math.max(0, 0.9 * (1 - t / 0.25));
    return t < 0.55;
  }, [...bits, flare], { side, i, p });
}

// Holy smite: a shaft of golden light slams down with rays and motes.
export function holyBurst(side, i){
  const p = at(side, i, 0);
  if (!p) return;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 8, 24, 1, true), mat(0xfff0a8, 0, { blending: THREE.AdditiveBlending }));
  shaft.position.set(p.x, 4, p.z);
  const flare = glow(0xffe07a, 2.6, 1);
  flare.position.set(p.x, 0.9, p.z);
  const rays = [];
  for (let k = 0; k < 8; k++){
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.6), mat(0xfff3c4, 0.9, { blending: THREE.AdditiveBlending }));
    r.position.set(p.x, 0.9, p.z);
    r.lookAt(ctx.camera.position);
    r.rotateZ((k / 8) * Math.PI * 2);
    r.translateY(0.9);
    rays.push(r);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 48), mat(0xffd23f, 0.9, { blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.03, p.z);
  spawn(t => {
    const k = t / 0.8;
    shaft.material.opacity = k < 0.15 ? k / 0.15 * 0.7 : Math.max(0, 0.7 * (1 - (k - 0.15) / 0.85));
    shaft.scale.set(1 - k * 0.6, 1, 1 - k * 0.6);
    flare.scale.setScalar(2.6 * (1 + ease(k)));
    flare.material.opacity = Math.max(0, 1 - k);
    rays.forEach(r => { r.material.opacity = Math.max(0, 0.9 * (1 - k)); r.scale.y = 0.6 + ease(k) * 0.8; });
    ring.scale.setScalar(1 + ease(k) * 2.2);
    ring.material.opacity = Math.max(0, 0.9 * (1 - k));
    return k < 1;
  }, [shaft, flare, ...rays, ring], { side, i, p });
}

// Frost nova: ice crystals burst out of the snow in a ring, a cold mist
// rolls out and a frosty sheen stays under the Axie while it's Chilled.
export function frostNova(side, i){
  const p = at(side, i, 0);
  if (!p) return;
  const crystals = [];
  for (let k = 0; k < 12; k++){
    const a = (k / 12) * Math.PI * 2 + Math.random() * 0.3;
    const r = 0.55 + Math.random() * 0.35;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.1 + Math.random() * 0.06, 0.6 + Math.random() * 0.5, 5), mat(k % 2 ? 0xbfeaff : 0xe8f8ff, 0.9));
    c.position.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r * 0.85);
    c.rotation.z = -Math.cos(a) * 0.5; c.rotation.x = Math.sin(a) * 0.5;
    c.scale.set(1, 0.01, 1);
    crystals.push(c);
  }
  const mist = [];
  for (let k = 0; k < 8; k++){
    const m = smoke(0xdff4ff, 0.8, 0.5);
    const a = Math.random() * Math.PI * 2;
    m.position.set(p.x, 0.25, p.z);
    m.userData.v = new THREE.Vector3(Math.cos(a) * 1.3, 0.1, Math.sin(a) * 1.3);
    mist.push(m);
  }
  const sheen = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), mat(0x9fdcff, 0.5, { blending: THREE.AdditiveBlending }));
  sheen.rotation.x = -Math.PI / 2; sheen.position.set(p.x, 0.02, p.z);
  const flare = glow(0xaee6ff, 2.4, 0.9);
  flare.position.set(p.x, 0.7, p.z);
  spawn((t, dt) => {
    const grow = t < 0.18 ? ease(t / 0.18) : t > 1.4 ? Math.max(0.01, 1 - (t - 1.4) / 0.5) : 1;
    crystals.forEach(c => { c.scale.y = grow; c.position.y = 0.25 * grow; });
    mist.forEach(m => {
      m.userData.v.multiplyScalar(1 - dt * 2);
      m.position.addScaledVector(m.userData.v, dt);
      m.scale.setScalar(0.8 + t * 1.2);
      m.material.opacity = Math.max(0, 0.5 * (1 - t / 1.4));
    });
    sheen.material.opacity = Math.max(0, 0.5 * (1 - t / 1.9));
    flare.material.opacity = Math.max(0, 0.9 * (1 - t / 0.3));
    return t < 1.9;
  }, [...crystals, ...mist, sheen, flare], { side, i, p });
}

// Stun: golden stars orbiting over the head plus an electric ground ring.
export function stunStars(side, i, seconds = 2.5){
  const p = at(side, i, 1.75);
  if (!p) return;
  const stars = [0, 1, 2, 3].map(k => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('⭐'), transparent: true, depthWrite: false }));
    s.scale.setScalar(0.28); s.userData.a = (k / 4) * Math.PI * 2;
    return s;
  });
  const glows = stars.map(() => glow(0xffe36a, 0.45, 0.8));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.72, 40), mat(0xffe36a, 0.9, { blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.03, p.z);
  spawn((t, dt) => {
    const fade = t > seconds - 0.3 ? Math.max(0, (seconds - t) / 0.3) : Math.min(1, t / 0.15);
    stars.forEach((s, k) => {
      s.userData.a += dt * 5;
      s.position.set(p.x + Math.cos(s.userData.a) * 0.42, p.y + Math.sin(s.userData.a * 2) * 0.06, p.z + Math.sin(s.userData.a) * 0.3);
      s.material.opacity = fade;
      glows[k].position.copy(s.position);
      glows[k].material.opacity = 0.8 * fade;
    });
    ring.scale.setScalar(1 + ease(Math.min(1, t / 0.4)) * 0.8);
    ring.material.opacity = Math.max(0, 0.9 * (1 - t / 0.6));
    return t < seconds;
  }, [...stars, ...glows, ring], { side, i, p });
}

// Fear: dark shadow smoke coils up around the target with a ghost flicker.
export function fearWisps(side, i){
  const p = at(side, i, 0.2);
  if (!p) return;
  const wisps = [];
  for (let k = 0; k < 12; k++){
    const w = smoke(k % 3 ? 0x2a1840 : 0x6a3fa0, 0.6, 0.7);
    w.userData = { a: (k / 12) * Math.PI * 2, r: 0.5 + Math.random() * 0.2, y: Math.random() * 0.4, sp: 3 + Math.random() * 2, base: 0.7 };
    wisps.push(w);
  }
  const ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('👻'), transparent: true, depthWrite: false }));
  ghost.position.set(p.x, 2.1, p.z); ghost.scale.setScalar(0.01);
  spawn((t, dt) => {
    wisps.forEach(w => {
      const u = w.userData;
      u.a += dt * u.sp; u.y += dt * 1.1;
      w.position.set(p.x + Math.cos(u.a) * u.r, p.y + u.y, p.z + Math.sin(u.a) * u.r * 0.8);
      w.scale.setScalar(0.6 + t * 0.4);
      w.material.opacity = Math.max(0, 0.7 * (1 - t / 1.4));
    });
    ghost.scale.setScalar(Math.min(0.6, ease(t / 0.3) * 0.6));
    ghost.material.opacity = t > 1.1 ? Math.max(0, 1 - (t - 1.1) / 0.3) : (0.7 + 0.3 * Math.sin(t * 30));
    return t < 1.4;
  }, [...wisps, ghost], { side, i, p });
}

// Blood: droplets sprayed out of the wound that splat on the snow.
export function bloodSpray(side, i){
  const p = at(side, i, 0.8);
  if (!p) return;
  const drops = [];
  for (let k = 0; k < 14; k++){
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.03, 6, 6), mat(k % 2 ? 0xa11616 : 0xd02a20, 0.95));
    d.position.copy(p);
    const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 1.8;
    d.userData.v = new THREE.Vector3(Math.cos(a) * sp, 1.2 + Math.random() * 1.8, Math.sin(a) * sp);
    drops.push(d);
  }
  spawn((t, dt) => {
    drops.forEach(d => {
      if (d.position.y > 0.03){
        d.userData.v.y -= 9 * dt;
        d.position.addScaledVector(d.userData.v, dt);
      } else { d.position.y = 0.02; d.scale.set(1.8, 0.2, 1.8); }
      d.material.opacity = t > 1.2 ? Math.max(0, 0.95 - (t - 1.2) * 2) : 0.95;
    });
    return t < 1.7;
  }, drops, { side, i, p });
}

// Bleed ticking: a few drops fall from the wound.
export function bleedTick(side, i){
  const p = at(side, i, 0.9);
  if (!p) return;
  const drops = [];
  for (let k = 0; k < 5; k++){
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), mat(0xc0201a, 0.95));
    d.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3));
    d.scale.set(0.8, 1.4, 0.8);
    d.userData.v = new THREE.Vector3(0, -0.5 - Math.random(), 0);
    drops.push(d);
  }
  spawn((t, dt) => {
    drops.forEach(d => {
      if (d.position.y > 0.03){ d.userData.v.y -= 8 * dt; d.position.addScaledVector(d.userData.v, dt); }
      else { d.position.y = 0.02; d.scale.set(2, 0.2, 2); }
      d.material.opacity = Math.max(0, 0.95 - Math.max(0, t - 0.6) * 2);
    });
    return t < 1.1;
  }, drops, { side, i, p });
}

// Defense aura: a glowing rune circle on the ground and motes rising around
// the Axie -- the "buff applied" beat every defense shares.
export function buffAura(side, i, color = 0x8fd0ff){
  const p = at(side, i, 0);
  if (!p) return;
  const rune = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 6), mat(color, 0.9, { blending: THREE.AdditiveBlending }));
  const rune2 = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.6, 32), mat(color, 0.8, { blending: THREE.AdditiveBlending }));
  [rune, rune2].forEach(r => { r.rotation.x = -Math.PI / 2; r.position.set(p.x, 0.03, p.z); });
  const motes = [];
  for (let k = 0; k < 12; k++){
    const m = glow(k % 3 ? color : 0xffffff, 0.14, 0.95);
    const a = (k / 12) * Math.PI * 2;
    m.userData = { a, y: Math.random() * 0.3, sp: 0.9 + Math.random() * 0.8, base: 0.95 };
    motes.push(m);
  }
  spawn((t, dt) => {
    const k = t / 1.3;
    rune.rotation.z += dt * 1.5; rune2.rotation.z -= dt * 2;
    rune.scale.setScalar(0.6 + ease(Math.min(1, k * 3)) * 0.5);
    rune.material.opacity = rune2.material.opacity = Math.max(0, 0.9 * (1 - k));
    motes.forEach(m => {
      const u = m.userData;
      u.y += dt * u.sp; u.a += dt * 1.2;
      m.position.set(p.x + Math.cos(u.a) * 0.7, u.y, p.z + Math.sin(u.a) * 0.6);
      m.material.opacity = Math.max(0, 0.95 * (1 - k));
    });
    return k < 1;
  }, [rune, rune2, ...motes], { side, i, p });
}

// Heal sparkle: green-gold glitter rising through the Axie.
export function healSparkle(side, i, color = 0x9dffb0){
  const p = at(side, i, 0);
  if (!p) return;
  const bits = [];
  for (let k = 0; k < 16; k++){
    const b = glow(k % 4 ? color : 0xfff6b0, 0.1 + Math.random() * 0.1, 1);
    b.position.set(p.x + (Math.random() - 0.5) * 1.0, Math.random() * 0.6, p.z + (Math.random() - 0.5) * 0.8);
    b.userData.rise = 0.8 + Math.random() * 1.2;
    b.userData.base = 1;
    bits.push(b);
  }
  const flare = glow(color, 2.2, 0.6);
  flare.position.set(p.x, 0.8, p.z);
  spawn((t, dt) => {
    bits.forEach(b => { b.position.y += b.userData.rise * dt; b.material.opacity = Math.max(0, 1 - t / 1.3) * (0.6 + 0.4 * Math.sin(t * 25 + b.userData.rise * 10)); });
    flare.material.opacity = Math.max(0, 0.6 * (1 - t / 0.5));
    return t < 1.3;
  }, [...bits, flare], { side, i, p });
}

// ---------- camera, time and screen ----------

const cam = { shake: 0, shakeDecay: 0, punch: 0, focus: null, focusAmt: 0 };
let timeScale = 1;
// Active slow-downs, each { factor, left } in real seconds -- the game
// runs at the slowest one still going, so a hit-stop followed by a KO
// slow-mo doesn't turn into a long freeze.
const slows = [];

export function getTimeScale(){ return paused ? 0 : timeScale; }
// Pause freezes the whole scene -- rules, casts in flight and effects.
let paused = false;
export function setPaused(on){ paused = on; }

export function shake(intensity = 0.15, duration = 0.35){
  cam.shake = Math.max(cam.shake, intensity);
  cam.shakeDecay = intensity / duration;
}

export function zoomPunch(side, i, amount = 3){
  cam.punch = Math.max(cam.punch, amount);
  const p = at(side, i, 0.5);
  if (p){ cam.focus = p; cam.focusAmt = 0.35; }
}

// Slows the whole game (visuals and, through main.js, the rules clock).
export function slowMo(factor = 0.3, realSeconds = 0.8){
  slows.push({ factor, left: realSeconds });
  timeScale = Math.min(timeScale, factor);
}

// A near-freeze on impact: sells weight without costing any time.
export function hitStop(realSeconds = 0.08){ slowMo(0.05, realSeconds); }

export function flash(color = '#ffffff', strength = 0.7){
  const el = ctx?.overlay;
  if (!el) return;
  el.style.setProperty('--flash-color', color);
  el.style.setProperty('--flash-strength', strength);
  el.classList.remove('flashing');
  void el.offsetWidth;
  el.classList.add('flashing');
}

export function letterbox(on){
  ctx?.overlay?.classList.toggle('letterbox', on);
}

// Called by board3d with the REAL frame dt (not scaled).
export function tickTime(realDt){
  for (let i = slows.length - 1; i >= 0; i--){
    slows[i].left -= realDt;
    if (slows[i].left <= 0) slows.splice(i, 1);
  }
  timeScale = slows.reduce((m, s) => Math.min(m, s.factor), 1);
}

export function resetTime(){
  slows.length = 0; timeScale = 1;
  cam.shake = 0; cam.punch = 0; cam.focusAmt = 0;
}

function tickCamera(dt){
  const c = ctx.camera;
  const base = ctx.cameraBase;
  cam.shake = Math.max(0, cam.shake - cam.shakeDecay * dt);
  cam.punch = Math.max(0, cam.punch - dt * 6);
  cam.focusAmt = Math.max(0, cam.focusAmt - dt * 0.6);
  const s = cam.shake;
  c.position.set(
    base.pos.x + (Math.random() - 0.5) * 2 * s,
    base.pos.y + (Math.random() - 0.5) * 2 * s,
    base.pos.z + (Math.random() - 0.5) * 2 * s,
  );
  const fov = base.fov - cam.punch;
  if (c.fov !== fov){ c.fov = fov; c.updateProjectionMatrix(); }
  const look = base.target.clone();
  if (cam.focus && cam.focusAmt > 0) look.lerp(cam.focus, cam.focusAmt);
  c.lookAt(look);
}
