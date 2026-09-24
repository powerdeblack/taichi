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

function spawn(update, objects){
  objects.forEach(o => ctx.scene.add(o));
  active.push({ t: 0, update, objects });
}

function dispose(o){
  o.traverse?.(n => { n.geometry?.dispose(); n.material?.dispose?.(); n.material?.map?.dispose(); });
  ctx.scene.remove(o);
}

// dt is the (slow-motion scaled) game time; realDt drives the camera so a
// shake still settles on schedule during a slow-mo moment.
export function tickCinematics(dt, realDt = dt){
  for (let i = active.length - 1; i >= 0; i--){
    const fx = active[i];
    fx.t += dt;
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
  }, [...strokes, ...core]);
}

// Arrows falling from the sky onto the target, one after another, then
// staying stuck in the snow for a moment.
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
    const land = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, 0.35, (Math.random() - 0.5) * 0.7));
    g.userData = { land, from: land.clone().add(new THREE.Vector3(-1.2, 5.5, 1.2)), delay: k * 0.14, puffed: false };
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
      a.position.lerpVectors(u.from, u.land, Math.min(1, k));
      if (k >= 1 && !u.puffed){ u.puffed = true; puff(u.land, 0xffffff, 6); }
      const fade = (t - u.delay - 0.32 - 1.0) / 0.4;
      a.children.forEach(c => { c.material.opacity = fade > 0 ? Math.max(0, 1 - fade) : 1; });
      if (fade < 1) alive = true;
    });
    return alive;
  }, arrows);
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
    ring.scale.setScalar(1 + ease(k) * 3.5);
    ring.material.opacity = Math.max(0, 0.9 * (1 - k));
    return k < 1;
  }, [ball, pillar, ring]);
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
    const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2 * strength;
    d.userData.v = new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 2.5, Math.sin(a) * sp);
    debris.push(d);
  }
  spawn((t, dt) => {
    const k = t / 0.9;
    ring.scale.setScalar(1 + ease(k) * 6 * strength);
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
  }, [ring, inner, ...debris]);
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
  }, blots);
}

// A lingering toxic cloud: puffy green/purple spheres swelling and
// drifting upward.
export function poisonCloud(side, i){
  const p = at(side, i, 0.5);
  if (!p) return;
  const puffs = [];
  for (let k = 0; k < 8; k++){
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.28 + Math.random() * 0.18, 14, 10), mat(k % 3 ? 0x5fbf3a : 0x8e5cc9, 0.5));
    s.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.9, Math.random() * 0.6, (Math.random() - 0.5) * 0.7));
    s.userData.rise = 0.15 + Math.random() * 0.25;
    s.scale.setScalar(0.2);
    puffs.push(s);
  }
  spawn((t, dt) => {
    puffs.forEach(s => {
      s.position.y += s.userData.rise * dt;
      s.scale.setScalar(0.2 + ease(t / 0.6) * 1.1);
      s.material.opacity = t < 1.4 ? 0.5 : Math.max(0, 0.5 - (t - 1.4) * 0.8);
    });
    return t < 2.05;
  }, puffs);
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
  }, [skull, ring]);
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
  }, [...ghosts, ...streaks]);
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
  }, [shell, wire]);
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
  }, [wall, rim]);
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
  }, [ball, lattice]);
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
  }, spikes);
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
  }, [beam, ring]);
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
  }, [beam, halo, ...leaves]);
}

// Regeneration: leaves spiraling up around the Axie.
export function regenSpiral(side, i){
  const p = at(side, i, 0);
  if (!p) return;
  const leaves = leafSwarm(p, 12);
  spawn((t, dt) => { stepLeaves(leaves, t, dt, p, true); return t < 1.8; }, leaves);
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
  }, [ring, ...cracks]);
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
  }, [beam, ...motes]);
}

// ---------- camera, time and screen ----------

const cam = { shake: 0, shakeDecay: 0, punch: 0, focus: null, focusAmt: 0 };
let timeScale = 1;
// Active slow-downs, each { factor, left } in real seconds -- the game
// runs at the slowest one still going, so a hit-stop followed by a KO
// slow-mo doesn't turn into a long freeze.
const slows = [];

export function getTimeScale(){ return timeScale; }

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
