// Regras do jogo. Funções puras sobre o objeto de estado (sem DOM); recebem `now` em ms.
// Ações devolvem { ok: true } ou { ok: false, motivo }.
import {
  RECURSOS, EDIFICIOS, NAVES, TIPOS_COMBATE, COMANDANTES, RARIDADES, SINAIS, ITENS, PESQUISAS, ZONAS,
  ALIANCAS_RIVAIS, MISSOES,
} from './data.js';
import { batalha, gerarExercito, totalTropas, tropasVazias, TIPOS_NAVE } from './combate.js';
import {
  TAMANHO_MAPA, RAIO, cheb, dentroDoMapa, zona, ehEstrutura, alcanceConexao, estruturasConectadas, donoDe, areaPorAlianca,
} from './territorio.js';

export { batalha, gerarExercito, totalTropas, TIPOS_NAVE, TAMANHO_MAPA, zona, donoDe };

export const SEG_POR_CASA = 3;
export const MIN = 60 * 1000;
export const INTERVALO_RAID = 8 * MIN;
export const INTERVALO_PRESENTE = 10 * MIN;
export const INTERVALO_SINAL_GRATIS = 30 * MIN;
export const INTERVALO_EXPANSAO_RIVAL = 4 * MIN;
export const INTERVALO_ATAQUE_RIVAL = 7 * MIN;
export const RECONSTRUCAO_ESTACAO = 20 * MIN;
export const DURACAO_ESCUDO = 4 * 60 * MIN;
export const MAX_OFFLINE = 8 * 60 * MIN;
export const CUSTO_SALTO = 50;
export const MAX_MONOLITOS = 15;
const MAX_MONOLITOS_RIVAL = 10;
const MAX_ESTRELAS = 5;
const TIPOS_RECURSO = Object.keys(RECURSOS);
const ESTRUTURAS_ATACAVEIS = ['monolito', 'estacao', 'fortaleza', 'portal'];

// ---------- utilidades ----------

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const entre = (r, [min, max]) => min + Math.floor(r() * (max - min + 1));
const escalar = (custo, fator) => Object.fromEntries(Object.entries(custo).map(([k, v]) => [k, Math.round(v * fator)]));
const falta = (motivo) => ({ ok: false, motivo });
const OK = { ok: true };
const novoId = (s) => s.proximoId++;
const rngDe = (s, extra) => rng((s.seed ^ Math.imul(extra, 2654435761)) >>> 0);

function saldo(s, k) {
  if (k === 'quasares') return s.quasares;
  if (k === 'cristaisDominio') return s.aliancas.jogador?.cristais || 0;
  return s.recursos[k];
}

export function podePagar(s, custo) {
  return Object.entries(custo).every(([k, v]) => saldo(s, k) >= v);
}

function pagar(s, custo) {
  for (const [k, v] of Object.entries(custo)) {
    if (k === 'quasares') s.quasares -= v;
    else if (k === 'cristaisDominio') s.aliancas.jogador.cristais -= v;
    else s.recursos[k] -= v;
  }
}

// Prêmios podem conter recursos, quasares, cristais de domínio, itens e fragmentos.
export function receber(s, premio) {
  for (const [k, v] of Object.entries(premio)) {
    if (k === 'quasares') s.quasares += v;
    else if (k === 'cristaisDominio') { if (s.aliancas.jogador) s.aliancas.jogador.cristais += v; }
    else if (k in RECURSOS) s.recursos[k] += v;
    else if (k in ITENS) s.inventario[k] = (s.inventario[k] || 0) + v;
    else if (k in COMANDANTES) s.fragmentos[k] += v;
  }
}

export function registrar(s, now, msg, tipo = 'info') {
  s.registro.unshift({ t: now, msg, tipo });
  if (s.registro.length > 80) s.registro.length = 80;
}

// ---------- estado inicial e mapa ----------

const PORTAIS = [
  { x: 6, y: 12, abre: 2, nivel: 8 }, { x: 20, y: 6, abre: 2, nivel: 8 }, { x: 34, y: 24, abre: 2, nivel: 8 }, { x: 20, y: 34, abre: 2, nivel: 8 },
  { x: 13, y: 20, abre: 3, nivel: 15 }, { x: 27, y: 20, abre: 3, nivel: 15 }, { x: 20, y: 13, abre: 3, nivel: 15 }, { x: 20, y: 27, abre: 3, nivel: 15 },
];

const QUANTIDADES = { 1: { recurso: 22, pirata: 16, fortaleza: 1 }, 2: { recurso: 14, pirata: 10, fortaleza: 2 }, 3: { recurso: 6, pirata: 5, fortaleza: 1 } };

export function novoEstado(now = Date.now(), seed = Math.floor(Math.random() * 2 ** 31)) {
  const s = {
    versao: 2,
    nome: 'Comandante',
    seed,
    criadoEm: now,
    ultimoTick: now,
    proximoId: 1,
    nave: { tokenId: null },
    recursos: { minerio: 2500, cristal: 2500, plasma: 800 },
    quasares: 100,
    edificios: Object.fromEntries(Object.keys(EDIFICIOS).map((k) => [k, 0])),
    pesquisas: Object.fromEntries(Object.keys(PESQUISAS).map((k) => [k, 0])),
    tropas: { ...tropasVazias(), drone: 60, artilharia: 40, extrator: 10 },
    feridos: tropasVazias(),
    inventario: { caixaMinerio: 1 },
    escudoAte: 0,
    comandantes: {},
    fragmentos: Object.fromEntries(Object.keys(COMANDANTES).map((k) => [k, 0])),
    universais: Object.fromEntries(Object.keys(RARIDADES).map((k) => [k, 0])),
    filas: { construcao: [], treino: [], pesquisa: [], cura: [] },
    marchas: [],
    base: { x: 5, y: 22 },
    mapa: [],
    zonasLiberadas: 1,
    aliancas: { jogador: null },
    bots: { expansao: now + INTERVALO_EXPANSAO_RIVAL, ataque: now + INTERVALO_ATAQUE_RIVAL, reconstrucao: {} },
    proximoRaid: null,
    ultimoPresente: 0,
    ultimoSinalGratis: 0,
    checkIn: { ultimoDia: 0 },
    stats: {
      tropasTreinadas: 0, extratoresTreinados: 0, piratas: 0, fortalezas: 0, portais: 0, coletado: 0, pesquisas: 0, ajudas: 0,
      raidsDefendidas: 0, vitorias: 0, monolitosErguidos: 0, monolitosDestruidos: 0, monolitosPerdidos: 0, sinais: 0,
    },
    missoesResgatadas: [],
    registro: [],
  };
  Object.assign(s.edificios, { comando: 2, extrator: 1, minaCristal: 1, reator: 1, armazem: 1, hangarDrones: 1, docaArtilharia: 1, docaExtracao: 1, hospital: 1 });
  for (const [id, def] of Object.entries(COMANDANTES)) if (def.inicial) s.comandantes[id] = { nivel: 1, xp: 0, estrelas: 1 };

  for (const p of PORTAIS) {
    s.mapa.push({ id: novoId(s), tipo: 'portal', x: p.x, y: p.y, abre: p.abre, nivel: p.nivel, tropas: gerarExercito(p.nivel, 3), capturado: false });
  }
  for (const [id, a] of Object.entries(ALIANCAS_RIVAIS)) {
    s.aliancas[id] = { nome: a.nome, tag: a.tag, cor: a.cor, bot: true };
    criarEstacaoRival(s, id);
  }
  const r = rng(seed);
  for (let i = 0; i < 2; i++) for (const id of Object.keys(ALIANCAS_RIVAIS)) expandirRival(s, id, r);
  for (const [z, qtd] of Object.entries(QUANTIDADES)) {
    for (const [tipo, n] of Object.entries(qtd)) for (let i = 0; i < n; i++) gerarEntidade(s, tipo, Number(z), r);
  }
  registrar(s, now, 'Bem-vindo, Comandante! Sua Nave-Cidade ancorou na Borda Exterior da Via Láctea.', 'sucesso');
  return s;
}

export const ocupado = (s, x, y) => (s.base.x === x && s.base.y === y) || s.mapa.some((e) => e.x === x && e.y === y);

function gerarEntidade(s, tipo, z, r) {
  for (let tentativa = 0; tentativa < 800; tentativa++) {
    const x = Math.floor(r() * TAMANHO_MAPA);
    const y = Math.floor(r() * TAMANHO_MAPA);
    if (zona(x, y) !== z || ocupado(s, x, y) || cheb({ x, y }, s.base) < 2) continue;
    if (tipo !== 'recurso' && donoDe(s.mapa, x, y)) continue; // piratas não nascem em território
    const faixa = ZONAS[z];
    const e = { id: novoId(s), tipo, x, y, zona: z };
    if (tipo === 'recurso') {
      const sorteio = r();
      e.recurso = sorteio < 0.2 ? 'plasma' : sorteio < 0.6 ? 'minerio' : 'cristal';
      e.nivel = entre(r, faixa.recurso);
      e.quantidade = 1500 * e.nivel + Math.floor(r() * 500);
      e.ocupadoPor = null;
    } else if (tipo === 'pirata') {
      e.nivel = entre(r, faixa.pirata);
      e.tropas = gerarExercito(e.nivel);
    } else {
      e.nivel = entre(r, faixa.fortaleza);
      e.tropas = gerarExercito(e.nivel, 3);
    }
    s.mapa.push(e);
    return e;
  }
  return null;
}

function removerEntidade(s, id) {
  const e = s.mapa.find((x) => x.id === id);
  s.mapa = s.mapa.filter((x) => x.id !== id);
  if (e && ['recurso', 'pirata', 'fortaleza'].includes(e.tipo)) gerarEntidade(s, e.tipo, e.zona, rngDe(s, s.proximoId));
}

// ---------- alianças rivais (bots) ----------

function criarEstacaoRival(s, id) {
  const { x, y } = ALIANCAS_RIVAIS[id].estacao;
  if (ocupado(s, x, y)) return false;
  s.mapa.push({ id: novoId(s), tipo: 'estacao', alianca: id, x, y, nivel: 12, tropas: gerarExercito(12, 3) });
  return true;
}

function expandirRival(s, id, r) {
  const conectadas = estruturasConectadas(s.mapa, id);
  if (!conectadas.size) return false;
  const total = s.mapa.filter((e) => e.tipo === 'monolito' && e.alianca === id).length;
  if (total >= MAX_MONOLITOS_RIVAL) return false;
  const origens = s.mapa.filter((e) => conectadas.has(e.id));
  for (let tentativa = 0; tentativa < 60; tentativa++) {
    const o = origens[Math.floor(r() * origens.length)];
    const alcance = alcanceConexao(o, { tipo: 'monolito' });
    const x = o.x + Math.floor(r() * (2 * alcance + 1)) - alcance;
    const y = o.y + Math.floor(r() * (2 * alcance + 1)) - alcance;
    if (!dentroDoMapa(x, y) || zona(x, y) === 3 || ocupado(s, x, y)) continue;
    if (cheb({ x, y }, o) < 3 || cheb({ x, y }, s.base) < RAIO.monolito + 3) continue;
    const dono = donoDe(s.mapa, x, y);
    if (dono && dono !== id) continue;
    const nivel = 3 + Math.floor(total / 3);
    s.mapa.push({ id: novoId(s), tipo: 'monolito', alianca: id, x, y, nivel, tropas: gerarExercito(nivel, 1.5) });
    return true;
  }
  return false;
}

function processarRivais(s, now) {
  const eventos = [];
  for (const [id, quando] of Object.entries(s.bots.reconstrucao)) {
    if (now >= quando && criarEstacaoRival(s, id)) {
      delete s.bots.reconstrucao[id];
      registrar(s, now, `🏗️ A aliança [${s.aliancas[id].tag}] reconstruiu sua Estação Central.`, 'alerta');
    }
  }
  if (now >= s.bots.expansao) {
    const r = rngDe(s, now);
    for (const id of Object.keys(ALIANCAS_RIVAIS)) expandirRival(s, id, r);
    s.bots.expansao = now + INTERVALO_EXPANSAO_RIVAL;
    eventos.push('rivais');
  }
  if (now >= s.bots.ataque) {
    ataqueRival(s, now);
    s.bots.ataque = now + INTERVALO_ATAQUE_RIVAL;
    eventos.push('rivais');
  }
  return eventos;
}

function ataqueRival(s, now) {
  const rivais = Object.keys(ALIANCAS_RIVAIS).filter((id) => s.mapa.some((e) => e.tipo === 'estacao' && e.alianca === id));
  if (!rivais.length) return;
  const nivel = 2 + s.edificios.comando;
  const meusMonolitos = s.mapa.filter((e) => e.tipo === 'monolito' && e.alianca === 'jogador');
  if (meusMonolitos.length) {
    // Ataca o Monólito do jogador mais próximo de alguma estrutura rival.
    let melhor = null;
    for (const m of meusMonolitos) {
      for (const e of s.mapa.filter((x) => ehEstrutura(x) && rivais.includes(x.alianca))) {
        const d = cheb(m, e);
        if (!melhor || d < melhor.d) melhor = { d, alvo: m, rival: e.alianca };
      }
    }
    defenderMonolito(s, melhor.alvo, melhor.rival, gerarExercito(nivel), now);
  } else if (s.edificios.comando >= 3 && !naveProtegida(s, now)) {
    const rival = rivais[Math.floor(rngDe(s, now)() * rivais.length)];
    atacarBase(s, now, gerarExercito(nivel), `a aliança [${s.aliancas[rival].tag}]`);
  }
}

function defenderMonolito(s, monolito, rival, exercito, now) {
  const reforcos = s.marchas.filter((m) => m.fase === 'guarnecendo' && m.alvoId === monolito.id);
  const defensores = { ...monolito.tropas };
  for (const m of reforcos) for (const k of TIPOS_NAVE) defensores[k] += m.tropas[k];
  const nivel = 2 + s.edificios.comando;
  const res = batalha(
    { tropas: exercito, mods: { ataque: nivel * 0.03, defesa: nivel * 0.03 } },
    { tropas: defensores, mods: modsJogador(s, {}) },
    { alvoEstrutura: true },
  );
  // Sobreviventes distribuídos proporcionalmente entre a guarnição fixa e os reforços.
  const perdasJogador = tropasVazias();
  const proporcao = (k) => (defensores[k] ? res.defensor[k] / defensores[k] : 0);
  for (const m of reforcos) {
    for (const k of TIPOS_NAVE) {
      const vivos = Math.round(m.tropas[k] * proporcao(k));
      perdasJogador[k] += m.tropas[k] - vivos;
      m.tropas[k] = vivos;
    }
  }
  for (const k of TIPOS_NAVE) monolito.tropas[k] = Math.round(monolito.tropas[k] * proporcao(k));
  const baixas = registrarBaixas(s, perdasJogador);
  const tag = s.aliancas[rival].tag;
  if (res.vitoria) {
    s.mapa = s.mapa.filter((e) => e.id !== monolito.id);
    s.stats.monolitosPerdidos++;
    for (const m of reforcos) voltar(m, now);
    registrar(s, now, `🪨 [${tag}] destruiu seu Monólito em (${monolito.x}, ${monolito.y})! Reforços feridos: ${baixas.feridos}.`, 'erro');
  } else {
    registrar(s, now, `🛡️ Seu Monólito em (${monolito.x}, ${monolito.y}) resistiu ao ataque de [${tag}].`, 'sucesso');
  }
}

// ---------- fórmulas ----------

export function bonusComandante(s, id, peso = 1) {
  const c = s.comandantes[id];
  if (!c) return {};
  const fator = (1 + 0.05 * (c.nivel - 1)) * (1 + 0.1 * (c.estrelas - 1)) * peso;
  return Object.fromEntries(Object.entries(COMANDANTES[id].bonus).map(([k, v]) => [k, v * fator]));
}

// Principal com bônus completo + secundário com metade.
export function bonusMarcha(s, principal, secundario) {
  const total = { ...bonusComandante(s, principal) };
  for (const [k, v] of Object.entries(bonusComandante(s, secundario, 0.5))) total[k] = (total[k] || 0) + v;
  return total;
}

export const xpParaNivel = (nivel) => 100 * nivel;
export const nivelMaximo = (c) => 10 * c.estrelas;
export const capacidade = (s) => 4000 + 6000 * s.edificios.armazem;
export const cofre = (s) => 1500 * s.edificios.armazem;
export const capacidadeHospital = (s) => 300 * s.edificios.hospital;
export const loteMaximo = (s, tipo) => 100 * s.edificios[NAVES[tipo].edificio];
export const vagasConstrucao = (s) => (s.edificios.comando >= 4 ? 2 : 1);
export const maxMarchas = (s) => 2 + Math.floor(s.edificios.comando / 4);

export function producao(s) {
  const p = Object.fromEntries(TIPOS_RECURSO.map((k) => [k, 0]));
  const bonus = 1 + 0.1 * s.pesquisas.mineracao;
  for (const [id, def] of Object.entries(EDIFICIOS)) {
    if (!def.producao) continue;
    for (const [r, v] of Object.entries(def.producao)) p[r] += v * s.edificios[id] * bonus;
  }
  return p; // por segundo
}

// Cristais de Domínio por segundo, gerados pelo território conectado da aliança do jogador.
export const producaoDominio = (s) => (s.aliancas.jogador ? 0.01 * (areaPorAlianca(s.mapa).jogador || 0) : 0);

export const custoEdificio = (id, nivelAlvo) => escalar(EDIFICIOS[id].custo, Math.pow(1.7, nivelAlvo - 1));
export const tempoEdificio = (s, id, nivelAlvo) =>
  (EDIFICIOS[id].tempo * Math.pow(1.5, nivelAlvo - 1)) / (1 + 0.08 * s.pesquisas.engenharia);

export function requisitosEdificio(id, nivelAlvo) {
  const req = { ...(EDIFICIOS[id].requer || {}) };
  if (id === 'comando') {
    if (nivelAlvo >= 2) req.armazem = nivelAlvo - 1;
    if (nivelAlvo >= 4) req.muralha = nivelAlvo - 1;
  } else {
    req.comando = Math.max(req.comando || 0, nivelAlvo);
  }
  return req;
}

export const custoPesquisa = (id, nivelAlvo) => escalar(PESQUISAS[id].custo, Math.pow(1.8, nivelAlvo - 1));
export const tempoPesquisa = (id, nivelAlvo) => PESQUISAS[id].tempo * Math.pow(1.6, nivelAlvo - 1);
export const custoCura = (tipo) => escalar(NAVES[tipo].custo, 0.25);
export const custoAceleracao = (restanteMs) => Math.max(1, Math.ceil(restanteMs / 30000));
export const custoMonolito = (s) => {
  const n = s.mapa.filter((e) => e.tipo === 'monolito' && e.alianca === 'jogador').length;
  return { cristaisDominio: 150 + 50 * n, minerio: 1500 };
};
export const CUSTO_ESTACAO = { minerio: 3000, cristal: 3000 };
export const CUSTO_ALIANCA = { minerio: 1000 };

export function poder(s) {
  let p = 0;
  for (const n of Object.values(s.edificios)) p += n * n * 40;
  const contar = (t) => { for (const k of TIPOS_NAVE) p += (t[k] || 0) * NAVES[k].poder; };
  contar(s.tropas);
  s.marchas.forEach((m) => contar(m.tropas));
  for (const n of Object.values(s.pesquisas)) p += n * 150;
  for (const c of Object.values(s.comandantes)) p += c.nivel * 50 + c.estrelas * 300;
  return Math.round(p);
}

export const territorioDoJogador = (s, x, y) => donoDe(s.mapa, x, y) === 'jogador';
export const naveProtegida = (s, now) => s.escudoAte > now || territorioDoJogador(s, s.base.x, s.base.y);

// ---------- verificações ----------

function requisitosAtendidos(s, req) {
  for (const [id, nivel] of Object.entries(req)) {
    if (s.edificios[id] < nivel) return falta(`Requer ${EDIFICIOS[id].nome} nível ${nivel}`);
  }
  return OK;
}

export function podeEvoluir(s, id) {
  const alvo = s.edificios[id] + 1;
  if (alvo > EDIFICIOS[id].max) return falta('Nível máximo');
  if (s.filas.construcao.some((f) => f.alvo === id)) return falta('Já em construção');
  if (s.filas.construcao.length >= vagasConstrucao(s)) return falta('Sem drones construtores livres');
  const req = requisitosAtendidos(s, requisitosEdificio(id, alvo));
  if (!req.ok) return req;
  if (!podePagar(s, custoEdificio(id, alvo))) return falta('Recursos insuficientes');
  return OK;
}

export function podeTreinar(s, tipo, qtd) {
  const def = NAVES[tipo];
  if (!def) return falta('Nave desconhecida');
  if (!Number.isInteger(qtd) || qtd <= 0) return falta('Quantidade inválida');
  if (s.edificios[def.edificio] < 1) return falta(`Construa ${EDIFICIOS[def.edificio].nome}`);
  if (qtd > loteMaximo(s, tipo)) return falta(`Lote máximo: ${loteMaximo(s, tipo)}`);
  if (s.filas.treino.some((f) => NAVES[f.alvo].edificio === def.edificio)) return falta(`${EDIFICIOS[def.edificio].nome} ocupado`);
  if (!podePagar(s, escalar(def.custo, qtd))) return falta('Recursos insuficientes');
  return OK;
}

export function podePesquisar(s, id) {
  const alvo = s.pesquisas[id] + 1;
  if (s.edificios.laboratorio < 1) return falta('Construa o Laboratório Quântico');
  if (alvo > PESQUISAS[id].max) return falta('Nível máximo');
  if (s.filas.pesquisa.length) return falta('Laboratório ocupado');
  if (s.edificios.laboratorio < alvo) return falta(`Requer Laboratório nível ${alvo}`);
  if (!podePagar(s, custoPesquisa(id, alvo))) return falta('Recursos insuficientes');
  return OK;
}

// ---------- construção, treino, pesquisa, cura ----------

export function evoluir(s, id, now) {
  const v = podeEvoluir(s, id);
  if (!v.ok) return v;
  const nivel = s.edificios[id] + 1;
  pagar(s, custoEdificio(id, nivel));
  s.filas.construcao.push({ id: novoId(s), alvo: id, nivel, inicio: now, fim: now + tempoEdificio(s, id, nivel) * 1000, ajudado: false });
  return OK;
}

export function treinar(s, tipo, qtd, now) {
  const v = podeTreinar(s, tipo, qtd);
  if (!v.ok) return v;
  pagar(s, escalar(NAVES[tipo].custo, qtd));
  const tempo = (NAVES[tipo].tempo * qtd) / (1 + 0.1 * (s.edificios[NAVES[tipo].edificio] - 1));
  s.filas.treino.push({ id: novoId(s), alvo: tipo, qtd, inicio: now, fim: now + tempo * 1000, ajudado: false });
  return OK;
}

export function pesquisar(s, id, now) {
  const v = podePesquisar(s, id);
  if (!v.ok) return v;
  const nivel = s.pesquisas[id] + 1;
  pagar(s, custoPesquisa(id, nivel));
  s.filas.pesquisa.push({ id: novoId(s), alvo: id, nivel, inicio: now, fim: now + tempoPesquisa(id, nivel) * 1000, ajudado: false });
  return OK;
}

export function custoCuraTotal(s) {
  const custo = {};
  for (const k of TIPOS_NAVE) {
    for (const [r, v] of Object.entries(custoCura(k))) custo[r] = (custo[r] || 0) + v * s.feridos[k];
  }
  return custo;
}

export function curar(s, now) {
  const qtd = totalTropas(s.feridos);
  if (!qtd) return falta('Nenhuma tripulação ferida');
  if (s.filas.cura.length) return falta('Baía de Reparos ocupada');
  const custo = custoCuraTotal(s);
  if (!podePagar(s, custo)) return falta('Recursos insuficientes');
  pagar(s, custo);
  s.filas.cura.push({ id: novoId(s), tropas: { ...s.feridos }, inicio: now, fim: now + qtd * 400, ajudado: false });
  s.feridos = tropasVazias();
  return OK;
}

const acharItemFila = (s, fila, itemId) => (s.filas[fila] || []).find((f) => f.id === itemId);

export function acelerar(s, fila, itemId, now) {
  const item = acharItemFila(s, fila, itemId);
  if (!item) return falta('Item não encontrado');
  const custo = custoAceleracao(item.fim - now);
  if (s.quasares < custo) return falta(`Requer ${custo} Quasares`);
  s.quasares -= custo;
  item.fim = now;
  return OK;
}

export function ajudaAlianca(s, fila, itemId, now) {
  if (!s.aliancas.jogador) return falta('Funde uma aliança na Embaixada');
  const item = acharItemFila(s, fila, itemId);
  if (!item) return falta('Item não encontrado');
  if (item.ajudado) return falta('A aliança já ajudou aqui');
  const restante = item.fim - now;
  const ajudas = 3 + 2 * s.edificios.embaixada;
  const reducao = Math.min(restante, ajudas * Math.max(10000, restante * 0.02));
  item.fim -= reducao;
  item.ajudado = true;
  s.stats.ajudas++;
  registrar(s, now, `🤝 ${ajudas} aliados ajudaram: -${Math.round(reducao / 1000)}s`, 'sucesso');
  return OK;
}

export const presenteDisponivel = (s, now) => Boolean(s.aliancas.jogador) && now - s.ultimoPresente >= INTERVALO_PRESENTE;

export function resgatarPresente(s, now) {
  if (!presenteDisponivel(s, now)) return falta('Presente ainda não disponível');
  const n = Math.max(1, s.edificios.embaixada);
  receber(s, { caixaMinerio: 1, caixaCristal: 1, plasma: 150 * n, quasares: 5 + 2 * n, cristaisDominio: 20 * n });
  s.ultimoPresente = now;
  registrar(s, now, '🎁 Presente da aliança recebido!', 'sucesso');
  return OK;
}

// ---------- itens ----------

export function usarItem(s, item, now, opts = {}) {
  if (!(s.inventario[item] > 0)) return falta('Você não tem este item');
  const def = ITENS[item];
  if (def.conteudo) {
    s.inventario[item]--;
    receber(s, def.conteudo);
    return OK;
  }
  if (item === 'escudo') {
    s.inventario.escudo--;
    s.escudoAte = Math.max(s.escudoAte, now) + DURACAO_ESCUDO;
    registrar(s, now, '🔰 Escudo de Paz ativado.', 'sucesso');
    return OK;
  }
  if (item === 'salto') return saltar(s, opts.x, opts.y, now);
  if (item in SINAIS) return abrirSinal(s, item, now);
  return falta('Item sem uso');
}

// Salto Warp: grátis para dentro do próprio território; senão gasta o item ou Quasares.
export function avaliarSalto(s, x, y) {
  if (!dentroDoMapa(x, y)) return falta('Fora do mapa');
  if (s.marchas.length) return falta('Recolha todas as marchas antes do salto');
  if (zona(x, y) > s.zonasLiberadas) return falta('Zona ainda bloqueada');
  if (ocupado(s, x, y)) return falta('Coordenada ocupada');
  const dono = donoDe(s.mapa, x, y);
  if (dono && dono !== 'jogador') return falta('Território inimigo');
  if (dono === 'jogador') return { ok: true, custo: null };
  if (s.inventario.salto > 0) return { ok: true, custo: 'item' };
  if (s.quasares >= CUSTO_SALTO) return { ok: true, custo: 'quasares' };
  return falta(`Requer item Salto Warp ou ${CUSTO_SALTO} Quasares`);
}

export function saltar(s, x, y, now) {
  const v = avaliarSalto(s, x, y);
  if (!v.ok) return v;
  if (v.custo === 'item') s.inventario.salto--;
  if (v.custo === 'quasares') s.quasares -= CUSTO_SALTO;
  s.base = { x, y };
  registrar(s, now, `🌀 Salto Warp concluído para (${x}, ${y}).`, 'sucesso');
  return OK;
}

// ---------- comandantes (fragmentos ERC-1155) ----------

function gastarFragmentos(s, id, qtd) {
  const raridade = COMANDANTES[id].raridade;
  if (s.fragmentos[id] + s.universais[raridade] < qtd) return false;
  const proprios = Math.min(qtd, s.fragmentos[id]);
  s.fragmentos[id] -= proprios;
  s.universais[raridade] -= qtd - proprios;
  return true;
}

export const custoDesbloqueio = (id) => RARIDADES[COMANDANTES[id].raridade].desbloqueio;
export const custoEstrela = (s, id) => RARIDADES[COMANDANTES[id].raridade].porEstrela * s.comandantes[id].estrelas;

export function desbloquearComandante(s, id, now) {
  if (!COMANDANTES[id] || s.comandantes[id]) return falta('Indisponível');
  if (!gastarFragmentos(s, id, custoDesbloqueio(id))) return falta(`Requer ${custoDesbloqueio(id)} fragmentos`);
  s.comandantes[id] = { nivel: 1, xp: 0, estrelas: 1 };
  registrar(s, now, `${COMANDANTES[id].icone} ${COMANDANTES[id].nome} juntou-se à sua frota!`, 'sucesso');
  return OK;
}

export function evoluirEstrela(s, id, now) {
  const c = s.comandantes[id];
  if (!c) return falta('Comandante bloqueado');
  if (c.estrelas >= MAX_ESTRELAS) return falta('Estrelas no máximo');
  if (!gastarFragmentos(s, id, custoEstrela(s, id))) return falta(`Requer ${custoEstrela(s, id)} fragmentos`);
  c.estrelas++;
  registrar(s, now, `⭐ ${COMANDANTES[id].nome} agora tem ${c.estrelas} estrelas.`, 'sucesso');
  return OK;
}

function sortearFragmentos(s, r, chanceLendario, [min, max]) {
  const raridade = r() < chanceLendario ? 'Lendário' : 'Épico';
  const qtd = min + Math.floor(r() * (max - min + 1));
  if (r() < 0.1) {
    s.universais[raridade] += qtd;
    return { universal: raridade, qtd };
  }
  const pool = Object.keys(COMANDANTES).filter((k) => COMANDANTES[k].raridade === raridade);
  const id = pool[Math.floor(r() * pool.length)];
  s.fragmentos[id] += qtd;
  return { id, qtd };
}

export const sinalGratisDisponivel = (s, now) => s.edificios.cantina >= 1 && now - s.ultimoSinalGratis >= INTERVALO_SINAL_GRATIS;

// Abre um Sinal usando o sinal grátis, Quasares, ou (padrão) um item do inventário.
export function abrirSinal(s, tipo, now, { gratis = false, comQuasares = false } = {}) {
  const def = SINAIS[tipo];
  if (!def) return falta('Sinal desconhecido');
  if (s.edificios.cantina < 1) return falta('Construa a Cantina Estelar');
  if (gratis) {
    if (tipo !== 'sinalPrata' || !sinalGratisDisponivel(s, now)) return falta('Sinal grátis indisponível');
    s.ultimoSinalGratis = now;
  } else if (comQuasares) {
    if (s.quasares < def.quasares) return falta(`Requer ${def.quasares} Quasares`);
    s.quasares -= def.quasares;
  } else {
    if (!(s.inventario[tipo] > 0)) return falta('Você não tem este sinal');
    s.inventario[tipo]--;
  }
  const resultado = sortearFragmentos(s, rngDe(s, novoId(s)), def.chanceLendario, def.fragmentos);
  s.stats.sinais++;
  const alvo = resultado.universal ? `Fragmentos Universais (${resultado.universal})` : COMANDANTES[resultado.id].nome;
  registrar(s, now, `${def.icone} ${def.nome}: +${resultado.qtd} fragmentos de ${alvo}.`, 'sucesso');
  return { ok: true, resultado };
}

// Comandantes forjados on-chain (contrato Comandantes) ficam desbloqueados no jogo com as estrelas de lá.
export function sincronizarComandantesOnChain(s, estrelasPorTokenId, now) {
  let mudou = 0;
  for (const [id, def] of Object.entries(COMANDANTES)) {
    const estrelas = Number(estrelasPorTokenId[def.tokenId - 1] || 0);
    if (!estrelas) continue;
    const c = s.comandantes[id];
    if (!c) s.comandantes[id] = { nivel: 1, xp: 0, estrelas };
    else if (c.estrelas < estrelas) c.estrelas = estrelas;
    else continue;
    mudou++;
  }
  if (mudou) registrar(s, now, `⛓️ ${mudou} comandante(s) sincronizado(s) da blockchain.`, 'sucesso');
  return mudou;
}

// ---------- aliança, estação e monólitos ----------

export function fundarAlianca(s, nome, tag, now) {
  if (s.aliancas.jogador) return falta('Você já tem uma aliança');
  if (s.edificios.embaixada < 1) return falta('Construa a Embaixada Galáctica');
  nome = String(nome || '').trim().slice(0, 24);
  tag = String(tag || '').trim().toUpperCase().slice(0, 4);
  if (nome.length < 3 || tag.length < 2) return falta('Nome (3+) e tag (2–4 letras) obrigatórios');
  if (!podePagar(s, CUSTO_ALIANCA)) return falta('Recursos insuficientes');
  pagar(s, CUSTO_ALIANCA);
  s.aliancas.jogador = { nome, tag, cor: '#38d9a9', cristais: 0 };
  registrar(s, now, `🤝 Aliança [${tag}] ${nome} fundada!`, 'sucesso');
  return OK;
}

function localLivreParaEstrutura(s, x, y) {
  if (!dentroDoMapa(x, y)) return falta('Fora do mapa');
  if (zona(x, y) > s.zonasLiberadas) return falta('Zona ainda bloqueada');
  if (ocupado(s, x, y)) return falta('Coordenada ocupada');
  const dono = donoDe(s.mapa, x, y);
  if (dono && dono !== 'jogador') return falta('Território inimigo');
  return OK;
}

export function avaliarEstacao(s, x, y) {
  if (!s.aliancas.jogador) return falta('Funde uma aliança primeiro');
  if (s.mapa.some((e) => e.tipo === 'estacao' && e.alianca === 'jogador')) return falta('A Estação Central já existe');
  const livre = localLivreParaEstrutura(s, x, y);
  if (!livre.ok) return livre;
  if (cheb({ x, y }, s.base) > 5) return falta('Ancore a até 5 casas da sua Nave-Cidade');
  if (!podePagar(s, CUSTO_ESTACAO)) return falta('Recursos insuficientes');
  return OK;
}

export function ancorarEstacao(s, x, y, now) {
  const v = avaliarEstacao(s, x, y);
  if (!v.ok) return v;
  pagar(s, CUSTO_ESTACAO);
  s.mapa.push({ id: novoId(s), tipo: 'estacao', alianca: 'jogador', x, y, nivel: 5, tropas: gerarExercito(6, 2) });
  s.aliancas.jogador.cristais += 300;
  registrar(s, now, `🏛️ Estação Central ancorada em (${x}, ${y}). O território da aliança começa aqui.`, 'sucesso');
  return OK;
}

export function avaliarMonolito(s, x, y) {
  if (!s.aliancas.jogador) return falta('Funde uma aliança primeiro');
  const conectadas = estruturasConectadas(s.mapa, 'jogador');
  if (!conectadas.size) return falta('Ancore a Estação Central primeiro');
  if (s.mapa.filter((e) => e.tipo === 'monolito' && e.alianca === 'jogador').length >= MAX_MONOLITOS) return falta('Limite de Monólitos');
  const livre = localLivreParaEstrutura(s, x, y);
  if (!livre.ok) return livre;
  const novo = { tipo: 'monolito', x, y };
  const ligado = s.mapa.some((e) => conectadas.has(e.id) && cheb(e, novo) <= alcanceConexao(e, novo));
  if (!ligado) return falta('Precisa ficar conectado ao território da aliança');
  if (!podePagar(s, custoMonolito(s))) return falta('Cristais de Domínio ou minério insuficientes');
  return OK;
}

export function erguerMonolito(s, x, y, now) {
  const v = avaliarMonolito(s, x, y);
  if (!v.ok) return v;
  pagar(s, custoMonolito(s));
  s.mapa.push({ id: novoId(s), tipo: 'monolito', alianca: 'jogador', x, y, nivel: 4, tropas: gerarExercito(4, 1.5) });
  s.stats.monolitosErguidos++;
  registrar(s, now, `🪨 Monólito de Domínio erguido em (${x}, ${y}).`, 'sucesso');
  return OK;
}

// ---------- missões e check-in ----------

export function missoes(s) {
  const ctx = { poder: poder(s) };
  return MISSOES.map((m) => ({ ...m, concluida: m.feita(s, ctx), resgatada: s.missoesResgatadas.includes(m.id) }));
}

export function resgatarMissao(s, id, now) {
  const m = missoes(s).find((x) => x.id === id);
  if (!m || !m.concluida || m.resgatada) return falta('Missão indisponível');
  receber(s, m.premio);
  s.missoesResgatadas.push(id);
  registrar(s, now, `📜 Missão concluída: ${m.titulo}`, 'sucesso');
  return OK;
}

// Recompensa local pelo check-in diário on-chain (o dia e a sequência vêm do contrato Setor).
export function recompensarCheckIn(s, dia, sequencia, now) {
  if (!(dia > s.checkIn.ultimoDia)) return falta('Check-in deste dia já recompensado');
  s.checkIn.ultimoDia = dia;
  const bonus = Math.min(sequencia, 7);
  receber(s, { quasares: 10 * bonus, caixaMinerio: 1, ...(bonus >= 7 ? { sinalOuro: 1 } : { sinalPrata: 1 }) });
  registrar(s, now, `📅 Check-in on-chain (sequência ${sequencia}): recompensa recebida.`, 'sucesso');
  return OK;
}

// ---------- marchas ----------

export const comandanteOcupado = (s, id) => s.marchas.some((m) => m.comandante === id || m.secundario === id);

// O tipo de marcha é definido pelo alvo.
export function tipoMarcha(alvo) {
  if (alvo.tipo === 'recurso') return 'coleta';
  if (ehEstrutura(alvo) && alvo.alianca === 'jogador') return 'reforco';
  return 'ataque';
}

export function velocidadeMarcha(s, tropas, principal, secundario) {
  const tipos = TIPOS_NAVE.filter((k) => tropas[k] > 0);
  if (!tipos.length) return 0;
  const base = Math.min(...tipos.map((k) => NAVES[k].vel));
  return base * (1 + 0.1 * s.pesquisas.warp + (bonusMarcha(s, principal, secundario).velocidade || 0));
}

export function cargaMarcha(s, tropas, principal, secundario) {
  const bruto = TIPOS_NAVE.reduce((n, k) => n + (tropas[k] || 0) * NAVES[k].carga, 0);
  return Math.round(bruto * (1 + 0.1 * s.pesquisas.logistica + (bonusMarcha(s, principal, secundario).carga || 0)));
}

export function tempoViagem(s, alvo, tropas, principal, secundario) {
  return (Math.hypot(alvo.x - s.base.x, alvo.y - s.base.y) * SEG_POR_CASA) / velocidadeMarcha(s, tropas, principal, secundario);
}

export function avaliarAlvo(s, alvo) {
  if (!alvo) return falta('Alvo não encontrado');
  if (zona(alvo.x, alvo.y) > s.zonasLiberadas) return falta(`Capture um Portal para liberar o ${ZONAS[zona(alvo.x, alvo.y)].nome}`);
  if (alvo.tipo === 'portal') {
    if (alvo.capturado) return falta('Portal já capturado');
    if (alvo.abre > s.zonasLiberadas + 1) return falta('Libere a zona anterior primeiro');
    const conectadas = estruturasConectadas(s.mapa, 'jogador');
    const perto = s.mapa.some((e) => conectadas.has(e.id) && cheb(e, alvo) <= RAIO[e.tipo] + 1);
    if (!perto) return falta('O território da aliança precisa alcançar o Portal');
  }
  if (alvo.tipo === 'recurso' && alvo.ocupadoPor) return falta('Outra frota já coleta aqui');
  return OK;
}

export function enviarMarcha(s, { alvoId, comandante, secundario = null, tropas }, now) {
  const alvo = s.mapa.find((e) => e.id === alvoId);
  const valido = avaliarAlvo(s, alvo);
  if (!valido.ok) return valido;
  if (!s.comandantes[comandante]) return falta('Escolha um comandante desbloqueado');
  if (secundario && (!s.comandantes[secundario] || secundario === comandante)) return falta('Comandante secundário inválido');
  if (comandanteOcupado(s, comandante) || (secundario && comandanteOcupado(s, secundario))) return falta('Comandante já está em marcha');
  if (s.marchas.length >= maxMarchas(s)) return falta(`Máximo de ${maxMarchas(s)} marchas`);
  const tipo = tipoMarcha(alvo);
  const t = tropasVazias();
  for (const k of TIPOS_NAVE) {
    const q = Math.floor(tropas[k] || 0);
    if (q < 0 || q > s.tropas[k]) return falta(`Naves insuficientes: ${NAVES[k].nome}`);
    t[k] = q;
  }
  if (!totalTropas(t)) return falta('Selecione naves');
  if (tipo === 'coleta' && TIPOS_COMBATE.some((k) => t[k] > 0)) return falta('Só Naves de Extração coletam');
  if (tipo !== 'coleta' && t.extrator > 0) return falta('Naves de Extração não entram em combate');
  for (const k of TIPOS_NAVE) s.tropas[k] -= t[k];
  if (tipo === 'ataque') s.escudoAte = 0; // atacar quebra o Escudo de Paz
  if (tipo === 'coleta') alvo.ocupadoPor = -1; // reservado até a chegada
  const viagem = tempoViagem(s, alvo, t, comandante, secundario) * 1000;
  s.marchas.push({
    id: novoId(s), tipo, alvoId, alvoX: alvo.x, alvoY: alvo.y, comandante, secundario, tropas: t,
    fase: 'indo', inicio: now, fim: now + viagem, viagem, carga: {},
  });
  return OK;
}

export function retornarMarcha(s, marchaId, now) {
  const m = s.marchas.find((x) => x.id === marchaId);
  if (!m || m.fase === 'voltando') return falta('Marcha não pode retornar');
  const alvo = s.mapa.find((e) => e.id === m.alvoId);
  if (m.fase === 'indo') {
    if (alvo?.tipo === 'recurso' && alvo.ocupadoPor === -1) alvo.ocupadoPor = null;
    const percorrido = now - m.inicio;
    m.fase = 'voltando';
    m.inicio = now;
    m.fim = now + percorrido;
  } else if (m.fase === 'coletando') {
    const frac = Math.min(1, (now - m.inicio) / (m.fim - m.inicio || 1));
    finalizarColeta(s, m, alvo, Math.floor(m.coletaQtd * frac), now);
    voltar(m, now);
  } else {
    voltar(m, now); // guarnecendo
  }
  return OK;
}

function voltar(m, desde) {
  m.fase = 'voltando';
  m.inicio = desde;
  m.fim = desde + m.viagem;
}

function finalizarColeta(s, m, alvo, qtd, now) {
  if (!alvo) return;
  let real = Math.min(qtd, alvo.quantidade);
  alvo.quantidade -= real;
  alvo.ocupadoPor = null;
  // Fora do território, as Naves de Extração podem ser interceptadas e perder carga.
  if (!territorioDoJogador(s, alvo.x, alvo.y) && rngDe(s, m.id)() < 0.15) {
    const perdidas = Math.ceil(m.tropas.extrator * 0.1);
    m.tropas.extrator -= perdidas;
    real = Math.floor(real / 2);
    registrar(s, now, `🏴‍☠️ Piratas interceptaram suas Naves de Extração em (${alvo.x}, ${alvo.y}): metade da carga e ${perdidas} naves perdidas.`, 'erro');
  }
  m.carga[alvo.recurso] = (m.carga[alvo.recurso] || 0) + real;
  if (alvo.quantidade <= 0) removerEntidade(s, alvo.id);
}

function ganharXp(s, id, xp, now) {
  const c = s.comandantes[id];
  if (!c) return;
  c.xp += xp;
  while (c.nivel < nivelMaximo(c) && c.xp >= xpParaNivel(c.nivel)) {
    c.xp -= xpParaNivel(c.nivel);
    c.nivel++;
    registrar(s, now, `⭐ ${COMANDANTES[id].nome} alcançou o nível ${c.nivel}!`, 'sucesso');
  }
  if (c.nivel >= nivelMaximo(c)) c.xp = Math.min(c.xp, xpParaNivel(c.nivel));
}

function modsJogador(s, { comandante, secundario, alvo }) {
  const b = bonusMarcha(s, comandante, secundario);
  const estrutura = alvo && ESTRUTURAS_ATACAVEIS.includes(alvo.tipo);
  return {
    ataque: 0.05 * s.pesquisas.canhoes + (b.ataque || 0)
      + (alvo?.tipo === 'pirata' ? b.piratas || 0 : 0) + (estrutura ? b.estruturas || 0 : 0),
    defesa: 0.05 * s.pesquisas.blindagem + (b.defesa || 0),
  };
}

// Gravemente feridos vão para a Baía de Reparos até a capacidade; o resto é destruído.
function registrarBaixas(s, perdas, fracaoFeridos = 0.7) {
  let livre = capacidadeHospital(s) - totalTropas(s.feridos) - s.filas.cura.reduce((n, f) => n + totalTropas(f.tropas), 0);
  let feridos = 0;
  let mortos = 0;
  for (const k of TIPOS_NAVE) {
    const f = Math.max(0, Math.min(livre, Math.floor(perdas[k] * fracaoFeridos)));
    livre -= f;
    s.feridos[k] += f;
    feridos += f;
    mortos += perdas[k] - f;
  }
  return { feridos, mortos };
}

export function nomeAlvo(s, alvo) {
  switch (alvo.tipo) {
    case 'recurso': return `${RECURSOS[alvo.recurso].nome} nv.${alvo.nivel}`;
    case 'pirata': return `Piratas nv.${alvo.nivel}`;
    case 'fortaleza': return `Fortaleza Xeno nv.${alvo.nivel}`;
    case 'portal': return `Portal Estelar → ${ZONAS[alvo.abre].nome}`;
    case 'monolito': return `Monólito [${s.aliancas[alvo.alianca].tag}]`;
    case 'estacao': return `Estação Central [${s.aliancas[alvo.alianca].tag}]`;
    default: return 'alvo';
  }
}

function recompensaVitoria(s, alvo, r) {
  const n = alvo.nivel;
  switch (alvo.tipo) {
    case 'pirata':
      s.stats.piratas++;
      return { carga: { minerio: 300 * n, cristal: 250 * n, plasma: 100 * n }, premio: { quasares: 5 * n }, xp: 30 * n, remover: true };
    case 'fortaleza':
      s.stats.fortalezas++;
      sortearFragmentos(s, r, 0.5, [3, 5]);
      return { carga: { minerio: 1200 * n, cristal: 1000 * n, plasma: 400 * n }, premio: { quasares: 30 * n, sinalPrata: 1 }, xp: 100 * n, remover: true };
    case 'portal':
      s.stats.portais++;
      alvo.capturado = true;
      alvo.tropas = tropasVazias();
      s.zonasLiberadas = Math.max(s.zonasLiberadas, alvo.abre);
      return { carga: {}, premio: { quasares: 100 * alvo.abre, sinalOuro: 1 }, xp: 50 * n, remover: false, msg: `🌌 ${ZONAS[alvo.abre].nome} liberado!` };
    case 'monolito':
      s.stats.monolitosDestruidos++;
      return { carga: { minerio: 500 * n, cristal: 500 * n }, premio: { quasares: 20, cristaisDominio: 100 }, xp: 40 * n, remover: true };
    case 'estacao':
      sortearFragmentos(s, r, 0.6, [5, 8]);
      // Sem a Estação, todo o território rival colapsa.
      s.mapa = s.mapa.filter((e) => !(e.tipo === 'monolito' && e.alianca === alvo.alianca));
      return { carga: { minerio: 1500 * n, cristal: 1500 * n, plasma: 600 * n }, premio: { quasares: 300, cristaisDominio: 500 }, xp: 150 * n, remover: true, colapso: alvo.alianca };
    default:
      return { carga: {}, premio: {}, xp: 0, remover: false };
  }
}

function resolverAtaque(s, m, alvo, now) {
  const res = batalha(
    { tropas: m.tropas, mods: modsJogador(s, { comandante: m.comandante, secundario: m.secundario, alvo }) },
    { tropas: alvo.tropas, mods: { ataque: alvo.nivel * 0.03, defesa: alvo.nivel * 0.03 } },
    { alvoEstrutura: ESTRUTURAS_ATACAVEIS.includes(alvo.tipo) },
  );
  m.tropas = res.atacante;
  alvo.tropas = res.defensor;
  const baixas = registrarBaixas(s, res.perdasAtacante);
  const nome = nomeAlvo(s, alvo);
  if (res.vitoria) {
    const rec = recompensaVitoria(s, alvo, rngDe(s, m.id));
    for (const [k, v] of Object.entries(rec.carga)) m.carga[k] = (m.carga[k] || 0) + v;
    receber(s, rec.premio);
    s.stats.vitorias++;
    ganharXp(s, m.comandante, rec.xp, now);
    if (m.secundario) ganharXp(s, m.secundario, Math.round(rec.xp / 2), now);
    if (rec.colapso) s.bots.reconstrucao[rec.colapso] = now + RECONSTRUCAO_ESTACAO;
    if (rec.remover) removerEntidade(s, alvo.id);
    registrar(s, now, `⚔️ Vitória contra ${nome}! Feridos: ${baixas.feridos}, destruídos: ${baixas.mortos}.`, 'sucesso');
    if (rec.msg) registrar(s, now, rec.msg, 'sucesso');
  } else {
    ganharXp(s, m.comandante, 10 * alvo.nivel, now);
    registrar(s, now, `💥 Derrota contra ${nome}. Restam ${totalTropas(alvo.tropas)} inimigos. Feridos: ${baixas.feridos}, destruídos: ${baixas.mortos}.`, 'erro');
  }
}

function processarMarcha(s, m, now) {
  while (m.fim !== null && m.fim <= now) {
    const alvo = s.mapa.find((e) => e.id === m.alvoId);
    if (m.fase === 'indo') {
      if (!alvo || (m.tipo === 'reforco' && alvo.alianca !== 'jogador')) {
        registrar(s, m.fim, 'O alvo desapareceu; frota retornando.');
        voltar(m, m.fim);
      } else if (m.tipo === 'ataque') {
        resolverAtaque(s, m, alvo, m.fim);
        voltar(m, m.fim);
      } else if (m.tipo === 'reforco') {
        m.fase = 'guarnecendo';
        m.inicio = m.fim;
        m.fim = null;
        registrar(s, m.inicio, `🪨 Reforço chegou a (${alvo.x}, ${alvo.y}).`);
      } else {
        const bonus = bonusMarcha(s, m.comandante, m.secundario);
        const noTerritorio = territorioDoJogador(s, alvo.x, alvo.y) ? 0.25 : 0;
        const taxa = 2 * m.tropas.extrator * (1 + 0.1 * s.pesquisas.logistica + (bonus.coleta || 0) + noTerritorio);
        m.coletaQtd = Math.min(cargaMarcha(s, m.tropas, m.comandante, m.secundario), alvo.quantidade);
        alvo.ocupadoPor = m.id;
        m.fase = 'coletando';
        m.inicio = m.fim;
        m.fim += (m.coletaQtd / Math.max(taxa, 1)) * 1000;
      }
    } else if (m.fase === 'coletando') {
      finalizarColeta(s, m, alvo, m.coletaQtd, m.fim);
      voltar(m, m.fim);
    } else if (m.fase === 'voltando') {
      for (const k of TIPOS_NAVE) s.tropas[k] += m.tropas[k];
      const coletado = Object.values(m.carga).reduce((a, b) => a + b, 0);
      receber(s, m.carga);
      if (m.tipo === 'coleta') s.stats.coletado += coletado;
      if (coletado) registrar(s, m.fim, `🚀 Frota retornou com ${Math.round(coletado)} recursos.`);
      s.marchas = s.marchas.filter((x) => x !== m);
      return;
    }
  }
}

// ---------- ataques à Nave-Cidade ----------

function atacarBase(s, now, exercito, atacante) {
  const muralha = s.edificios.muralha;
  const nivel = 2 + s.edificios.comando;
  const res = batalha(
    { tropas: exercito, mods: { ataque: nivel * 0.03, defesa: nivel * 0.03 } },
    { tropas: s.tropas, mods: { ataque: 0.05 * s.pesquisas.canhoes + 0.05 * muralha, defesa: 0.05 * s.pesquisas.blindagem + 0.1 * muralha } },
  );
  s.tropas = res.defensor;
  const baixas = registrarBaixas(s, res.perdasDefensor, 0.9); // na defesa, mais tripulações sobrevivem
  if (!res.vitoria) {
    s.stats.raidsDefendidas++;
    s.quasares += 10;
    registrar(s, now, `🛡️ Ataque de ${atacante} repelido! +10 Quasares. Feridos: ${baixas.feridos}.`, 'sucesso');
    return;
  }
  const perdas = [];
  for (const k of TIPOS_RECURSO) {
    const roubado = Math.floor(Math.max(0, s.recursos[k] - cofre(s)) * 0.2);
    s.recursos[k] -= roubado;
    perdas.push(`${roubado} ${RECURSOS[k].nome}`);
  }
  registrar(s, now, `🏴‍☠️ ${atacante} saqueou sua Nave-Cidade: ${perdas.join(', ')}. (Cofre, caixas e território protegem você.)`, 'erro');
}

function processarRaid(s, now) {
  if (s.edificios.comando < 3) return false;
  if (s.proximoRaid === null) s.proximoRaid = now + INTERVALO_RAID;
  if (now < s.proximoRaid) return false;
  if (naveProtegida(s, now)) {
    registrar(s, now, '🔰 Uma frota pirata desistiu de atacar: sua Nave-Cidade está protegida.');
  } else {
    atacarBase(s, now, gerarExercito(Math.max(1, s.edificios.comando - 1)), 'piratas espaciais');
  }
  s.proximoRaid = now + INTERVALO_RAID;
  return true;
}

// ---------- loop principal ----------

export function tick(s, now) {
  const dt = Math.max(0, Math.min(now - s.ultimoTick, MAX_OFFLINE)) / 1000;
  const cap = capacidade(s);
  const prod = producao(s);
  for (const k of TIPOS_RECURSO) {
    if (s.recursos[k] < cap) s.recursos[k] = Math.min(cap, s.recursos[k] + prod[k] * dt);
  }
  if (s.aliancas.jogador) s.aliancas.jogador.cristais += producaoDominio(s) * dt;

  const eventos = [];
  const concluir = (fila, fn) => {
    const prontos = s.filas[fila].filter((f) => f.fim <= now);
    if (!prontos.length) return;
    s.filas[fila] = s.filas[fila].filter((f) => f.fim > now);
    prontos.forEach(fn);
    eventos.push(fila);
  };
  concluir('construcao', (f) => {
    s.edificios[f.alvo] = f.nivel;
    registrar(s, f.fim, `🏗️ ${EDIFICIOS[f.alvo].nome} evoluído ao nível ${f.nivel}.`, 'sucesso');
  });
  concluir('treino', (f) => {
    s.tropas[f.alvo] += f.qtd;
    s.stats.tropasTreinadas += f.qtd;
    if (f.alvo === 'extrator') s.stats.extratoresTreinados += f.qtd;
    registrar(s, f.fim, `🚀 ${f.qtd}× ${NAVES[f.alvo].nome} prontas.`, 'sucesso');
  });
  concluir('pesquisa', (f) => {
    s.pesquisas[f.alvo] = f.nivel;
    s.stats.pesquisas++;
    registrar(s, f.fim, `🧪 ${PESQUISAS[f.alvo].nome} nível ${f.nivel} concluída.`, 'sucesso');
  });
  concluir('cura', (f) => {
    for (const k of TIPOS_NAVE) s.tropas[k] += f.tropas[k];
    registrar(s, f.fim, `🏥 ${totalTropas(f.tropas)} tripulantes reparados.`, 'sucesso');
  });

  const vencidas = s.marchas.filter((m) => m.fim !== null && m.fim <= now).sort((a, b) => a.fim - b.fim);
  vencidas.forEach((m) => processarMarcha(s, m, now));
  if (vencidas.length) eventos.push('marcha');

  eventos.push(...processarRivais(s, now));
  if (processarRaid(s, now)) eventos.push('raid');

  s.ultimoTick = now;
  return eventos;
}
