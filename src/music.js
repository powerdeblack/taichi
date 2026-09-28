// Procedural soundtrack (Web Audio, no files): a calm, dreamy loop for the
// lobby and a driving one for battles, both generated live from a chord
// progression so they never repeat exactly. Runs on sfx.js's music bus, so
// it follows the mute button, the compressor and the ducking under big
// moments. `setIntensity(0..1)` thickens the battle track (drums, hats,
// faster arpeggio) for the Blizzard and close finishes.
import { audioGraph } from './sfx.js';

const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz
const TRACKS = {
  // Am - F - C - G, slow and airy.
  lobby: { bpm: 84, barsPerChord: 2, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], drums: false },
  // Am - G - F - E: the classic heroic descent.
  battle: { bpm: 112, barsPerChord: 1, chords: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]], drums: true },
};

let current = null;     // { name, track, gain, nextBeat, beat }
let timer = null;
let intensity = 0;

export function setIntensity(x){ intensity = Math.max(0, Math.min(1, x)); }

export function play(name){
  const g = audioGraph();
  if (!g) return;
  if (current && current.name === name) return;
  stop(0.8);
  const gain = g.ctx.createGain();
  gain.gain.value = 0.0001;
  gain.gain.setTargetAtTime(1, g.ctx.currentTime + 0.1, 0.8);
  gain.connect(g.out);
  current = { name, track: TRACKS[name], gain, nextBeat: g.ctx.currentTime + 0.15, beat: 0 };
  if (!timer) timer = setInterval(schedule, 60);
}

export function stop(fade = 1){
  if (!current) return;
  const g = audioGraph();
  const c = current;
  current = null;
  if (g){
    c.gain.gain.cancelScheduledValues(g.ctx.currentTime);
    c.gain.gain.setTargetAtTime(0.0001, g.ctx.currentTime, fade / 3);
    setTimeout(() => c.gain.disconnect(), fade * 1000 + 800);
  }
}

// Look-ahead scheduler: queues every beat that starts in the next 0.35 s.
function schedule(){
  const g = audioGraph();
  if (!g || !current){ clearInterval(timer); timer = null; return; }
  const c = current, t = c.track, spb = 60 / t.bpm;
  while (c.nextBeat < g.ctx.currentTime + 0.35){
    beat(g, c, c.nextBeat, spb);
    c.nextBeat += spb;
    c.beat++;
  }
}

function beat(g, c, when, spb){
  const t = c.track;
  const beatsPerChord = 4 * t.barsPerChord;
  const chord = t.chords[Math.floor(c.beat / beatsPerChord) % t.chords.length];
  const inChord = c.beat % beatsPerChord, inBar = c.beat % 4;
  // Pad: the chord swells in at each change and rings under the whole span.
  if (inChord === 0) chord.forEach(n => pad(g, c, NOTE(n), when, spb * beatsPerChord));
  // Bass.
  if (t.drums) bassNote(g, c, NOTE(chord[0] - 12), when, spb * 0.9, inBar % 2 ? 0.07 : 0.11);
  else if (inBar === 0) bassNote(g, c, NOTE(chord[0] - 12), when, spb * 3.5, 0.06);
  // Arpeggio: eighths in the lobby (sparse), sixteenths in battle when hot.
  const steps = t.drums && intensity > 0.5 ? 4 : 2;
  for (let k = 0; k < steps; k++){
    if (!t.drums && Math.random() < 0.45) continue;
    const n = chord[(c.beat * steps + k) % chord.length] + (k % 2 ? 12 : 0) + 12;
    pluck(g, c, NOTE(n), when + k * spb / steps, t.drums ? 0.035 : 0.045);
  }
  if (!t.drums) return;
  // Drums: kick on 1 and 3, a soft snare on 2 and 4 and hats as it heats up.
  if (inBar === 0 || inBar === 2) kick(g, c, when, 0.35 + intensity * 0.15);
  if ((inBar === 1 || inBar === 3) && intensity > 0.2) snare(g, c, when, 0.08 + intensity * 0.06);
  if (intensity > 0.45){ hat(g, c, when + spb / 2, 0.03); if (intensity > 0.75) hat(g, c, when, 0.025); }
}

function voice(g, c, type, freq, when, dur, peak, attack, filterHz){
  const o = g.ctx.createOscillator(), v = g.ctx.createGain(), f = g.ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.value = filterHz;
  v.gain.setValueAtTime(0.0001, when);
  v.gain.exponentialRampToValueAtTime(peak, when + attack);
  v.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(f).connect(v).connect(c.gain);
  o.start(when); o.stop(when + dur + 0.05);
  return o;
}
function pad(g, c, freq, when, dur){
  for (const d of [-6, 6]){
    const o = voice(g, c, 'triangle', freq, when, dur + 1.2, 0.035, Math.min(1.2, dur * 0.3), 1400);
    o.detune.value = d;
  }
}
const pluck = (g, c, freq, when, peak) => voice(g, c, 'sine', freq, when, 0.45, peak, 0.005, 3000);
const bassNote = (g, c, freq, when, dur, peak) => voice(g, c, 'sawtooth', freq, when, dur, peak, 0.01, 380);
function kick(g, c, when, peak){
  const o = g.ctx.createOscillator(), v = g.ctx.createGain();
  o.frequency.setValueAtTime(130, when); o.frequency.exponentialRampToValueAtTime(42, when + 0.18);
  v.gain.setValueAtTime(0.0001, when); v.gain.exponentialRampToValueAtTime(peak, when + 0.004); v.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
  o.connect(v).connect(c.gain); o.start(when); o.stop(when + 0.35);
}
function noiseHit(g, c, when, peak, type, freq, dur){
  const s = g.ctx.createBufferSource(), f = g.ctx.createBiquadFilter(), v = g.ctx.createGain();
  s.buffer = g.noiseBuf; f.type = type; f.frequency.value = freq;
  v.gain.setValueAtTime(0.0001, when); v.gain.exponentialRampToValueAtTime(peak, when + 0.003); v.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  s.connect(f).connect(v).connect(c.gain); s.start(when, Math.random() * 0.5); s.stop(when + dur + 0.05);
}
const snare = (g, c, when, peak) => noiseHit(g, c, when, peak, 'bandpass', 1800, 0.16);
const hat = (g, c, when, peak) => noiseHit(g, c, when, peak, 'highpass', 7000, 0.05);
