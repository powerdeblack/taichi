// How an Axie looks, built from the Axie Mixer 3D toolkit's own catalog:
// its class body colour, its card set's weapon, the Mystic (glowing,
// particle) version of its parts when Evolved, the animation clips each
// card plays, and a rendered 3D portrait. Shared by the battle board
// (board3d.js) and the team-screen preview (axie3d.js).
import * as THREE from 'three';

const NEED_TYPES = ['eye', 'mouth', 'ear', 'horn', 'back', 'tail'];
// Our roster uses 'Aqua'; the asset pack's class id is 'Aquatic'.
const CLASS_ALIAS = { Aqua: 'Aquatic' };

// Index into the toolkit's colour catalog (manifest.creator.colorVariants):
// the classic colour of each class -- orange Beast, green Plant, blue
// Aqua, red Bug, pink Bird, purple Reptile.
const CLASS_COLOR_VARIANT = { Beast: 3, Plant: 8, Aquatic: 15, Bug: 20, Bird: 26, Reptile: 30 };

// One weapon per card set; its clips (Sword.Attack, Bow.Skill...) drive the
// casting animations. Evolved Axies carry the level-3 model.
const SET_WEAPON = { warrior: 'Sword', ranger: 'Bow', mage: 'Staff', rogue: 'Dagger', priest: 'Tome', shaman: 'Mala' };

// Evolved = Mystic skin (S01): glowing material and particle add-ons.
export function buildDescriptor(classId, { evolved = false } = {}){
  const cls = CLASS_ALIAS[classId] || classId;
  return {
    colorVariant: CLASS_COLOR_VARIANT[cls] ?? 0,
    body: 'normal',
    parts: NEED_TYPES.map(type => ({ type, skin: evolved ? 1 : 0, class: cls, variant: 2, level: 1 })),
  };
}

export function weaponFor(setId, evolved = false){
  const w = SET_WEAPON[setId];
  if (!w) return null;
  return evolved ? `${w.toLowerCase()}-l3` : w;
}

export function weaponPrefix(setId){ return SET_WEAPON[setId] || null; }

// Equip without ever letting a weapon problem break the Axie itself.
export async function equipSetWeapon(axie, setId, evolved){
  const weapon = weaponFor(setId, evolved);
  if (!weapon) return false;
  try { return await axie.equipWeapon(weapon); } catch { return false; }
}

// Plays a one-shot clip on top of movement (the squad keeps walking while
// it swings); falls back silently when a clip is missing.
export function playClip(axie, name, { timeScale = 1 } = {}){
  if (!axie || axie.disposed || !axie.animationNames.includes(name)) return false;
  try { return axie.playAnimation(name, { transition: 0.12, lockLocomotion: true, loop: false, restart: true, timeScale }); }
  catch { return false; }
}

// A front-facing portrait of an assembled Axie, as a data URL for <img>.
// The model is briefly scaled up so it fills the frame, then restored.
export function renderPortrait(axie, renderer, size = 96){
  try {
    const rt = new THREE.WebGLRenderTarget(size, size);
    const scale = axie.wrapper.scale.x;
    axie.wrapper.scale.setScalar(1.15);
    axie.renderAvatar(renderer, rt, {
      width: size, height: size, mode: 'complete-character',
      viewCenter: new THREE.Vector3(0, 0.68, 0), viewDirection: new THREE.Vector3(0, -0.25, -1),
    });
    axie.wrapper.scale.setScalar(scale);
    const px = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    rt.dispose();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const row = size * 4;
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * row, (size - y) * row), y * row);
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  } catch {
    return null;
  }
}
