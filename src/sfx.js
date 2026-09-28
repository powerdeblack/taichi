// Procedural sound effects via the Web Audio API -- no audio files, every
// sound is synthesized on the fly from oscillators and filtered noise.
// Browsers only allow audio after a user gesture, so the context is created
// lazily by unlockAudio() on the first tap/click/key.

const MUTE_KEY = 'axieDuelMuted';
const MASTER_VOLUME = 0.6;

// Mix: every sound goes into a bus (combat, ui, ambience) -> the master
// gain -> a compressor that glues busy moments together and stops pile-ups
// from clipping. Combat also feeds a small procedural hall reverb, so hits
// sound like they happen in a room, not inside the speaker.
let ctx = null;
let master = null, comp = null, reverb = null, reverbSend = null;
let bus = {};
let noiseBuf = null;
let muted = readMuted();
let pan = 0;          // stereo position for the next sounds (-1 left .. 1 right)
let target = 'combat'; // bus for the next sounds

function readMuted(){
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

// A short, dark, decaying noise tail -- a snowy stone hall.
function hallImpulse(seconds = 1.6){
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++){
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

export function unlockAudio(){
  if (!ctx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(comp).connect(ctx.destination);
    reverb = ctx.createConvolver();
    reverb.buffer = hallImpulse();
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3200;
    reverb.connect(tone).connect(wet).connect(master);
    reverbSend = ctx.createGain(); reverbSend.gain.value = 1;
    reverbSend.connect(reverb);
    for (const [name, vol] of [['combat', 1], ['ui', 0.7], ['ambience', 0.5], ['music', 0.3]]){
      bus[name] = ctx.createGain();
      bus[name].gain.value = vol;
      bus[name].connect(master);
    }
    bus.combat.connect(reverbSend);
    bus.music.connect(reverbSend);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function isMuted(){ return muted; }

// For music.js: the shared context, its music bus and the noise buffer.
export function audioGraph(){ return ctx && ctx.state !== 'closed' ? { ctx, out: bus.music, noiseBuf } : null; }

export function toggleMute(){
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* storage blocked */ }
  if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.02);
  return muted;
}

function ready(){
  return ctx && ctx.state === 'running' && !muted;
}

// Plays `fn`'s sounds panned to a screen position (0 = left edge, 1 = right)
// -- a hit on the right of the arena comes from the right speaker.
export function at(screenX, fn){
  const prev = pan;
  pan = Math.max(-0.8, Math.min(0.8, (screenX - 0.5) * 1.6));
  try { fn(); } finally { pan = prev; }
}
function onBus(name, fn){ const prev = target; target = name; try { fn(); } finally { target = prev; } }

// Every sound ends here: its own panner, then the current bus.
function out(node){
  if (pan && ctx.createStereoPanner){
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node.connect(p).connect(bus[target]);
  } else node.connect(bus[target]);
}

// Small random pitch/level drift so repeated hits never sound machine-made.
const vary = (x, amt) => x * (1 + (Math.random() * 2 - 1) * amt);

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
  osc.detune.value = detune + (target === 'combat' ? (Math.random() * 2 - 1) * 35 : 0);
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, start + attack + decay);
  env(g, start, vary(peak, 0.08), attack, decay);
  osc.connect(g);
  out(g);
  osc.start(start);
  osc.stop(start + attack + decay + 0.05);
}

function noise({ t = 0, peak = 0.3, attack = 0.003, decay = 0.15, filter = 'lowpass', freq = 2000, freqEnd, q = 1 }){
  const start = ctx.currentTime + t;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = vary(1, 0.06);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, start);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, start + attack + decay);
  const g = ctx.createGain();
  env(g, start, vary(peak, 0.08), attack, decay);
  src.connect(f).connect(g);
  out(g);
  src.start(start, Math.random() * 0.5);
  src.stop(start + attack + decay + 0.05);
}

// ---- ambience ----
// A low wind bed under the whole duel; it swells when the Blizzard hits
// and ducks under big moments (knockouts, the result sting).
let amb = null;
export function startAmbience(){
  if (!ctx || amb) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.8;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(f.frequency);
  const g = ctx.createGain(); g.gain.value = 0.0001;
  g.gain.setTargetAtTime(0.07, ctx.currentTime, 1.2);
  src.connect(f).connect(g).connect(bus.ambience);
  src.start(); lfo.start();
  amb = { src, lfo, g };
}
export function stopAmbience(){
  if (!amb) return;
  const a = amb; amb = null;
  a.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
  setTimeout(() => { try { a.src.stop(); a.lfo.stop(); } catch { /* already stopped */ } }, 1500);
}
export function setStorm(on){ if (amb) amb.g.gain.setTargetAtTime(on ? 0.2 : 0.07, ctx.currentTime, 1.5); }
function duck(seconds = 1.2){
  if (!bus.ambience) return;
  const now = ctx.currentTime;
  for (const [name, low, full] of [['ambience', 0.12, 0.5], ['music', 0.1, 0.3]]){
    const g = bus[name].gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(low, now, 0.05);
    g.setTargetAtTime(full, now + seconds, 0.6);
  }
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
  duck(1.6);
  tone({ type: 'sine', freq: 110, freqEnd: 30, peak: 0.6, decay: 0.7 });
  noise({ peak: 0.35, decay: 0.5, filter: 'lowpass', freq: 800, freqEnd: 80 });
  tone({ type: 'square', freq: 220, freqEnd: 55, t: 0.05, peak: 0.06, decay: 0.5 });
}

export function playNoTarget(){
  if (!ready()) return;
  onBus('ui', () => {
    tone({ type: 'square', freq: 180, peak: 0.06, decay: 0.08 });
    tone({ type: 'square', freq: 140, t: 0.09, peak: 0.06, decay: 0.1 });
  });
}

export function playSelect(){
  if (!ready()) return;
  onBus('ui', () => tone({ type: 'sine', freq: 1200, peak: 0.06, attack: 0.003, decay: 0.05 }));
}

// A soft wooden click for menu buttons.
export function playClick(){
  if (!ready()) return;
  onBus('ui', () => {
    tone({ type: 'triangle', freq: 660, freqEnd: 420, peak: 0.07, attack: 0.002, decay: 0.05 });
    noise({ peak: 0.05, decay: 0.03, filter: 'bandpass', freq: 2400, q: 3 });
  });
}

// One heartbeat ("lub-dub"), played while your Tank is in danger.
export function playHeartbeat(){
  if (!ready()) return;
  onBus('ui', () => {
    tone({ type: 'sine', freq: 62, freqEnd: 44, peak: 0.28, attack: 0.01, decay: 0.12 });
    tone({ type: 'sine', freq: 56, freqEnd: 40, t: 0.2, peak: 0.2, attack: 0.01, decay: 0.14 });
  });
}

export function playVictory(){
  if (!ready()) return;
  duck(3);
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
    tone({ type: 'triangle', freq: f, t: i * 0.12, peak: 0.18, attack: 0.01, decay: 0.45 });
    tone({ type: 'sine', freq: f * 2, t: i * 0.12, peak: 0.05, attack: 0.01, decay: 0.3 });
  });
}

export function playDefeat(){
  if (!ready()) return;
  duck(3);
  [392, 349.23, 311.13, 261.63].forEach((f, i) =>
    tone({ type: 'triangle', freq: f, t: i * 0.22, peak: 0.16, attack: 0.02, decay: 0.55 }));
}
