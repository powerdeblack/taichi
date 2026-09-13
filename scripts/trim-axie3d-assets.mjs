// Regenerates public/assets/axie3d/ from an installed
// @jaatster/threejs-axie-mixer3d-public package: keeps only the 36 parts
// (6 classes x eye/mouth/ear/horn/back/tail, variant 2/skin 0/level 1) this
// game's roster needs, the shared "normal" body, and its "lite" animation
// set -- about 12MB instead of the full pack's 512MB. Run after `npm install
// github:jaatster/threejs-axie-mixer3d-public` with:
//   node scripts/trim-axie3d-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const PKG = path.join(ROOT, 'node_modules/@jaatster/threejs-axie-mixer3d-public');
const SRC_ASSETS = path.join(PKG, 'public/assets/axie');
const OUT_ASSETS = path.join(ROOT, 'public/assets/axie3d');

const manifest = JSON.parse(fs.readFileSync(path.join(SRC_ASSETS, 'manifest.json'), 'utf8'));
const { bodies, parts, textures, materials, shaders } = manifest.assets;

const NEED_TYPES = ['eye', 'mouth', 'ear', 'horn', 'back', 'tail'];
const CLASSES = ['Aquatic', 'Beast', 'Bird', 'Bug', 'Plant', 'Reptile'];

const usedParts = {};
const usedMaterials = {};
const usedTextures = {};
const usedShaders = {};
const filesToCopy = new Set();

function copyLater(url) {
  if (!url) return;
  filesToCopy.add(url.replace(/^\/assets\/axie\//, ''));
}

function pullMaterial(materialId) {
  if (!materialId || usedMaterials[materialId]) return;
  const mat = materials[materialId];
  if (!mat) { console.warn('missing material', materialId); return; }
  usedMaterials[materialId] = mat;
  if (mat.shaderId && shaders[mat.shaderId]) usedShaders[mat.shaderId] = shaders[mat.shaderId];
  for (const texId of Object.values(mat.textures || {})) {
    if (usedTextures[texId]) continue;
    const tex = textures[texId];
    if (!tex) { console.warn('missing texture', texId); continue; }
    usedTextures[texId] = tex;
    // Copy every variant -- which one the runtime requests for a given
    // texture depends on its role/quality profile, not just a fixed choice.
    for (const file of Object.values(tex.variants || {})) copyLater(file);
  }
}

for (const cls of CLASSES) {
  for (const type of NEED_TYPES) {
    const key = Object.keys(parts).find((k) => {
      const d = parts[k].descriptor;
      return d.class === cls && d.type === type && d.variant === 2 && d.skin === 0 && d.level === 1;
    });
    if (!key) { console.warn('MISSING PART', cls, type); continue; }
    const entry = parts[key];
    usedParts[key] = entry;
    for (const rig of entry.rigs) {
      for (const lod of rig.lods) copyLater(lod.url);
      pullMaterial(rig.materialId);
    }
  }
}

const body = bodies.normal;
const usedBodies = { normal: body };
copyLater(body.restPoseUrl);
for (const lod of body.lods) copyLater(lod.url);
pullMaterial(body.materialId);

// AxiePlayableCharacter keeps both animation dictionaries loaded regardless
// of which one actually plays, so both sets' indexes and payloads are needed.
for (const setName of Object.keys(body.animations)) {
  const animUrl = body.animations[setName].url;
  copyLater(animUrl);
  const animIndex = JSON.parse(fs.readFileSync(path.join(SRC_ASSETS, animUrl.replace(/^\/assets\/axie\//, '')), 'utf8'));
  for (const clip of animIndex.clips || []) {
    if (clip.payloadUrl) copyLater(clip.payloadUrl);
  }
}

// The runtime validates the manifest's structural counts against the full
// official catalog (8 bodies, 576 parts, 1088 textures, 1001 materials, 13
// shaders, 46 addons) unconditionally -- it rejects a trimmed manifest even
// though it only ever *fetches* the handful of files a given descriptor
// needs. So we ship the manifest verbatim and trim only the asset files on
// disk: unused entries point at files that simply never get requested.
fs.mkdirSync(OUT_ASSETS, { recursive: true });
fs.copyFileSync(path.join(SRC_ASSETS, 'manifest.json'), path.join(OUT_ASSETS, 'manifest.json'));
void usedParts; void usedBodies; void usedMaterials; void usedTextures; void usedShaders;

let totalBytes = 0;
let copied = 0;
for (const rel of filesToCopy) {
  const src = path.join(SRC_ASSETS, rel);
  const dst = path.join(OUT_ASSETS, rel);
  if (!fs.existsSync(src)) { console.warn('SRC MISSING', rel); continue; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  totalBytes += fs.statSync(src).size;
  copied++;
}

for (const f of ['RIGHTS.md', 'THIRD_PARTY_NOTICES.md']) {
  fs.copyFileSync(path.join(PKG, f), path.join(OUT_ASSETS, f));
}

console.log('files copied:', copied);
console.log('total copied MB:', (totalBytes / 1024 / 1024).toFixed(2));
console.log('classes covered:', Object.keys(usedParts).length, '/', CLASSES.length * NEED_TYPES.length);
