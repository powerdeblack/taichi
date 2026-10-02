// Regras do jogo. Funções puras sobre o objeto de estado (sem DOM), recebem `now` em ms.
import { RECURSOS, EDIFICIOS, NAVES, COMANDANTES, PESQUISAS, MISSOES } from './data.js';

export const TAMANHO_MAPA = 30;
export const SEG_POR_CASA = 3;
export const INTERVALO_RAID = 8 * 60 * 1000;
export const INTERVALO_PRESENTE = 10 * 60 * 1000;
export const MAX_OFFLINE = 8 * 3600 * 1000;
const MAX_NIVEL_COMANDANTE = 20;
const RODADAS = 20;

const TIPOS_NAVE = Object.keys(NAVES);
const TIPOS_RECURSO = Object.keys(RECURSOS);

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

const escalar = (custo, fator) =>
  Object.fromEntries(Object.entries(custo).map(([k, v]) => [k, Math.round(v * fator)]));

export const totalTropas = (t) => TIPOS_NAVE.reduce((n, k) => n + (t[k] || 0), 0);
const tropasVazias = () => Object.fromEntries(TIPOS_NAVE.map((k) => [k, 0]));

export function podePagar(s, custo) {
  return Object.entries(custo).every(([k, v]) => (k === 'quasares' ? s.quasares : s.recursos[k]) >= v);
}

function pagar(s, custo) {
  for (const [k, v] of Object.entries(custo)) {
    if (k === 'quasares') s.quasares -= v;
    else s.recursos[k] -= v;
  }
}

function receber(s, premio) {
  for (const [k, v] of Object.entries(premio)) {
    if (k === 'quasares') s.quasares += v;
    else s.recursos[k] = (s.recursos[k] || 0) + v;
  }
}

export function registrar(s, now, msg, tipo = 'info') {
  s.registro.unshift({ t: now, msg, tipo });
  s.registro.length = Math.min(s.registro.length, 80);
}

const novoId = (s) => s.proximoId++;

// ---------- estado inicial e mapa ----------

export function novoEstado(now = Date.now(), seed = Math.floor(Math.random() * 2 ** 31)) {
  const s = {
    versao: 1,
    nome: 'Comandante',
    seed,
    criadoEm: now,
    ultimoTick: now,
    proximoId: 1,
    recursos: { minerio: 2500, cristal: 2500, plasma: 600 },
    quasares: 100,
    edificios: { comando: 2, extrator: 1, minaCristal: 1, reator: 0, armazem: 1, estaleiro: 1, laboratorio: 0, hospital: 1, muralha: 0, embaixada: 0 },
    pesquisas: Object.fromEntries(Object.keys(PESQUISAS).map((k) => [k, 0])),
    tropas: { fragata: 60, caca: 0, cruzador: 40, cerco: 0 },
    feridos: tropasVazias(),
    comandantes: Object.fromEntries(
      Object.entries(COMANDANTES).filter(([, c]) => c.inicial).map(([k]) => [k, { nivel: 1, xp: 0 }]),
    ),
    filas: { construcao: [], treino: [], pesquisa: [], cura: [] },
    marchas: [],
    base: { x: Math.floor(TAMANHO_MAPA / 2), y: Math.floor(TAMANHO_MAPA / 2) },
    mapa: [],
    proximoRaid: null,
    ultimoPresente: 0,
    stats: { tropasTreinadas: 0, piratas: 0, fortalezas: 0, coletado: 0, pesquisas: 0, ajudas: 0, raidsDefendidas: 0, vitorias: 0 },
    missoesResgatadas: [],
    registro: [],
  };
  const r = rng(seed);
  for (let i = 0; i < 26; i++) gerarEntidade(s, 'recurso', r);
  for (let i = 0; i < 18; i++) gerarEntidade(s, 'pirata', r);
  for (let i = 0; i < 3; i++) gerarEntidade(s, 'fortaleza', r);
  registrar(s, now, 'Bem-vindo, Comandante! Expanda sua base e domine a galáxia.', 'sucesso');
  return s;
}

export function gerarExercito(nivel, fortaleza = false) {
  const total = Math.round(30 * Math.pow(nivel, 1.5) * (fortaleza ? 3 : 1));
  const fragata = Math.round(total * 0.4);
  const caca = Math.round(total * 0.25);
  return { fragata, caca, cruzador: total - fragata - caca, cerco: 0 };
}

function gerarEntidade(s, tipo, r) {
  const ocupado = new Set([`${s.base.x},${s.base.y}`, ...s.mapa.map((e) => `${e.x},${e.y}`)]);
  for (let tentativa = 0; tentativa < 500; tentativa++) {
    const x = Math.floor(r() * TAMANHO_MAPA);
    const y = Math.floor(r() * TAMANHO_MAPA);
    const dist = Math.hypot(x - s.base.x, y - s.base.y);
    if (ocupado.has(`${x},${y}`) || dist < 2) continue;
    if (tipo === 'fortaleza' && dist < 10) continue;
    const e = { id: novoId(s), tipo, x, y };
    if (tipo === 'recurso') {
      e.recurso = r() < 0.2 ? 'plasma' : r() < 0.5 ? 'minerio' : 'cristal';
      e.nivel = Math.min(5, 1 + Math.floor(dist / 5) + Math.floor(r() * 2));
      e.quantidade = 1500 * e.nivel + Math.floor(r() * 500);
      e.ocupadoPor = null;
    } else if (tipo === 'pirata') {
      e.nivel = Math.max(1, Math.min(10, 1 + Math.floor(dist / 4) + Math.floor(r() * 2)));
      e.tropas = gerarExercito(e.nivel);
    } else {
      e.nivel = 6 + Math.floor(r() * 4);
      e.tropas = gerarExercito(e.nivel, true);
    }
    s.mapa.push(e);
    return e;
  }
  return null;
}

function removerEntidade(s, id) {
  const e = s.mapa.find((x) => x.id === id);
  s.mapa = s.mapa.filter((x) => x.id !== id);
  if (e) gerarEntidade(s, e.tipo, rng(s.seed + s.proximoId * 7919));
}

// ---------- fórmulas ----------

export function bonusComandante(s, id) {
  const c = s.comandantes[id];
  if (!c) return {};
  const fator = 1 + 0.05 * (c.nivel - 1);
  return Object.fromEntries(Object.entries(COMANDANTES[id].bonus).map(([k, v]) => [k, v * fator]));
}

export const xpParaNivel = (nivel) => 100 * nivel;

export function capacidade(s) {
  return 4000 + 6000 * s.edificios.armazem;
}

export const protegido = (s) => 1000 * s.edificios.armazem;
export const capacidadeHospital = (s) => 300 * s.edificios.hospital;
export const loteMaximo = (s) => 100 * s.edificios.estaleiro;
export const vagasConstrucao = (s) => (s.edificios.comando >= 4 ? 2 : 1);
export const maxMarchas = (s) => 2 + (s.edificios.comando >= 6 ? 1 : 0);

export function producao(s) {
  const p = Object.fromEntries(TIPOS_RECURSO.map((k) => [k, 0]));
  const bonus = 1 + 0.1 * s.pesquisas.mineracao;
  for (const [id, def] of Object.entries(EDIFICIOS)) {
    if (!def.producao) continue;
    for (const [r, v] of Object.entries(def.producao)) p[r] += v * s.edificios[id] * bonus;
  }
  return p; // por segundo
}

export function custoEdificio(id, nivelAlvo) {
  return escalar(EDIFICIOS[id].custo, Math.pow(1.7, nivelAlvo - 1));
}

export function tempoEdificio(s, id, nivelAlvo) {
  return (EDIFICIOS[id].tempo * Math.pow(1.55, nivelAlvo - 1)) / (1 + 0.08 * s.pesquisas.engenharia);
}

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

export function custoPesquisa(id, nivelAlvo) {
  return escalar(PESQUISAS[id].custo, Math.pow(1.8, nivelAlvo - 1));
}

export function tempoPesquisa(id, nivelAlvo) {
  return PESQUISAS[id].tempo * Math.pow(1.6, nivelAlvo - 1);
}

export const custoCura = (tipo) => escalar(NAVES[tipo].custo, 0.25);

export const custoAceleracao = (restanteMs) => Math.max(1, Math.ceil(restanteMs / 30000));

export function poder(s) {
  let p = 0;
  for (const n of Object.values(s.edificios)) p += n * n * 40;
  const contar = (t) => { for (const k of TIPOS_NAVE) p += (t[k] || 0) * NAVES[k].poder; };
  contar(s.tropas);
  s.marchas.forEach((m) => contar(m.tropas));
  for (const n of Object.values(s.pesquisas)) p += n * 150;
  for (const c of Object.values(s.comandantes)) p += c.nivel * 50;
  return Math.round(p);
}

// ---------- verificações ----------

const falta = (motivo) => ({ ok: false, motivo });
const OK = { ok: true };

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
  if (s.filas.construcao.length >= vagasConstrucao(s)) return falta('Sem construtores livres');
  const req = requisitosAtendidos(s, requisitosEdificio(id, alvo));
  if (!req.ok) return req;
  if (!podePagar(s, custoEdificio(id, alvo))) return falta('Recursos insuficientes');
  return OK;
}

export function podeTreinar(s, tipo, qtd) {
  if (!Number.isInteger(qtd) || qtd <= 0) return falta('Quantidade inválida');
  if (qtd > loteMaximo(s)) return falta(`Lote máximo: ${loteMaximo(s)}`);
  if (s.filas.treino.length) return falta('Estaleiro ocupado');
  const req = requisitosAtendidos(s, NAVES[tipo].requer);
  if (!req.ok) return req;
  if (!podePagar(s, escalar(NAVES[tipo].custo, qtd))) return falta('Recursos insuficientes');
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

// ---------- ações ----------

export function evoluir(s, id, now) {
  const v = podeEvoluir(s, id);
  if (!v.ok) return v;
  const alvo = s.edificios[id] + 1;
  pagar(s, custoEdificio(id, alvo));
  s.filas.construcao.push({ id: novoId(s), alvo: id, nivel: alvo, inicio: now, fim: now + tempoEdificio(s, id, alvo) * 1000, ajudado: false });
  return OK;
}

export function treinar(s, tipo, qtd, now) {
  const v = podeTreinar(s, tipo, qtd);
  if (!v.ok) return v;
  pagar(s, escalar(NAVES[tipo].custo, qtd));
  const tempo = (NAVES[tipo].tempo * qtd) / (1 + 0.1 * (s.edificios.estaleiro - 1));
  s.filas.treino.push({ id: novoId(s), alvo: tipo, qtd, inicio: now, fim: now + tempo * 1000, ajudado: false });
  return OK;
}

export function pesquisar(s, id, now) {
  const v = podePesquisar(s, id);
  if (!v.ok) return v;
  const alvo = s.pesquisas[id] + 1;
  pagar(s, custoPesquisa(id, alvo));
  s.filas.pesquisa.push({ id: novoId(s), alvo: id, nivel: alvo, inicio: now, fim: now + tempoPesquisa(id, alvo) * 1000, ajudado: false });
  return OK;
}

export function curar(s, now) {
  const qtd = totalTropas(s.feridos);
  if (!qtd) return falta('Nenhuma tripulação ferida');
  if (s.filas.cura.length) return falta('Baía Médica ocupada');
  const custo = {};
  for (const k of TIPOS_NAVE) {
    for (const [r, v] of Object.entries(custoCura(k))) custo[r] = (custo[r] || 0) + v * s.feridos[k];
  }
  if (!podePagar(s, custo)) return falta('Recursos insuficientes');
  pagar(s, custo);
  s.filas.cura.push({ id: novoId(s), tropas: { ...s.feridos }, inicio: now, fim: now + qtd * 400, ajudado: false });
  s.feridos = tropasVazias();
  return OK;
}

function acharItem(s, fila, itemId) {
  return (s.filas[fila] || []).find((f) => f.id === itemId);
}

export function acelerar(s, fila, itemId, now) {
  const item = acharItem(s, fila, itemId);
  if (!item) return falta('Item não encontrado');
  const custo = custoAceleracao(item.fim - now);
  if (s.quasares < custo) return falta(`Requer ${custo} Quasares`);
  s.quasares -= custo;
  item.fim = now;
  return OK;
}

export function ajudaAlianca(s, fila, itemId, now) {
  if (s.edificios.embaixada < 1) return falta('Construa a Embaixada Galáctica');
  const item = acharItem(s, fila, itemId);
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

export function presenteDisponivel(s, now) {
  return s.edificios.embaixada >= 1 && now - s.ultimoPresente >= INTERVALO_PRESENTE;
}

export function resgatarPresente(s, now) {
  if (!presenteDisponivel(s, now)) return falta('Presente ainda não disponível');
  const n = s.edificios.embaixada;
  const premio = { minerio: 400 * n, cristal: 400 * n, plasma: 150 * n, quasares: 5 + 2 * n };
  receber(s, premio);
  s.ultimoPresente = now;
  registrar(s, now, '🎁 Presente da aliança recebido!', 'sucesso');
  return OK;
}

export function recrutar(s, id, now) {
  const def = COMANDANTES[id];
  if (!def || s.comandantes[id]) return falta('Indisponível');
  if (s.quasares < def.custo) return falta(`Requer ${def.custo} Quasares`);
  s.quasares -= def.custo;
  s.comandantes[id] = { nivel: 1, xp: 0 };
  registrar(s, now, `${def.icone} ${def.nome} juntou-se à sua frota!`, 'sucesso');
  return OK;
}

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

// ---------- marchas ----------

export const comandanteOcupado = (s, id) => s.marchas.some((m) => m.comandante === id);

export function velocidadeMarcha(s, tropas, comandante) {
  const tipos = TIPOS_NAVE.filter((k) => tropas[k] > 0);
  if (!tipos.length) return 0;
  const base = Math.min(...tipos.map((k) => NAVES[k].vel));
  return base * (1 + 0.1 * s.pesquisas.warp + (bonusComandante(s, comandante).velocidade || 0));
}

export function cargaMarcha(s, tropas) {
  return Math.round(TIPOS_NAVE.reduce((n, k) => n + (tropas[k] || 0) * NAVES[k].carga, 0) * (1 + 0.1 * s.pesquisas.logistica));
}

export function tempoViagem(s, alvo, tropas, comandante) {
  const dist = Math.hypot(alvo.x - s.base.x, alvo.y - s.base.y);
  return (dist * SEG_POR_CASA) / velocidadeMarcha(s, tropas, comandante);
}

export function enviarMarcha(s, { alvoId, comandante, tropas }, now) {
  const alvo = s.mapa.find((e) => e.id === alvoId);
  if (!alvo) return falta('Alvo não encontrado');
  if (!s.comandantes[comandante]) return falta('Comandante não recrutado');
  if (comandanteOcupado(s, comandante)) return falta('Comandante já está em marcha');
  if (s.marchas.length >= maxMarchas(s)) return falta(`Máximo de ${maxMarchas(s)} marchas`);
  const t = tropasVazias();
  for (const k of TIPOS_NAVE) {
    const q = Math.floor(tropas[k] || 0);
    if (q < 0 || q > s.tropas[k]) return falta(`Naves insuficientes: ${NAVES[k].nome}`);
    t[k] = q;
  }
  if (!totalTropas(t)) return falta('Selecione naves');
  if (alvo.tipo === 'recurso' && alvo.ocupadoPor) return falta('Outra frota já coleta aqui');
  for (const k of TIPOS_NAVE) s.tropas[k] -= t[k];
  const viagem = tempoViagem(s, alvo, t, comandante) * 1000;
  if (alvo.tipo === 'recurso') alvo.ocupadoPor = -1; // reservado até a chegada
  s.marchas.push({
    id: novoId(s), tipo: alvo.tipo === 'recurso' ? 'coleta' : 'ataque', alvoId, alvoX: alvo.x, alvoY: alvo.y,
    comandante, tropas: t, fase: 'indo', inicio: now, fim: now + viagem, viagem, carga: {},
  });
  return OK;
}

export function retornarMarcha(s, marchaId, now) {
  const m = s.marchas.find((x) => x.id === marchaId);
  if (!m || m.fase === 'voltando') return falta('Marcha não pode retornar');
  const alvo = s.mapa.find((e) => e.id === m.alvoId);
  if (m.fase === 'indo') {
    if (alvo && alvo.tipo === 'recurso') alvo.ocupadoPor = null;
    const percorrido = now - m.inicio;
    m.fase = 'voltando';
    m.inicio = now;
    m.fim = now + percorrido;
  } else {
    const frac = Math.min(1, (now - m.inicio) / (m.fim - m.inicio || 1));
    finalizarColeta(s, m, alvo, Math.floor(m.coletaQtd * frac));
    voltar(m, now);
  }
  return OK;
}

function voltar(m, desde) {
  m.fase = 'voltando';
  m.inicio = desde;
  m.fim = desde + m.viagem;
}

function finalizarColeta(s, m, alvo, qtd) {
  if (!alvo) return;
  const real = Math.min(qtd, alvo.quantidade);
  alvo.quantidade -= real;
  m.carga[alvo.recurso] = (m.carga[alvo.recurso] || 0) + real;
  alvo.ocupadoPor = null;
  if (alvo.quantidade <= 0) removerEntidade(s, alvo.id);
}

function ganharXp(s, id, xp, now) {
  const c = s.comandantes[id];
  if (!c) return;
  c.xp += xp;
  while (c.nivel < MAX_NIVEL_COMANDANTE && c.xp >= xpParaNivel(c.nivel)) {
    c.xp -= xpParaNivel(c.nivel);
    c.nivel++;
    registrar(s, now, `⭐ ${COMANDANTES[id].nome} alcançou o nível ${c.nivel}!`, 'sucesso');
  }
}

function modsJogador(s, comandante, alvo) {
  const b = bonusComandante(s, comandante);
  return {
    ataque: 0.05 * s.pesquisas.canhoes + (b.ataque || 0) + (alvo?.tipo === 'pirata' ? b.piratas || 0 : 0),
    defesa: 0.05 * s.pesquisas.blindagem + (b.defesa || 0),
  };
}

// Feridos vão para a Baía Médica até a capacidade; o resto é perdido.
function registrarBaixas(s, perdas) {
  let livre = capacidadeHospital(s) - totalTropas(s.feridos) - s.filas.cura.reduce((n, f) => n + totalTropas(f.tropas), 0);
  let feridos = 0;
  let mortos = 0;
  for (const k of TIPOS_NAVE) {
    const f = Math.max(0, Math.min(livre, Math.floor(perdas[k] * 0.7)));
    livre -= f;
    s.feridos[k] += f;
    feridos += f;
    mortos += perdas[k] - f;
  }
  return { feridos, mortos };
}

function resolverAtaque(s, m, alvo, now) {
  const res = batalha(
    { tropas: m.tropas, mods: modsJogador(s, m.comandante, alvo) },
    { tropas: alvo.tropas, mods: { ataque: alvo.nivel * 0.03, defesa: alvo.nivel * 0.03 } },
    { alvoFortaleza: alvo.tipo === 'fortaleza' },
  );
  m.tropas = res.atacante;
  alvo.tropas = res.defensor;
  const baixas = registrarBaixas(s, res.perdasAtacante);
  const nome = alvo.tipo === 'pirata' ? `Piratas nv.${alvo.nivel}` : `Fortaleza Xeno nv.${alvo.nivel}`;
  if (res.vitoria) {
    const mult = alvo.tipo === 'fortaleza' ? 4 : 1;
    const saque = { minerio: 300 * alvo.nivel * mult, cristal: 250 * alvo.nivel * mult, plasma: 100 * alvo.nivel * mult };
    for (const [k, v] of Object.entries(saque)) m.carga[k] = (m.carga[k] || 0) + v;
    const q = (alvo.tipo === 'fortaleza' ? 40 : 5) * alvo.nivel;
    s.quasares += q;
    s.stats.vitorias++;
    if (alvo.tipo === 'pirata') s.stats.piratas++;
    else s.stats.fortalezas++;
    ganharXp(s, m.comandante, 30 * alvo.nivel * mult, now);
    removerEntidade(s, alvo.id);
    registrar(s, now, `⚔️ Vitória contra ${nome}! +${q} Quasares, saque a caminho. Feridos: ${baixas.feridos}, perdidos: ${baixas.mortos}.`, 'sucesso');
  } else {
    ganharXp(s, m.comandante, 10 * alvo.nivel, now);
    registrar(s, now, `💥 Derrota contra ${nome}. Restam ${totalTropas(alvo.tropas)} inimigos. Feridos: ${baixas.feridos}, perdidos: ${baixas.mortos}.`, 'erro');
  }
  return res;
}

function processarMarcha(s, m, now) {
  while (m.fim <= now) {
    const alvo = s.mapa.find((e) => e.id === m.alvoId);
    if (m.fase === 'indo') {
      if (!alvo) {
        registrar(s, m.fim, 'O alvo desapareceu; frota retornando.');
        voltar(m, m.fim);
      } else if (m.tipo === 'ataque') {
        resolverAtaque(s, m, alvo, m.fim);
        voltar(m, m.fim);
      } else {
        const taxa = 10 * (1 + 0.1 * s.pesquisas.logistica + (bonusComandante(s, m.comandante).coleta || 0));
        m.coletaQtd = Math.min(cargaMarcha(s, m.tropas), alvo.quantidade);
        alvo.ocupadoPor = m.id;
        m.fase = 'coletando';
        m.inicio = m.fim;
        m.fim += (m.coletaQtd / taxa) * 1000;
      }
    } else if (m.fase === 'coletando') {
      finalizarColeta(s, m, alvo, m.coletaQtd);
      voltar(m, m.fim);
    } else {
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

// ---------- combate ----------

function danoCausado(tropas, mods, inimigo, alvoFortaleza) {
  const totalInimigo = totalTropas(inimigo) || 1;
  let dano = 0;
  for (const k of TIPOS_NAVE) {
    const n = tropas[k];
    if (!n) continue;
    const def = NAVES[k];
    let mult = 1 + 0.3 * ((def.forteContra ? inimigo[def.forteContra] || 0 : 0) / totalInimigo);
    if (alvoFortaleza && def.bonusFortaleza) mult *= def.bonusFortaleza;
    dano += n * def.atk * (1 + mods.ataque) * mult * 0.1;
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
    const hpEfetivo = def.hp * (def.def / 10) * (1 + mods.defesa);
    const mortos = Math.min(n, Math.round(((dano * n) / total) / hpEfetivo));
    tropas[k] -= mortos;
    perdas[k] += mortos;
  }
}

// Combate determinístico em rodadas simultâneas.
export function batalha(atacante, defensor, opts = {}) {
  const A = { ...tropasVazias(), ...atacante.tropas };
  const D = { ...tropasVazias(), ...defensor.tropas };
  const perdasAtacante = tropasVazias();
  const perdasDefensor = tropasVazias();
  let rodadas = 0;
  while (rodadas < RODADAS && totalTropas(A) > 0 && totalTropas(D) > 0) {
    const danoA = danoCausado(A, atacante.mods, D, opts.alvoFortaleza);
    const danoD = danoCausado(D, defensor.mods, A, false);
    aplicarDano(D, danoA, defensor.mods, perdasDefensor);
    aplicarDano(A, danoD, atacante.mods, perdasAtacante);
    rodadas++;
  }
  // Só há vitória do atacante se a frota inimiga for aniquilada.
  const vitoria = totalTropas(D) === 0 && totalTropas(A) > 0;
  return { vitoria, rodadas, atacante: A, defensor: D, perdasAtacante, perdasDefensor };
}

// ---------- invasões piratas à base ----------

function resolverRaid(s, now) {
  const nivel = Math.max(1, s.edificios.comando - 1);
  const muralha = s.edificios.muralha;
  const res = batalha(
    { tropas: gerarExercito(nivel), mods: { ataque: nivel * 0.03, defesa: nivel * 0.03 } },
    { tropas: s.tropas, mods: { ataque: 0.05 * s.pesquisas.canhoes + 0.05 * muralha, defesa: 0.05 * s.pesquisas.blindagem + 0.1 * muralha } },
  );
  s.tropas = res.defensor;
  const baixas = registrarBaixas(s, res.perdasDefensor);
  if (!res.vitoria) {
    s.stats.raidsDefendidas++;
    s.quasares += 10 * nivel;
    registrar(s, now, `🛡️ Invasão pirata nv.${nivel} repelida! +${10 * nivel} Quasares. Feridos: ${baixas.feridos}.`, 'sucesso');
  } else {
    const perdas = [];
    for (const k of TIPOS_RECURSO) {
      const roubado = Math.floor(Math.max(0, s.recursos[k] - protegido(s)) * 0.15);
      s.recursos[k] -= roubado;
      perdas.push(`${roubado} ${RECURSOS[k].nome}`);
    }
    registrar(s, now, `🏴‍☠️ Piratas nv.${nivel} saquearam a base: ${perdas.join(', ')}.`, 'erro');
  }
}

// ---------- loop principal ----------

export function tick(s, now) {
  const dt = Math.max(0, Math.min(now - s.ultimoTick, MAX_OFFLINE)) / 1000;
  const cap = capacidade(s);
  const prod = producao(s);
  for (const k of TIPOS_RECURSO) {
    if (s.recursos[k] < cap) s.recursos[k] = Math.min(cap, s.recursos[k] + prod[k] * dt);
  }

  const eventos = [];
  const concluir = (fila, fn) => {
    const prontos = s.filas[fila].filter((f) => f.fim <= now);
    if (!prontos.length) return;
    s.filas[fila] = s.filas[fila].filter((f) => f.fim > now);
    prontos.forEach(fn);
  };
  concluir('construcao', (f) => {
    s.edificios[f.alvo] = f.nivel;
    registrar(s, f.fim, `🏗️ ${EDIFICIOS[f.alvo].nome} evoluído ao nível ${f.nivel}.`, 'sucesso');
    eventos.push('construcao');
  });
  concluir('treino', (f) => {
    s.tropas[f.alvo] += f.qtd;
    s.stats.tropasTreinadas += f.qtd;
    registrar(s, f.fim, `🚀 ${f.qtd}× ${NAVES[f.alvo].nome} prontas.`, 'sucesso');
    eventos.push('treino');
  });
  concluir('pesquisa', (f) => {
    s.pesquisas[f.alvo] = f.nivel;
    s.stats.pesquisas++;
    registrar(s, f.fim, `🧪 ${PESQUISAS[f.alvo].nome} nível ${f.nivel} concluída.`, 'sucesso');
    eventos.push('pesquisa');
  });
  concluir('cura', (f) => {
    for (const k of TIPOS_NAVE) s.tropas[k] += f.tropas[k];
    registrar(s, f.fim, `🏥 ${totalTropas(f.tropas)} tripulantes recuperados.`, 'sucesso');
    eventos.push('cura');
  });

  const vencidas = s.marchas.filter((m) => m.fim <= now).sort((a, b) => a.fim - b.fim);
  vencidas.forEach((m) => processarMarcha(s, m, now));
  if (vencidas.length) eventos.push('marcha');

  if (s.edificios.comando >= 3) {
    if (s.proximoRaid === null) s.proximoRaid = now + INTERVALO_RAID;
    if (now >= s.proximoRaid) {
      resolverRaid(s, now);
      s.proximoRaid = now + INTERVALO_RAID;
      eventos.push('raid');
    }
  }

  s.ultimoTick = now;
  return eventos;
}
