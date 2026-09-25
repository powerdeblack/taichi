// Team-select stage: the chosen squad's three Axies standing on carved stone
// pedestals, in 3D, with their class colours, set weapons and Mystic glow
// (see axieLook.js). Also renders small 3D portraits for the team list.
import * as THREE from 'three';
import { createAxieMixer3D } from '@jaatster/threejs-axie-mixer3d-public';
import { buildDescriptor, equipSetWeapon, weaponPrefix, playClip, renderPortrait } from './axieLook.js';

let renderer, scene, camera, clock, canvasEl;
let mixerPromise = null;
let current = []; // { axie, weapon, timer, step, pop }
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
  current.forEach((c, i) => {
    if (!c.axie || c.axie.disposed) return;
    c.axie.update(dt);
    // Pop-in when a team is shown, then a staggered weapon showcase.
    if (c.pop < 1){ c.pop = Math.min(1, c.pop + dt * 3.2); c.axie.wrapper.scale.setScalar(AXIE_SCALE * easeBack(c.pop)); }
    c.timer -= dt;
    if (c.timer <= 0 && c.weapon){
      c.timer = 5.5 + i * 0.4;
      playClip(c.axie, `${c.weapon}.${c.step++ % 2 ? 'Skill' : 'Attack'}`);
    }
  });
  renderer.render(scene, camera);
}
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
export async function showTeam(picks){
  const id = ++requestId;
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
    return { axie, weapon: axie ? weaponPrefix(picks[i].setId) : null, timer: 1.2 + i * 0.9, step: 0, pop: 0 };
  });
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
