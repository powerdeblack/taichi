// Inicialização, loop do jogo, salvamento e tratamento de ações da interface.
import * as E from './engine.js';
import * as W from './wallet.js';
import { NAVES } from './data.js';
import {
  TELAS, recursosHtml, abasHtml, alertasAbas, lateralHtml, painelSelecaoHtml, modalMarchaHtml, resumoMarcha, fmtTempo,
  hudMarchasHtml, hudMarcadoresHtml, FILTROS,
} from './ui.js';
import { desenharMapa, desenharMinimapa, celulaDoClique, progressoMarcha } from './mapa.js';
import { TAMANHO_MAPA } from './territorio.js';

const PREFIXO = 'guerra-sideral:v2:';
const $ = (id) => document.getElementById(id);

// ---------- persistência (uma partida por Nave-Cidade) ----------

const chaveSave = (tokenId) => PREFIXO + (tokenId ? `nave:${tokenId}` : 'local');

function lerStorage(chave) {
  try { return localStorage.getItem(chave); } catch { return null; }
}
function gravarStorage(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch { /* modo privado ou cota cheia */ }
}

function carregar(tokenId) {
  const bruto = lerStorage(chaveSave(tokenId));
  if (bruto) {
    try {
      const s = JSON.parse(bruto);
      if (s.versao === 2) return E.migrar(s);
    } catch { /* save corrompido: começa de novo */ }
  }
  const s = E.novoEstado(Date.now());
  s.nave.tokenId = tokenId || null;
  return s;
}

function lerJson(chave) {
  try { return JSON.parse(lerStorage(chave)) || {}; } catch { return {}; }
}

function salvar() {
  gravarStorage(chaveSave(s.nave.tokenId), JSON.stringify(s));
  gravarStorage(PREFIXO + 'atual', String(s.nave.tokenId || ''));
}

// ---------- estado da interface ----------

let s = carregar(Number(lerStorage(PREFIXO + 'atual')) || null);
const ui = {
  aba: 'nave',
  selecionado: null,
  zoom: 1,
  celula: 16,
  ultimoHtml: {},
  vistoRegistro: s.registro[0]?.t ?? 0,
  modalAlvo: null,
  filtros: { ...Object.fromEntries(FILTROS.map(([id]) => [id, true])), ...lerJson(PREFIXO + 'filtros') },
  paineis: { busca: false, marcadores: false, filtro: false },
  carteira: {
    providerDisponivel: Boolean(W.providerInjetado()),
    configurado: W.contratosConfigurados(),
    nome: W.nomeCarteira(),
    endereco: null,
  },
};

// ---------- avisos ----------

function aviso(msg, tipo = 'info') {
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.textContent = msg;
  $('avisos').append(el);
  setTimeout(() => el.remove(), 4500);
}

function resultado(r, msgOk) {
  if (r.ok) {
    if (msgOk) aviso(msgOk, 'sucesso');
  } else {
    aviso(r.motivo, 'erro');
  }
  renderizar(true);
  salvar();
  return r.ok;
}

// ---------- renderização ----------

function definirHtml(id, html) {
  if (ui.ultimoHtml[id] === html) return false;
  ui.ultimoHtml[id] = html;
  $(id).innerHTML = html;
  return true;
}

function digitando() {
  const a = document.activeElement;
  return a && ['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName) && a.type !== 'checkbox' && $('conteudo').contains(a);
}

function renderizar(forcar = false) {
  const now = Date.now();
  definirHtml('recursos', recursosHtml(s, now));
  definirHtml('abas', abasHtml(ui.aba, alertasAbas(s, now)));
  definirHtml('lateral', lateralHtml(s, now));
  const w = ui.carteira;
  $('botaoCarteira').textContent = w.endereco ? `⛓️ ${w.endereco.slice(0, 6)}…${w.endereco.slice(-4)}` : '⛓️ Conectar Ronin';
  if (forcar || !digitando()) {
    const mudou = definirHtml('conteudo', TELAS[ui.aba](s, now, { ...ui, rede: W.rede() }));
    if (ui.aba === 'galaxia') {
      if (mudou) {
        // Os painéis do HUD foram recriados vazios: invalida o cache para preenchê-los de novo.
        for (const id of ['painelSelecao', 'hudMarchas', 'hudMarcadores']) delete ui.ultimoHtml[id];
        ligarMapa();
      }
      atualizarPainelSelecao();
      atualizarHud();
    }
  }
  atualizarRelogios(now);
}

function atualizarRelogios(now) {
  for (const el of document.querySelectorAll('[data-fim]')) {
    el.textContent = fmtTempo(Number(el.dataset.fim) - now);
  }
}

function avisarNovosRegistros() {
  const novos = s.registro.filter((r) => r.t > ui.vistoRegistro).slice(0, 3);
  for (const r of novos.reverse()) aviso(r.msg, r.tipo === 'erro' ? 'erro' : r.tipo === 'sucesso' ? 'sucesso' : 'info');
  if (s.registro[0]) ui.vistoRegistro = Math.max(ui.vistoRegistro, s.registro[0].t);
}

// ---------- mapa e HUD ----------

function ligarMapa() {
  const canvas = $('mapa');
  if (!canvas) return;
  canvas.addEventListener('click', (ev) => {
    const cel = celulaDoClique(canvas, ev, ui.celula);
    if (!cel) return;
    ui.selecionado = cel;
    atualizarPainelSelecao();
  });
  canvas.addEventListener('mousemove', (ev) => {
    const cel = celulaDoClique(canvas, ev, ui.celula);
    if (cel && $('hudCoord')) $('hudCoord').textContent = `X:${cel.x} Y:${cel.y}`;
  });
  $('moldura').addEventListener('scroll', (ev) => {
    ui.rolagem = { left: ev.currentTarget.scrollLeft, top: ev.currentTarget.scrollTop };
    desenharMini();
  }, { passive: true });
  $('minimapa').addEventListener('click', (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    centralizar(((ev.clientX - r.left) / r.width) * TAMANHO_MAPA, ((ev.clientY - r.top) / r.height) * TAMANHO_MAPA);
  });
  desenhar();
  if (ui.centralizarAoAbrir !== false || !ui.rolagem) {
    centralizar(s.base.x + 0.5, s.base.y + 0.5);
  } else {
    $('moldura').scrollLeft = ui.rolagem.left;
    $('moldura').scrollTop = ui.rolagem.top;
    desenharMini();
  }
  ui.centralizarAoAbrir = false;
}

function atualizarPainelSelecao() {
  if ($('painelSelecao')) definirHtml('painelSelecao', painelSelecaoHtml(s, ui.selecionado));
  atualizarRelogios(Date.now());
}

function atualizarHud() {
  if ($('hudMarchas')) definirHtml('hudMarchas', hudMarchasHtml(s));
  if ($('hudMarcadores')) definirHtml('hudMarcadores', hudMarcadoresHtml(s));
}

function desenhar() {
  const canvas = $('mapa');
  if (!canvas) return;
  ui.celula = desenharMapa(canvas, s, { selecionado: ui.selecionado, zoom: ui.zoom, now: Date.now(), filtros: ui.filtros });
  desenharMini();
}

function desenharMini() {
  const mini = $('minimapa');
  const moldura = $('moldura');
  if (!mini || !moldura) return;
  const c = ui.celula;
  desenharMinimapa(mini, s, { x: moldura.scrollLeft / c, y: moldura.scrollTop / c, w: moldura.clientWidth / c, h: moldura.clientHeight / c });
}

// Rola o mapa para deixar a coordenada (em casas) no centro da área visível.
function centralizar(x, y) {
  const moldura = $('moldura');
  if (!moldura) return;
  moldura.scrollLeft = x * ui.celula - moldura.clientWidth / 2;
  moldura.scrollTop = y * ui.celula - moldura.clientHeight / 2;
  desenharMini();
}

function irPara(x, y) {
  ui.selecionado = { x, y };
  if (ui.aba !== 'galaxia') {
    ui.aba = 'galaxia';
    renderizar(true);
  }
  centralizar(x + 0.5, y + 0.5);
  atualizarPainelSelecao();
}

function mudarZoom(delta) {
  const moldura = $('moldura');
  const centro = moldura
    ? { x: (moldura.scrollLeft + moldura.clientWidth / 2) / ui.celula, y: (moldura.scrollTop + moldura.clientHeight / 2) / ui.celula }
    : { x: s.base.x, y: s.base.y };
  ui.zoom = Math.min(3, Math.max(1, ui.zoom + delta));
  renderizar(true);
  desenhar();
  centralizar(centro.x, centro.y);
}

document.addEventListener('change', (ev) => {
  const filtro = ev.target.dataset?.filtro;
  if (!filtro) return;
  ui.filtros[filtro] = ev.target.checked;
  gravarStorage(PREFIXO + 'filtros', JSON.stringify(ui.filtros));
  desenhar();
});

// ---------- modal de marcha ----------

function abrirMarcha(alvoId) {
  const alvo = s.mapa.find((e) => e.id === alvoId);
  if (!alvo) return;
  ui.modalAlvo = alvoId;
  $('modal').innerHTML = modalMarchaHtml(s, alvo);
  $('modal').hidden = false;
  atualizarResumo();
  $('modal').querySelector('input, select')?.focus();
}

function fecharModal() {
  ui.modalAlvo = null;
  $('modal').hidden = true;
  $('modal').innerHTML = '';
}

function lerMarcha() {
  const tropas = {};
  for (const input of $('modal').querySelectorAll('[data-nave]')) tropas[input.dataset.nave] = Math.max(0, Math.floor(Number(input.value) || 0));
  return { tropas, comandante: $('mPrincipal')?.value, secundario: $('mSecundario')?.value || null };
}

function atualizarResumo() {
  const alvo = s.mapa.find((e) => e.id === ui.modalAlvo);
  const el = $('mResumo');
  if (!alvo || !el) return;
  const { tropas, comandante, secundario } = lerMarcha();
  el.textContent = resumoMarcha(s, alvo, tropas, comandante, secundario);
}

// ---------- carteira ----------

async function atualizarCarteira() {
  const w = ui.carteira;
  if (!w.endereco || !w.configurado) return;
  try {
    const [saldo, naves, precoNave, fragmentos, estrelas, precoSinal, setor] = await Promise.all([
      W.saldoRon(w.endereco), W.listarNaves(w.endereco), W.precoNave(w.endereco), W.fragmentosOnChain(w.endereco),
      W.estrelasOnChain(w.endereco), W.precoSinal(), W.jogadorSetor(w.endereco),
    ]);
    Object.assign(w, {
      saldo: Number(saldo).toFixed(3), naves, precoNave: await W.formatarRon(precoNave), fragmentos, estrelas,
      precoSinal: await W.formatarRon(precoSinal), setor,
    });
    // Check-in feito on-chain (inclusive em outro aparelho) e ainda não recompensado nesta nave.
    if (setor.registrado && setor.ultimoDia > s.checkIn.ultimoDia) {
      E.recompensarCheckIn(s, setor.ultimoDia, setor.sequencia, Date.now());
      salvar();
    }
  } catch (e) {
    aviso(`Falha ao ler a blockchain: ${W.mensagemErro(e)}`, 'erro');
  }
  renderizar(true);
}

async function conectarCarteira(silencioso = false) {
  const w = ui.carteira;
  try {
    if (silencioso) {
      const contas = await W.providerInjetado()?.request({ method: 'eth_accounts' });
      if (!contas?.length) return;
      w.endereco = contas[0];
    } else {
      w.endereco = await W.conectar();
      aviso('Carteira conectada!', 'sucesso');
    }
    renderizar(true);
    await atualizarCarteira();
  } catch (e) {
    if (!silencioso) aviso(W.mensagemErro(e), 'erro');
  }
}

async function transacao(rotulo, fn, depois) {
  const w = ui.carteira;
  if (w.ocupado) return;
  w.ocupado = `${rotulo}: confirme na carteira…`;
  renderizar(true);
  try {
    const { hash, recibo } = await fn();
    w.ultimaTx = { hash, link: W.linkTx(hash) };
    aviso(`${rotulo}: confirmado on-chain!`, 'sucesso');
    w.ocupado = null;
    await atualizarCarteira();
    if (depois) await depois(recibo);
  } catch (e) {
    aviso(`${rotulo}: ${W.mensagemErro(e)}`, 'erro');
  } finally {
    w.ocupado = null;
    renderizar(true);
  }
}

function trocarNave(tokenId, nome) {
  salvar();
  s = carregar(tokenId);
  s.nave.tokenId = tokenId;
  if (nome) s.nome = nome;
  ui.vistoRegistro = s.registro[0]?.t ?? 0;
  ui.selecionado = null;
  salvar();
  aviso(`Comandando a Nave-Cidade #${tokenId}.`, 'sucesso');
  renderizar(true);
}

// ---------- ações ----------

const NOME_VALIDO = /^[A-Za-z0-9 _-]{1,24}$/;

const ACOES = {
  aba: (d) => {
    if (d.aba === 'galaxia' && ui.aba !== 'galaxia') ui.centralizarAoAbrir = true;
    ui.aba = d.aba;
    renderizar(true);
    window.scrollTo({ top: 0 });
  },
  evoluir: (d) => resultado(E.evoluir(s, d.id, Date.now())),
  treinar: (d) => {
    const qtd = Math.floor(Number($(`qtd-${d.id}`)?.value) || 0);
    resultado(E.treinar(s, d.id, qtd, Date.now()), `Fabricando ${qtd}× ${NAVES[d.id].nome}.`);
  },
  pesquisar: (d) => resultado(E.pesquisar(s, d.id, Date.now())),
  curar: () => resultado(E.curar(s, Date.now())),
  acelerar: (d) => resultado(E.acelerar(s, d.fila, Number(d.id), Date.now())),
  ajuda: (d) => resultado(E.ajudaAlianca(s, d.fila, Number(d.id), Date.now())),
  retornar: (d) => resultado(E.retornarMarcha(s, Number(d.id), Date.now()), 'Frota retornando.'),
  presente: () => resultado(E.resgatarPresente(s, Date.now())),
  missao: (d) => resultado(E.resgatarMissao(s, d.id, Date.now())),
  usar: (d) => resultado(E.usarItem(s, d.id, Date.now()), 'Item usado.'),
  desbloquear: (d) => resultado(E.desbloquearComandante(s, d.id, Date.now())),
  estrela: (d) => resultado(E.evoluirEstrela(s, d.id, Date.now())),
  sinal: (d) => resultado(E.abrirSinal(s, d.id, Date.now(), { gratis: Boolean(d.gratis), comQuasares: Boolean(d.quasares) })),
  fundar: () => resultado(E.fundarAlianca(s, $('nomeAlianca')?.value, $('tagAlianca')?.value, Date.now())),
  estacao: (d) => resultado(E.ancorarEstacao(s, Number(d.x), Number(d.y), Date.now())) && atualizarPainelSelecao(),
  monolito: (d) => resultado(E.erguerMonolito(s, Number(d.x), Number(d.y), Date.now())) && atualizarPainelSelecao(),
  saltar: (d) => resultado(E.saltar(s, Number(d.x), Number(d.y), Date.now())) && atualizarPainelSelecao(),
  irMapa: (d) => irPara(Number(d.x), Number(d.y)),
  irPara: (d) => irPara(Number(d.x), Number(d.y)),
  zoom: (d) => mudarZoom(Number(d.delta)),
  alternar: (d) => { ui.paineis[d.painel] = !ui.paineis[d.painel]; renderizar(true); atualizarHud(); },
  buscar: () => {
    const x = Math.floor(Number($('buscaX')?.value));
    const y = Math.floor(Number($('buscaY')?.value));
    if (!(x >= 0 && y >= 0 && x < TAMANHO_MAPA && y < TAMANHO_MAPA)) return aviso(`Coordenadas de 0 a ${TAMANHO_MAPA - 1}.`, 'erro');
    irPara(x, y);
  },
  marcar: (d) => {
    const x = Number(d.x);
    const y = Number(d.y);
    const e = s.mapa.find((m) => m.x === x && m.y === y);
    const nome = e ? E.nomeAlvo(s, e) : `Setor ${E.regiao(x, y)} ${x},${y}`;
    resultado(E.adicionarMarcador(s, x, y, nome), 'Marcador salvo.') && atualizarPainelSelecao();
    atualizarHud();
  },
  removerMarcador: (d) => { resultado(E.removerMarcador(s, Number(d.x), Number(d.y))); atualizarPainelSelecao(); atualizarHud(); },
  centralizarBase: () => irPara(s.base.x, s.base.y),
  centralizarMarcha: (d) => {
    const m = s.marchas.find((x) => x.id === Number(d.id));
    if (!m) return;
    const p = progressoMarcha(m, Date.now());
    centralizar(s.base.x + 0.5 + (m.alvoX - s.base.x) * p, s.base.y + 0.5 + (m.alvoY - s.base.y) * p);
  },
  sonda: (d) => resultado(E.enviarSonda(s, Number(d.id), Date.now()), 'Sonda lançada!') && atualizarPainelSelecao(),
  marcha: (d) => abrirMarcha(Number(d.id)),
  maxNave: (d) => { const i = $(`m-${d.id}`); if (i) i.value = s.tropas[d.id]; atualizarResumo(); },
  fecharModal,
  confirmarMarcha: (d) => {
    const { tropas, comandante, secundario } = lerMarcha();
    if (resultado(E.enviarMarcha(s, { alvoId: Number(d.id), comandante, secundario, tropas }, Date.now()), 'Frota enviada!')) {
      fecharModal();
      atualizarPainelSelecao();
    }
  },
  reiniciar: () => { ui.confirmarReinicio = true; renderizar(true); },
  cancelarReinicio: () => { ui.confirmarReinicio = false; renderizar(true); },
  confirmarReinicio: () => {
    ui.confirmarReinicio = false;
    const tokenId = s.nave.tokenId;
    s = E.novoEstado(Date.now());
    s.nave.tokenId = tokenId;
    ui.vistoRegistro = 0;
    salvar();
    renderizar(true);
  },

  // ----- on-chain -----
  conectar: () => conectarCarteira(false),
  atualizarCarteira: () => atualizarCarteira(),
  selecionarNave: (d) => {
    const nave = ui.carteira.naves?.find((n) => n.tokenId === Number(d.id));
    trocarNave(Number(d.id), nave?.nome);
  },
  criarNave: () => {
    const nome = ($('nomeNave')?.value || '').trim();
    if (!NOME_VALIDO.test(nome)) return aviso('Nome: 1–24 letras sem acento, números, espaço, - ou _.', 'erro');
    transacao('Criar Nave-Cidade', () => W.criarNave(ui.carteira.endereco, nome), () => {
      const nova = ui.carteira.naves?.at(-1);
      if (nova) trocarNave(nova.tokenId, nova.nome);
    });
  },
  sinalOnChain: () => transacao('Abrir Sinal on-chain', () => W.abrirSinalOnChain(1)),
  forjarOnChain: (d) => transacao('Forjar comandante', () => W.forjarOnChain(Number(d.id)), sincronizarComandantes),
  estrelaOnChain: (d) => transacao('Evoluir estrela', () => W.evoluirEstrelaOnChain(Number(d.id)), sincronizarComandantes),
  sincronizarCmd: () => sincronizarComandantes(),
  registrarSetor: () => {
    const nome = ($('nomeSetor')?.value || '').trim();
    if (!nome || nome.length > 24) return aviso('Nome de 1 a 24 caracteres.', 'erro');
    transacao('Registro no Setor', () => W.registrarNoSetor(nome));
  },
  checkIn: () => transacao('Check-in diário', () => W.fazerCheckIn()),
  monolitoOnChain: (d) => {
    if (!ui.carteira.endereco) return aviso('Conecte a carteira na aba Ronin.', 'erro');
    if (!ui.carteira.setor?.registrado) return aviso('Registre-se no Setor (aba Ronin) primeiro.', 'erro');
    transacao('Registrar Monólito', () => W.ancorarMonolitoOnChain(Number(d.x), Number(d.y)));
  },
};

function sincronizarComandantes() {
  const n = E.sincronizarComandantesOnChain(s, ui.carteira.estrelas || [], Date.now());
  if (!n) aviso('Nenhum comandante novo para sincronizar.');
  salvar();
  renderizar(true);
}

document.addEventListener('click', (ev) => {
  const alvo = ev.target.closest('[data-acao]');
  if (!alvo || alvo.disabled) return;
  const acao = ACOES[alvo.dataset.acao];
  if (acao) acao(alvo.dataset);
});

$('modal').addEventListener('input', atualizarResumo);
$('modal').addEventListener('change', atualizarResumo);
$('modal').addEventListener('click', (ev) => { if (ev.target === $('modal')) fecharModal(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && ui.modalAlvo) fecharModal(); });

const provider = W.providerInjetado();
provider?.on?.('accountsChanged', (contas) => {
  ui.carteira.endereco = contas[0] || null;
  atualizarCarteira();
  renderizar(true);
});

// ---------- loop ----------

let ultimoRender = 0;
let ultimoSave = Date.now();

function loop() {
  const now = Date.now();
  const eventos = E.tick(s, now);
  if (eventos.length) {
    avisarNovosRegistros();
    if (ui.aba === 'galaxia') atualizarPainelSelecao();
  }
  if (eventos.length || now - ultimoRender > 1000) {
    renderizar(false);
    ultimoRender = now;
  } else {
    atualizarRelogios(now);
  }
  if (ui.aba === 'galaxia') {
    desenhar();
    atualizarHud();
  }
  if (now - ultimoSave > 5000) {
    salvar();
    ultimoSave = now;
  }
}

window.addEventListener('beforeunload', salvar);
document.addEventListener('visibilitychange', () => { if (document.hidden) salvar(); });
window.addEventListener('resize', () => { if (ui.aba === 'galaxia') desenhar(); });

E.tick(s, Date.now()); // progresso offline
ui.vistoRegistro = s.registro[0]?.t ?? 0;
renderizar(true);
setInterval(loop, 100);
if (ui.carteira.providerDisponivel && ui.carteira.configurado) conectarCarteira(true);
