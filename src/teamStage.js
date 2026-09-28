// Team-select stage: the chosen squad's three Axies standing on carved stone
// pedestals, in 3D, with their class colours, set weapons and Mystic glow
// (see axieLook.js). Also renders small 3D portraits for the team list.
import * as THREE from 'three';
import { createAxieMixer3D } from '@jaatster/threejs-axie-mixer3d-public';
import { buildDescriptor, equipSetWeapon, weaponPrefix, playClip, renderPortrait } from './axieLook.js';

let renderer, scene, camera, clock, canvasEl;
let mixerPromise = null;
let current = []; // { axie, weapon, pop, spot }
let requestId = 0;
let active = true;

// Pedestal spots, left to right; the middle one stands a bit further back.
const SPOTS = [{ x: -1.5, z: 0.15, turn: 0.28 }, { x: 0, z: -0.1, turn: 0 }, { x: 1.5, z: 0.15, turn: -0.28 }];
const PEDESTAL_H = 0.42;
const AXIE_SCALE = 0.78;

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
    mixerPromise.catch(() => { mixerPromise = null; });
  }
  return mixerPromise;
}

function resize(){
  if (!renderer || !canvasEl) return;
  const w = canvasEl.clientWidth || 400, h = canvasEl.clientHeight || 300;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Fit the whole stone base (about 6 units wide) horizontally, whatever the
  // canvas shape, without zooming in closer than a comfortable framing.
  const dist = camera.position.distanceTo(new THREE.Vector3(0, 0.78, 0));
  const hfov = 2 * Math.atan(3.05 / dist);
  const vfov = 2 * Math.atan(Math.tan(hfov / 2) / camera.aspect) * 180 / Math.PI;
  camera.fov = Math.min(58, Math.max(24, vfov));
  camera.updateProjectionMatrix();
}

export function initStage(canvas){
  if (renderer) return ensureMixer();
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 2.05, 7.4);
  camera.lookAt(0, 0.78, 0);
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x4a3020, 1.5));
  const key = new THREE.DirectionalLight(0xffe2b8, 1.7);
  key.position.set(2.5, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 0.8);
  rim.position.set(-4, 3, -3);
  scene.add(rim);
  buildPedestals();
  clock = new THREE.Clock();
  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  requestAnimationFrame(loop);
  return ensureMixer();
}

// Carved stone: a long base slab with scrolled ends and three round
// pedestals with a darker carved band and a rim.
function buildPedestals(){
  const stone = new THREE.MeshStandardMaterial({ color: 0xece2d2, roughness: 0.92 });
  const carved = new THREE.MeshStandardMaterial({ color: 0xcdbfa6, roughness: 0.95 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.24, 1.9), stone);
  slab.position.set(0, -0.12, 0.05);
  scene.add(slab);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.08, 2.05), carved);
  lip.position.set(0, 0.02, 0.05);
  scene.add(lip);
  for (const side of [-1, 1]){
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.09, 12, 28), stone);
    scroll.position.set(side * 2.72, 0.2, 0.3);
    scroll.rotation.y = Math.PI / 2;
    scene.add(scroll);
  }
  SPOTS.forEach(s => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.72, PEDESTAL_H, 40), stone);
    body.position.set(s.x, PEDESTAL_H / 2, s.z);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.735, 0.735, 0.1, 40), carved);
    band.position.set(s.x, 0.14, s.z);
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.04, 10, 40), carved);
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.set(s.x, PEDESTAL_H, s.z);
    scene.add(body, band, rimRing);
  });
}

function loop(){
  requestAnimationFrame(loop);
  if (!active || !renderer) return;
  const dt = Math.min(0.05, clock.getDelta());
  current.forEach(c => {
    if (!c.axie || c.axie.disposed) return;
    c.axie.update(dt);
    if (c.pop < 1){ c.pop = Math.min(1, c.pop + dt * 3.2); c.axie.wrapper.scale.setScalar(AXIE_SCALE * easeBack(c.pop)); }
  });
  tickChoreo(dt);
  tickFx(dt);
  renderer.render(scene, camera);
}

// ---------- choreography ----------
// The squad performs together on a loop instead of each Axie swinging on
// its own clock: a left -> centre -> right wave of weapon attacks, a beat,
// then all three strike their Skill pose at once while the archetype's
// signature effect erupts from every pedestal. Between beats the pedestals
// breathe the archetype's ambient particles.
const CYCLE = 6.4;
const BEATS = [
  { at: 0.7, who: [0], clip: 'Attack' },
  { at: 1.15, who: [1], clip: 'Attack' },
  { at: 1.6, who: [2], clip: 'Attack' },
  { at: 3.4, who: [0, 1, 2], clip: 'Skill', burst: true },
];
let beatT = 0, fired = new Set(), ambientT = 0;
function tickChoreo(dt){
  if (!current.length || current.some(c => c.pop < 1)) return;
  beatT += dt;
  if (beatT >= CYCLE){ beatT -= CYCLE; fired = new Set(); }
  BEATS.forEach((b, n) => {
    if (fired.has(n) || beatT < b.at) return;
    fired.add(n);
    b.who.forEach(i => {
      const c = current[i];
      if (!c?.axie || c.axie.disposed) return;
      if (c.weapon) playClip(c.axie, `${c.weapon}.${b.clip}`);
      if (b.burst) theme.burst(spotPos(i), i);
      else theme.strike?.(spotPos(i), i);
    });
  });
  ambientT -= dt;
  if (ambientT <= 0){ ambientT = 0.06; theme.ambient(spotPos(Math.floor(Math.random() * 3))); }
}
const spotPos = i => { const s = SPOTS[i] || SPOTS[1]; return new THREE.Vector3(s.x, PEDESTAL_H, s.z); };

// ---------- archetype effects ----------
let softTex = null;
function soft(){
  if (softTex) return softTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,255,255,.6)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return (softTex = new THREE.CanvasTexture(c));
}
// The stage canvas is transparent over the wooden backdrop, where additive
// light washes out -- lobby particles blend normally instead.
function sprite(color, size, opacity = 1){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft(), color, transparent: true, opacity, depthWrite: false }));
  s.scale.setScalar(size); s.userData.o = opacity;
  return s;
}
const basic = (color, opacity = 1, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, ...extra });
const fx = [];
function addFx(objs, dur, update){ objs.forEach(o => scene.add(o)); fx.push({ t: 0, dur, update, objs }); }
function tickFx(dt){
  for (let i = fx.length - 1; i >= 0; i--){
    const f = fx[i];
    f.t += dt;
    const k = f.t / f.dur;
    f.update(k, dt, f.t);
    if (k >= 1){
      f.objs.forEach(o => { scene.remove(o); o.traverse?.(n => { if (n.geometry) n.geometry.dispose(); if (n.material){ n.material.map = null; n.material.dispose(); } }); });
      fx.splice(i, 1);
    }
  }
}
function clearFx(){ fx.splice(0).forEach(f => f.objs.forEach(o => scene.remove(o))); }

// Rising motes over a pedestal (ambient).
function motes(p, colors, { size = 0.09, rise = 0.9, spread = 0.55, opacity = 0.9 } = {}){
  const col = colors[Math.floor(Math.random() * colors.length)];
  const m = sprite(col, size * (0.7 + Math.random() * 0.8) * 1.6, opacity);
  m.position.set(p.x + (Math.random() - 0.5) * spread * 2, p.y + Math.random() * 0.3, p.z + (Math.random() - 0.5) * spread);
  const v = rise * (0.6 + Math.random() * 0.6);
  addFx([m], 1.6, (k, dt) => { m.position.y += v * dt; m.material.opacity = m.userData.o * Math.sin(Math.PI * k); });
}
// An expanding ground ring on a pedestal top.
function ring(p, color, { r0 = 0.3, r1 = 1.2, dur = 0.8, opacity = 0.9 } = {}){
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), basic(color, opacity));
  m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.y + 0.02, p.z);
  addFx([m], dur, k => { m.scale.setScalar(r0 + (r1 - r0) * (1 - Math.pow(1 - k, 3))); m.material.opacity = opacity * (1 - k); });
}
// A burst of particles flying out of the Axie.
function burstParts(p, colors, { n = 16, speed = 1.6, up = 1.5, size = 0.12, gravity = 3, dur = 0.9 } = {}){
  const parts = [];
  for (let k = 0; k < n; k++){
    const s = sprite(colors[k % colors.length], size * (0.7 + Math.random() * 0.7) * 1.5, 1);
    s.position.set(p.x, p.y + 0.55, p.z);
    const a = Math.random() * Math.PI * 2, sp = speed * (0.5 + Math.random() * 0.7);
    s.userData.v = new THREE.Vector3(Math.cos(a) * sp, up * (0.5 + Math.random()), Math.sin(a) * sp * 0.6);
    parts.push(s);
  }
  addFx(parts, dur, (k, dt) => parts.forEach(s => { s.userData.v.y -= gravity * dt; s.position.addScaledVector(s.userData.v, dt); s.material.opacity = 1 - k; }));
}
// A soft cloud billowing up (poison, mist).
function cloud(p, colors, { n = 9, size = 0.7, dur = 1.8, opacity = 0.5 } = {}){
  const parts = [];
  for (let k = 0; k < n; k++){
    const s = sprite(colors[k % colors.length], size, Math.min(0.85, opacity * 1.5));
    s.position.set(p.x + (Math.random() - 0.5) * 0.8, p.y + 0.2 + Math.random() * 0.6, p.z + (Math.random() - 0.5) * 0.5);
    s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2);
    parts.push(s);
  }
  addFx(parts, dur, (k, dt) => parts.forEach(s => { s.position.addScaledVector(s.userData.v, dt); s.scale.setScalar(size * (0.4 + k * 1.1)); s.material.opacity = opacity * Math.sin(Math.PI * Math.min(1, k * 1.2)); }));
}
// A light pillar on a pedestal (heal, holy).
function pillar(p, color, { dur = 1.2, h = 3.2, r = 0.45 } = {}){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 24, 1, true), basic(color, 0));
  m.position.set(p.x, p.y + h / 2, p.z);
  addFx([m], dur, k => { m.material.opacity = 0.45 * Math.sin(Math.PI * k); m.scale.set(1 - k * 0.4, 1, 1 - k * 0.4); });
}
// Spikes bursting from the pedestal edge (thorns).
function spikes(p, color){
  const objs = [];
  for (let k = 0; k < 9; k++){
    const a = (k / 9) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 6), basic(k % 2 ? color : 0x5a7a2c));
    c.position.set(p.x + Math.cos(a) * 0.6, p.y, p.z + Math.sin(a) * 0.45);
    c.rotation.z = -Math.cos(a) * 0.4; c.rotation.x = Math.sin(a) * 0.4;
    objs.push(c);
  }
  addFx(objs, 1.3, k => { const g = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1; objs.forEach(c => { c.scale.set(1, Math.max(0.01, g), 1); c.position.y = p.y + 0.22 * g; }); });
}
// A dome/bubble over the Axie (barrier).
function dome(p, color){
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), basic(color, 0.35));
  const w = new THREE.Mesh(new THREE.IcosahedronGeometry(0.64, 1), basic(color, 0.6, { wireframe: true }));
  [m, w].forEach(o => o.position.set(p.x, p.y + 0.5, p.z));
  addFx([m, w], 1.6, (k, dt) => { const s = k < 0.2 ? k / 0.2 : 1; m.scale.setScalar(s); w.scale.setScalar(s); w.rotation.y += dt; const o = k > 0.7 ? (1 - k) / 0.3 : 1; m.material.opacity = 0.25 * o; w.material.opacity = 0.6 * o; });
}
// Arrows dropping onto the stone in front of the pedestal (volley).
function arrows(p){
  const objs = [];
  for (let k = 0; k < 6; k++){
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5), basic(0x8a5a2e));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), basic(0xf4f8ff));
    tip.position.y = -0.3; tip.rotation.x = Math.PI;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.12), basic(0xffd76a));
    fl.position.y = 0.22;
    g.add(shaft, tip, fl);
    g.userData = { land: new THREE.Vector3(p.x + (Math.random() - 0.5) * 1.1, 0.2, p.z + 0.55 + Math.random() * 0.4), delay: k * 0.07 };
    g.rotation.z = 0.25; g.visible = false;
    objs.push(g);
  }
  addFx(objs, 1.8, (k, dt, t) => objs.forEach(g => {
    const q = (t - g.userData.delay) / 0.22;
    if (q < 0) return;
    g.visible = true;
    const sky = g.userData.land.clone().add(new THREE.Vector3(-0.6, 3, 0));
    g.position.lerpVectors(sky, g.userData.land, Math.min(1, q));
    g.children.forEach(c => { c.material.opacity = k > 0.75 ? (1 - k) / 0.25 : 1; });
  }));
}
// A floating emoji (skull for Deathmark).
function emoji(p, char){
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d'); g.font = '76px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(char, 48, 52);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.position.set(p.x, p.y + 1.45, p.z);
  addFx([s], 1.5, k => { s.scale.setScalar(0.45 * Math.min(1, k * 5)); s.position.y = p.y + 1.45 + Math.sin(k * 8) * 0.04; s.material.opacity = k > 0.75 ? (1 - k) / 0.25 : 1; });
}

// One entry per archetype: ambient particles, the wave's per-strike accent
// and the group beat's signature burst -- each matching what the team does.
const THEMES = {
  bleed: {
    ambient: p => motes(p, [0xff4a3a, 0xb3261e], { size: 0.08 }),
    strike: p => burstParts(p, [0xd02a20, 0x8b1a1a], { n: 8, gravity: 5 }),
    burst: p => { ring(p, 0xff3b30); burstParts(p, [0xff4a3a, 0xa11616, 0xffffff], { n: 18, gravity: 5 }); },
  },
  poison: {
    ambient: p => motes(p, [0x7dff4a, 0x4fae2e], { size: 0.1, rise: 0.5 }),
    strike: p => cloud(p, [0x6fd048, 0x2f6e1f], { n: 4, size: 0.5, dur: 1.2 }),
    burst: p => { cloud(p, [0x6fd048, 0x4fae2e, 0x7a4fb0], { n: 10 }); ring(p, 0x7dff4a); },
  },
  damage: {
    ambient: p => motes(p, [0xffd76a, 0xffffff], { size: 0.07, rise: 1.2 }),
    strike: p => burstParts(p, [0xfff0c0, 0xffd76a], { n: 10 }),
    burst: (p, i) => { if (i === 1) arrows(p); ring(p, 0xffd76a); burstParts(p, [0xfff0c0, 0xffd76a], { n: 14 }); },
  },
  heal: {
    ambient: p => motes(p, [0x9dffb0, 0xfff6b0], { size: 0.09, rise: 0.8 }),
    strike: p => burstParts(p, [0x9dffb0, 0xfff6b0], { n: 8, gravity: -0.5, up: 1 }),
    burst: p => { pillar(p, 0xc8ffb0); ring(p, 0x9be6a8); burstParts(p, [0x9dffb0, 0xfff6b0], { n: 14, gravity: -0.8, up: 1.2 }); },
  },
  thorns: {
    ambient: p => motes(p, [0xa6d65a, 0x7c9a3c], { size: 0.08, rise: 0.6 }),
    strike: p => burstParts(p, [0xa6d65a, 0x5a7a2c], { n: 8 }),
    burst: p => { spikes(p, 0x7c9a3c); ring(p, 0xa6d65a); },
  },
  mirage: {
    ambient: p => motes(p, [0xdff4ff, 0x9fd8ff], { size: 0.14, rise: 0.4, opacity: 0.6 }),
    strike: p => cloud(p, [0xeaf6ff, 0xbfe6ff], { n: 4, size: 0.55, dur: 1, opacity: 0.45 }),
    burst: p => { cloud(p, [0xeaf6ff, 0xbfe6ff], { n: 9, opacity: 0.5 }); ring(p, 0xdff4ff, { r1: 1.5 }); },
  },
  bastion: {
    ambient: p => motes(p, [0x6fe3ff, 0x2f9bff], { size: 0.08 }),
    strike: p => ring(p, 0x5fd0ff, { r1: 0.9 }),
    burst: p => { dome(p, 0x6fe3ff); ring(p, 0x2f9bff); },
  },
  deathmark: {
    ambient: p => motes(p, [0xb58aff, 0x6a3fa0], { size: 0.09 }),
    strike: p => burstParts(p, [0xb58aff, 0x3b1f4f], { n: 8 }),
    burst: (p, i) => { ring(p, 0x9f7aea); cloud(p, [0x2a1840, 0x6a3fa0], { n: 6, size: 0.55, dur: 1.4, opacity: 0.45 }); if (i === 1) emoji(p, '💀'); },
  },
  toxic: {
    ambient: p => motes(p, [0xb8ff7a, 0x5fa84a], { size: 0.11, rise: 0.5 }),
    strike: p => cloud(p, [0x8cff5a, 0x3f9a24], { n: 5, size: 0.5, dur: 1.2 }),
    burst: p => { cloud(p, [0x8cff5a, 0x5fa84a, 0x3f9a24], { n: 12, size: 0.8 }); ring(p, 0xb8ff7a); },
  },
  hybrid: {
    ambient: p => motes(p, Math.random() < 0.5 ? [0xff4a3a] : [0x7dff4a], { size: 0.09 }),
    strike: (p, i) => i % 2 ? cloud(p, [0x6fd048, 0x2f6e1f], { n: 4, size: 0.5, dur: 1.1 }) : burstParts(p, [0xd02a20, 0x8b1a1a], { n: 8, gravity: 5 }),
    burst: p => { ring(p, 0xff3b30); ring(p, 0x7dff4a, { r1: 1.6, dur: 1 }); cloud(p, [0x6fd048, 0xa11616], { n: 7, size: 0.6 }); },
  },
};
function themeFor(id, color){
  if (THEMES[id]) return THEMES[id];
  const c = new THREE.Color(color || '#e8893a').getHex();
  return {
    ambient: p => motes(p, [c, 0xffffff], { size: 0.08 }),
    strike: p => burstParts(p, [c, 0xffffff], { n: 8 }),
    burst: p => { ring(p, c); burstParts(p, [c, 0xffffff], { n: 14 }); },
  };
}
let theme = themeFor('custom');
// Dev-only hook for browser tests: fire the group beat's burst now.
if (import.meta.env.DEV && typeof window !== 'undefined') window.__stageBurst = () => [0, 1, 2].forEach(i => theme.burst(spotPos(i), i));

const easeBack = t => { const s = 1.6; t -= 1; return t * t * ((s + 1) * t + s) + 1; };

// Pause rendering while the screen isn't shown (saves battery mid-duel).
export function setStageActive(on){ active = on; if (on && clock) clock.getDelta(); }

async function createAxie(pick){
  const mixer = await ensureMixer();
  const axie = await mixer.create({ descriptor: buildDescriptor(pick.classId, { evolved: pick.evolved }), quality: 'balanced', artMode: 'faithful', strict: true });
  await Promise.race([equipSetWeapon(axie, pick.setId, pick.evolved), new Promise(r => setTimeout(r, 6000))]);
  return axie;
}

// Shows a squad (array of 3 picks) on the pedestals. Out-of-order results
// (fast switching between teams) are discarded.
export async function showTeam(picks, themeId = 'custom', color = null){
  const id = ++requestId;
  // The Tank takes the centre pedestal, its escorts either side.
  const tank = picks.find(p => p.isTank);
  if (tank){ const rest = picks.filter(p => p !== tank); picks = [rest[0], tank, ...rest.slice(1)].filter(Boolean); }
  const made = await Promise.all(picks.map(p => createAxie(p).catch(err => { console.error('stage axie failed', err); return null; })));
  if (id !== requestId){ made.forEach(a => a?.dispose()); return; }
  current.forEach(c => { if (c.axie){ scene.remove(c.axie.wrapper); c.axie.dispose(); } });
  current = made.map((axie, i) => {
    if (axie){
      const s = SPOTS[i] || SPOTS[1];
      axie.wrapper.position.set(s.x, PEDESTAL_H, s.z);
      axie.wrapper.rotation.y = s.turn;
      axie.wrapper.scale.setScalar(0.01);
      scene.add(axie.wrapper);
      try { axie.setLocomotion('idle'); } catch { /* ignore */ }
    }
    return { axie, weapon: axie ? weaponPrefix(picks[i].setId) : null, pop: 0 };
  });
  theme = themeFor(themeId, color);
  clearFx();
  beatT = 0; fired = new Set();
  // Every Axie shown here also gets its list portrait cached for free.
  made.forEach((axie, i) => { if (axie) cachePortrait(picks[i], axie); });
}

// ---------- portraits for the team list ----------
const portraitCache = new Map(); // key -> data URL
const pending = new Map(); // key -> Promise
const keyOf = p => `${p.classId}|${p.setId}|${p.evolved ? 1 : 0}`;
let queue = Promise.resolve();

function cachePortrait(pick, axie){
  const key = keyOf(pick);
  if (portraitCache.has(key)) return;
  const url = renderPortrait(axie, renderer, 96);
  if (url) portraitCache.set(key, url);
}

export function cachedPortrait(pick){ return portraitCache.get(keyOf(pick)) || null; }

// Renders one portrait off-stage (one at a time, so the list fills in
// without a burst of downloads); resolves to a data URL or null.
export function portraitFor(pick){
  const key = keyOf(pick);
  if (portraitCache.has(key)) return Promise.resolve(portraitCache.get(key));
  if (pending.has(key)) return pending.get(key);
  const job = queue.then(async () => {
    if (portraitCache.has(key)) return portraitCache.get(key);
    try {
      const axie = await createAxie(pick);
      const url = renderPortrait(axie, renderer, 96);
      axie.dispose();
      if (url) portraitCache.set(key, url);
      return url;
    } catch { return null; }
  });
  queue = job.catch(() => null);
  pending.set(key, job);
  return job;
}
