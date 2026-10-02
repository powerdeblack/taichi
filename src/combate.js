// Combate determinístico em rodadas simultâneas, inspirado nas batalhas de campo do RoK.
import { NAVES } from './data.js';

export const TIPOS_NAVE = Object.keys(NAVES);
const RODADAS = 20;
const FATOR_DANO = 0.1;

export const totalTropas = (t) => TIPOS_NAVE.reduce((n, k) => n + (t[k] || 0), 0);
export const tropasVazias = () => Object.fromEntries(TIPOS_NAVE.map((k) => [k, 0]));

export function gerarExercito(nivel, multiplicador = 1) {
  const total = Math.round(30 * Math.pow(nivel, 1.5) * multiplicador);
  const drone = Math.round(total * 0.4);
  const interceptor = Math.round(total * 0.25);
  return { ...tropasVazias(), drone, interceptor, artilharia: total - drone - interceptor };
}

function danoCausado(tropas, mods, inimigo, alvoEstrutura) {
  const totalInimigo = totalTropas(inimigo) || 1;
  let dano = 0;
  for (const k of TIPOS_NAVE) {
    const n = tropas[k];
    if (!n) continue;
    const def = NAVES[k];
    let mult = 1 + 0.3 * ((def.forteContra ? inimigo[def.forteContra] || 0 : 0) / totalInimigo);
    if (alvoEstrutura && def.bonusEstrutura) mult *= def.bonusEstrutura;
    dano += n * def.atk * (1 + (mods.ataque || 0)) * mult * FATOR_DANO;
  }
  return dano;
}

function aplicarDano(tropas, dano, mods, perdas) {
  const total = totalTropas(tropas);
  if (!total) return;
  for (const k of TIPOS_NAVE) {
    const n = tropas[k];
    if (!n) continue;
    const def = NAVES[k];
    const hpEfetivo = def.hp * (def.def / 10) * (1 + (mods.defesa || 0));
    const mortos = Math.min(n, Math.round(((dano * n) / total) / hpEfetivo));
    tropas[k] -= mortos;
    perdas[k] += mortos;
  }
}

// O atacante só vence se aniquilar o defensor; senão, ambos ficam com o que sobrou.
export function batalha(atacante, defensor, opts = {}) {
  const A = { ...tropasVazias(), ...atacante.tropas };
  const D = { ...tropasVazias(), ...defensor.tropas };
  const perdasAtacante = tropasVazias();
  const perdasDefensor = tropasVazias();
  let rodadas = 0;
  while (rodadas < RODADAS && totalTropas(A) > 0 && totalTropas(D) > 0) {
    const danoA = danoCausado(A, atacante.mods, D, opts.alvoEstrutura);
    const danoD = danoCausado(D, defensor.mods, A, false);
    aplicarDano(D, danoA, defensor.mods, perdasDefensor);
    aplicarDano(A, danoD, atacante.mods, perdasAtacante);
    rodadas++;
  }
  const vitoria = totalTropas(D) === 0 && totalTropas(A) > 0;
  return { vitoria, rodadas, atacante: A, defensor: D, perdasAtacante, perdasDefensor };
}
