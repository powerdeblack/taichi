// Procedural sound effects via the Web Audio API -- no audio files, every
// sound is synthesized on the fly from oscillators and filtered noise.
// Browsers only allow audio after a user gesture, so the context is created
// lazily by unlockAudio() on the first tap/click/key.

const MUTE_KEY = 'axieDuelMuted';
const MASTER_VOLUME = 0.55;

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = readMuted();

function readMuted(){
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function unlockAudio(){
  if (!ctx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function isMuted(){ return muted; }

export function toggleMute(){
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* storage blocked */ }
  if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.02);
  return muted;
}

function ready(){
  return ctx && ctx.state === 'running' && !muted;
}

// ---- building blocks ----

function env(gainNode, t, peak, attack, decay){
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone({ type = 'sine', freq, freqEnd, t = 0, peak = 0.3, attack = 0.005, decay = 0.2, detune = 0 }){
  const start = ctx.currentTime + t;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, start + attack + decay);
  env(g, start, peak, attack, decay);
  osc.connect(g).connect(master);
  osc.start(start);
  osc.stop(start + attack + decay + 0.05);
}

function noise({ t = 0, peak = 0.3, attack = 0.003, decay = 0.15, filter = 'lowpass', freq = 2000, freqEnd, q = 1 }){
  const start = ctx.currentTime + t;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, start);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, start + attack + decay);
  const g = ctx.createGain();
  env(g, start, peak, attack, decay);
  src.connect(f).connect(g).connect(master);
  src.start(start, Math.random() * 0.5);
  src.stop(start + attack + decay + 0.05);
}

// ---- attack flavors (by card set) ----

function slash(t){
  noise({ t, peak: 0.35, decay: 0.12, filter: 'highpass', freq: 3500, freqEnd: 1200, q: 0.7 });
}

function arrow(t){
  noise({ t, peak: 0.22, attack: 0.02, decay: 0.16, filter: 'bandpass', freq: 900, freqEnd: 4200, q: 3 });
}

function magic(t){
  tone({ type: 'triangle', freq: 520, freqEnd: 1560, t, peak: 0.14, decay: 0.22 });
  tone({ type: 'sine', freq: 780, freqEnd: 2340, t: t + 0.03, peak: 0.1, decay: 0.2, detune: 8 });
  noise({ t, peak: 0.08, decay: 0.2, filter: 'bandpass', freq: 3000, q: 4 });
}

const MAGIC_SETS = new Set(['mage', 'priest', 'shaman']);

function impact(t, dmg){
  const heavy = Math.min(1, Math.max(0, (dmg - 6) / 14));
  tone({ type: 'sine', freq: 170 - heavy * 50, freqEnd: 45, t, peak: 0.45 + heavy * 0.3, decay: 0.18 + heavy * 0.15 });
  noise({ t, peak: 0.25 + heavy * 0.2, decay: 0.08 + heavy * 0.1, filter: 'lowpass', freq: 1800, freqEnd: 300 });
}

export function playAttack(card, dmg){
  if (!ready()) return;
  let lead = 0;
  if (card.setId === 'ranger'){
    const shots = card.effect === 'multi' ? 3 : 1;
    for (let i = 0; i < shots; i++) arrow(i * 0.07);
    lead = 0.12 + (shots - 1) * 0.07;
  } else if (MAGIC_SETS.has(card.setId)){
    magic(0);
    lead = 0.12;
  } else {
    slash(0);
    lead = 0.05;
  }
  impact(lead, dmg);
  if (card.effect === 'bleed') playBleed(lead + 0.08);
  if (card.effect === 'poison') playPoison(lead + 0.08);
}

// ---- casting ----

// A rising shimmer while the card charges on its Axie.
export function playCastStart(card){
  if (!ready()) return;
  const base = card.role === 'attack' ? 220 : 330;
  tone({ type: 'triangle', freq: base, freqEnd: base * 3, peak: 0.07, attack: 0.3, decay: 0.9 });
  tone({ type: 'sine', freq: base * 1.5, freqEnd: base * 4, peak: 0.05, attack: 0.4, decay: 0.8, detune: 7 });
  noise({ peak: 0.04, attack: 0.5, decay: 0.6, filter: 'bandpass', freq: 800, freqEnd: 3000, q: 3 });
}

// The card leaving its Axie toward the target.
export function playLaunch(card){
  if (!ready()) return;
  if (card.setId === 'ranger') arrow(0);
  else if (MAGIC_SETS.has(card.setId)) tone({ type: 'sine', freq: 900, freqEnd: 300, peak: 0.1, decay: 0.35 });
  noise({ peak: 0.14, attack: 0.05, decay: 0.45, filter: 'bandpass', freq: 400, freqEnd: 1600, q: 1.5 });
}

// ---- support / status ----

export function playHeal(){
  if (!ready()) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone({ type: 'sine', freq: f, t: i * 0.07, peak: 0.16, attack: 0.02, decay: 0.35 }));
  tone({ type: 'triangle', freq: 2093, t: 0.28, peak: 0.05, attack: 0.01, decay: 0.4 });
}

export function playRegenTick(){
  if (!ready()) return;
  tone({ type: 'sine', freq: 880, freqEnd: 1320, peak: 0.08, attack: 0.02, decay: 0.2 });
}

export function playShield(){
  if (!ready()) return;
  tone({ type: 'triangle', freq: 620, peak: 0.18, decay: 0.45 });
  tone({ type: 'triangle', freq: 931, peak: 0.12, decay: 0.4, detune: 6 });
  tone({ type: 'sine', freq: 1480, peak: 0.06, decay: 0.3 });
  noise({ peak: 0.12, decay: 0.06, filter: 'bandpass', freq: 5000, q: 2 });
}

export function playDebuff(){
  if (!ready()) return;
  tone({ type: 'sawtooth', freq: 440, freqEnd: 150, peak: 0.1, decay: 0.35 });
  tone({ type: 'sawtooth', freq: 452, freqEnd: 146, peak: 0.08, decay: 0.35 });
}

export function playDodge(){
  if (!ready()) return;
  noise({ peak: 0.2, attack: 0.03, decay: 0.18, filter: 'bandpass', freq: 600, freqEnd: 3000, q: 2 });
}

export function playPoison(t = 0){
  if (!ready()) return;
  for (let i = 0; i < 3; i++){
    const f = 220 + Math.random() * 180;
    tone({ type: 'sine', freq: f, freqEnd: f * 1.8, t: t + i * 0.08, peak: 0.1, attack: 0.01, decay: 0.09 });
  }
}

export function playBleed(t = 0){
  if (!ready()) return;
  noise({ t, peak: 0.2, decay: 0.14, filter: 'lowpass', freq: 900, freqEnd: 150 });
  tone({ type: 'sine', freq: 120, freqEnd: 60, t, peak: 0.15, decay: 0.12 });
}

// A rising howl of wind when the Blizzard starts.
export function playBlizzard(){
  if (!ready()) return;
  noise({ peak: 0.25, attack: 0.6, decay: 1.6, filter: 'bandpass', freq: 300, freqEnd: 1400, q: 2 });
  noise({ t: 0.4, peak: 0.18, attack: 0.5, decay: 1.4, filter: 'bandpass', freq: 600, freqEnd: 2400, q: 3 });
}

export function playKO(){
  if (!ready()) return;
  tone({ type: 'sine', freq: 110, freqEnd: 30, peak: 0.6, decay: 0.7 });
  noise({ peak: 0.35, decay: 0.5, filter: 'lowpass', freq: 800, freqEnd: 80 });
  tone({ type: 'square', freq: 220, freqEnd: 55, t: 0.05, peak: 0.06, decay: 0.5 });
}

export function playNoTarget(){
  if (!ready()) return;
  tone({ type: 'square', freq: 180, peak: 0.06, decay: 0.08 });
  tone({ type: 'square', freq: 140, t: 0.09, peak: 0.06, decay: 0.1 });
}

export function playSelect(){
  if (!ready()) return;
  tone({ type: 'sine', freq: 1200, peak: 0.06, attack: 0.003, decay: 0.05 });
}

export function playVictory(){
  if (!ready()) return;
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
    tone({ type: 'triangle', freq: f, t: i * 0.12, peak: 0.18, attack: 0.01, decay: 0.45 });
    tone({ type: 'sine', freq: f * 2, t: i * 0.12, peak: 0.05, attack: 0.01, decay: 0.3 });
  });
}

export function playDefeat(){
  if (!ready()) return;
  [392, 349.23, 311.13, 261.63].forEach((f, i) =>
    tone({ type: 'triangle', freq: f, t: i * 0.22, peak: 0.16, attack: 0.02, decay: 0.55 }));
}
