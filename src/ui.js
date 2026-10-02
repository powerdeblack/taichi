// Templates HTML das telas. Funções puras: recebem o estado e devolvem strings.
import {
  RECURSOS, PREMIUM, DOMINIO, EDIFICIOS, NAVES, TIPOS_COMBATE, COMANDANTES, RARIDADES, SINAIS, ITENS, PESQUISAS, ZONAS,
} from './data.js';
import * as E from './engine.js';
import { areaPorAlianca } from './territorio.js';

export const ABAS = [
  ['nave', '🛰️ Nave-Cidade'], ['galaxia', '🌌 Galáxia'], ['frota', '🚀 Frota'], ['comandantes', '🎖️ Comandantes'],
  ['pesquisa', '🧪 Pesquisa'], ['alianca', '🤝 Aliança'], ['inventario', '🎒 Inventário'], ['missoes', '📜 Missões'],
  ['ronin', '⛓️ Ronin'], ['registro', '📋 Registro'],
];

// ---------- utilidades ----------

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmt(n) {
  n = Math.floor(n);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return n.toLocaleString('pt-BR');
}

export function fmtTempo(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(seg).padStart(2, '0')}s`;
  return `${seg}s`;
}

// Contagem regressiva atualizada pelo loop em main.js sem re-renderizar a tela.
const relogio = (fim) => `<span data-fim="${fim}">…</span>`;

const ICONES_CUSTO = { ...Object.fromEntries(Object.entries(RECURSOS).map(([k, v]) => [k, v.icone])), quasares: PREMIUM.icone, cristaisDominio: DOMINIO.icone };

function saldo(s, k) {
  if (k === 'quasares') return s.quasares;
  if (k === 'cristaisDominio') return s.aliancas.jogador?.cristais || 0;
  return s.recursos[k];
}

export function custoHtml(s, custo) {
  return `<div class="custo">${Object.entries(custo).map(([k, v]) =>
    `<span class="${saldo(s, k) < v ? 'falta' : ''}">${ICONES_CUSTO[k] || ''} ${fmt(v)}</span>`).join('')}</div>`;
}

function premioHtml(premio) {
  return Object.entries(premio).map(([k, v]) => {
    if (ITENS[k]) return `${ITENS[k].icone} ${v}× ${ITENS[k].nome}`;
    return `${ICONES_CUSTO[k] || ''} ${fmt(v)}`;
  }).join(' · ');
}

function botao(acao, rotulo, { dados = {}, desativado = false, classe = '', titulo = '' } = {}) {
  const attrs = Object.entries(dados).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  return `<button class="botao ${classe}" data-acao="${acao}" ${attrs} ${desativado ? 'disabled' : ''} title="${esc(titulo)}">${rotulo}</button>`;
}

const estrelasHtml = (n) => `<span class="estrelas">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;

// ---------- cabeçalho e abas ----------

export function recursosHtml(s, now) {
  const cap = E.capacidade(s);
  const prod = E.producao(s);
  const itens = Object.entries(RECURSOS).map(([k, r]) =>
    `<span class="recurso ${s.recursos[k] >= cap ? 'cheio' : ''}" title="${r.nome}: +${fmt(prod[k] * 3600)}/h · cofre ${fmt(E.cofre(s))}">${r.icone} ${fmt(s.recursos[k])}<small>/${fmt(cap)}</small></span>`);
  itens.push(`<span class="recurso" title="${PREMIUM.nome}">${PREMIUM.icone} ${fmt(s.quasares)}</span>`);
  if (s.aliancas.jogador) itens.push(`<span class="recurso" title="${DOMINIO.nome}">${DOMINIO.icone} ${fmt(s.aliancas.jogador.cristais)}</span>`);
  itens.push(`<span class="recurso" title="Poder">💪 ${fmt(E.poder(s))}</span>`);
  const protegida = E.naveProtegida(s, now);
  const motivo = s.escudoAte > now ? 'Escudo de Paz' : protegida ? 'Dentro do território' : 'Fora do território: pode ser saqueada acima do cofre';
  itens.push(`<span class="recurso ${protegida ? 'protegida' : 'exposta'}" title="${motivo}">${protegida ? '🛡️ Protegida' : '⚠️ Exposta'}</span>`);
  return itens.join('');
}

export function abasHtml(aba, alertas) {
  return ABAS.map(([id, rotulo]) =>
    `<button class="aba ${id === aba ? 'ativa' : ''}" data-acao="aba" data-aba="${id}">${rotulo}${alertas[id] ? '<span class="ponto"></span>' : ''}</button>`).join('');
}

export function alertasAbas(s, now) {
  return {
    missoes: E.missoes(s).some((m) => m.concluida && !m.resgatada),
    alianca: E.presenteDisponivel(s, now),
    comandantes: E.sinalGratisDisponivel(s, now),
  };
}

// ---------- lateral: filas, marchas e eventos ----------

function itemFila(s, fila, f, rotulo, now) {
  const total = f.fim - f.inicio || 1;
  const pct = Math.min(100, ((now - f.inicio) / total) * 100);
  return `<div class="fila-item">
    <div class="titulo"><span>${rotulo}</span><span class="suave">${relogio(f.fim)}</span></div>
    <div class="barra"><div style="width:${pct}%"></div></div>
    <div class="acoes">
      ${botao('acelerar', `⚡ ${E.custoAceleracao(f.fim - now)}${PREMIUM.icone}`, { dados: { fila, id: f.id }, classe: 'mini secundario', titulo: 'Concluir agora com Quasares' })}
      ${s.aliancas.jogador && !f.ajudado ? botao('ajuda', '🤝 Ajuda', { dados: { fila, id: f.id }, classe: 'mini secundario' }) : ''}
    </div>
  </div>`;
}

const FASES = { indo: 'a caminho', coletando: 'coletando', guarnecendo: 'guarnecendo', voltando: 'retornando' };

export function lateralHtml(s, now) {
  const filas = [];
  for (const f of s.filas.construcao) filas.push(itemFila(s, 'construcao', f, `🏗️ ${EDIFICIOS[f.alvo].nome} → ${f.nivel}`, now));
  for (const f of s.filas.treino) filas.push(itemFila(s, 'treino', f, `${NAVES[f.alvo].icone} ${f.qtd}× ${NAVES[f.alvo].nome}`, now));
  for (const f of s.filas.pesquisa) filas.push(itemFila(s, 'pesquisa', f, `🧪 ${PESQUISAS[f.alvo].nome} → ${f.nivel}`, now));
  for (const f of s.filas.cura) filas.push(itemFila(s, 'cura', f, `🏥 Reparo de ${E.totalTropas(f.tropas)}`, now));
  const livres = E.vagasConstrucao(s) - s.filas.construcao.length;

  const marchas = s.marchas.map((m) => {
    const alvo = s.mapa.find((e) => e.id === m.alvoId);
    const nome = alvo ? E.nomeAlvo(s, alvo) : `(${m.alvoX}, ${m.alvoY})`;
    return `<div class="fila-item">
      <div class="titulo"><span>${COMANDANTES[m.comandante].icone} ${esc(nome)}</span><span class="suave">${m.fim ? relogio(m.fim) : '∞'}</span></div>
      <div class="suave">${FASES[m.fase]} · ${fmt(E.totalTropas(m.tropas))} naves</div>
      ${m.fase !== 'voltando' ? `<div class="acoes">${botao('retornar', '↩️ Retornar', { dados: { id: m.id }, classe: 'mini secundario' })}</div>` : ''}
    </div>`;
  });

  const eventos = [];
  if (s.edificios.radar >= 1) {
    if (s.proximoRaid) eventos.push(`<div>🏴‍☠️ Invasão pirata em ${relogio(s.proximoRaid)}</div>`);
    eventos.push(`<div>⚔️ Ataque rival em ${relogio(s.bots.ataque)}</div>`);
  } else {
    eventos.push('<div class="suave">📡 Construa a Torre de Radar para ver ataques chegando.</div>');
  }
  if (s.escudoAte > now) eventos.push(`<div>🔰 Escudo de Paz: ${relogio(s.escudoAte)}</div>`);

  return `
    <div class="cartao"><h3>Filas <span class="suave">(${livres} construtor${livres === 1 ? '' : 'es'} livre${livres === 1 ? '' : 's'})</span></h3>
      ${filas.join('') || '<div class="suave">Nada em andamento.</div>'}</div>
    <div class="cartao"><h3>Marchas <span class="suave">${s.marchas.length}/${E.maxMarchas(s)}</span></h3>
      ${marchas.join('') || '<div class="suave">Nenhuma frota no espaço.</div>'}</div>
    <div class="cartao"><h3>Radar</h3>${eventos.join('')}</div>`;
}

// ---------- telas ----------

function telaNave(s) {
  const cards = Object.entries(EDIFICIOS).map(([id, def]) => {
    const nivel = s.edificios[id];
    const alvo = nivel + 1;
    const v = E.podeEvoluir(s, id);
    const max = alvo > def.max;
    const prod = def.producao ? Object.entries(def.producao).map(([r, q]) => `${RECURSOS[r].icone} +${fmt(q * Math.max(nivel, 1) * 3600)}/h`).join(' ') : '';
    return `<div class="cartao ${nivel === 0 ? 'bloqueado' : ''}">
      <div class="titulo"><strong>${def.icone} ${def.nome}</strong><span class="nivel">${nivel ? `Nv ${nivel}` : 'Não construído'}</span></div>
      <div class="suave">${def.desc}</div>
      ${prod ? `<div>${prod}</div>` : ''}
      ${max ? '<div class="sucesso">Nível máximo</div>' : `
        ${custoHtml(s, E.custoEdificio(id, alvo))}
        <div class="suave">⏱️ ${fmtTempo(E.tempoEdificio(s, id, alvo) * 1000)}</div>
        ${!v.ok ? `<div class="motivo">${esc(v.motivo)}</div>` : ''}
        <div class="acoes">${botao('evoluir', nivel ? `Evoluir → ${alvo}` : 'Construir', { dados: { id }, desativado: !v.ok })}</div>`}
    </div>`;
  });
  return `<h2>🛰️ Nave-Cidade ${s.nave.tokenId ? `<span class="suave">NFT #${s.nave.tokenId}</span>` : ''}</h2>
    <p class="subtitulo">Sua base no vazio da Via Láctea. Nenhum módulo passa do nível do Centro de Comando. Posição: (${s.base.x}, ${s.base.y}) · ${ZONAS[E.zona(s.base.x, s.base.y)].nome}.</p>
    <div class="grade">${cards.join('')}</div>`;
}

function telaFrota(s) {
  const linhas = Object.entries(NAVES).map(([id, n]) => `<tr>
    <td>${n.icone} ${n.nome}<br><span class="suave">${n.classe}${n.forteContra ? ` · forte contra ${NAVES[n.forteContra].nome}` : ''}${n.bonusEstrutura ? ' · ×2 contra estruturas' : ''}</span></td>
    <td>${fmt(s.tropas[id])}</td><td>${fmt(s.feridos[id])}</td>
    <td>${n.atk}/${n.def}/${n.hp}</td><td>${n.vel}</td><td>${n.carga}</td></tr>`).join('');

  const cards = Object.entries(NAVES).map(([id, n]) => {
    const ed = n.edificio;
    const ativo = s.filas.treino.find((f) => NAVES[f.alvo].edificio === ed);
    const max = E.loteMaximo(s, id);
    return `<div class="cartao ${s.edificios[ed] < 1 ? 'bloqueado' : ''}">
      <div class="titulo"><strong>${n.icone} ${n.nome}</strong><span class="suave">${EDIFICIOS[ed].nome} nv ${s.edificios[ed]}</span></div>
      ${custoHtml(s, n.custo)}<div class="suave">por nave · ⏱️ ${n.tempo}s · lote máx. ${fmt(max)}</div>
      ${s.edificios[ed] < 1 ? `<div class="motivo">Construa ${EDIFICIOS[ed].nome}</div>`
        : ativo ? `<div class="motivo">Fabricando ${ativo.qtd}… ${relogio(ativo.fim)}</div>`
        : `<div class="linha"><input type="number" min="1" max="${max}" value="${Math.min(50, max)}" id="qtd-${id}" aria-label="Quantidade de ${n.nome}">
            ${botao('treinar', 'Fabricar', { dados: { id } })}</div>`}
    </div>`;
  }).join('');

  const feridos = E.totalTropas(s.feridos);
  return `<h2>🚀 Frota</h2>
    <p class="subtitulo">Drones vencem Interceptores, Interceptores vencem Artilharia, Artilharia vence Drones. Só Naves de Extração coletam.</p>
    <div class="secao"><table class="tabela"><thead><tr><th>Nave</th><th>Na base</th><th>Feridos</th><th>Atk/Def/HP</th><th>Vel.</th><th>Carga</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <div class="secao"><h3>🏥 Baía de Reparos <span class="suave">${fmt(feridos)}/${fmt(E.capacidadeHospital(s))}</span></h3>
      ${feridos ? `${custoHtml(s, E.custoCuraTotal(s))}<div class="acoes">${botao('curar', `Reparar ${fmt(feridos)} tripulantes`, { desativado: s.filas.cura.length > 0 })}</div>` : '<div class="suave">Nenhuma tripulação ferida.</div>'}</div>
    <h3>Fabricar</h3><div class="grade">${cards}</div>`;
}

function telaComandantes(s, now) {
  const cards = Object.entries(COMANDANTES).map(([id, c]) => {
    const meu = s.comandantes[id];
    const frag = s.fragmentos[id];
    const univ = s.universais[c.raridade];
    let corpo;
    if (meu) {
      const custo = meu.estrelas < 5 ? E.custoEstrela(s, id) : 0;
      corpo = `<div>${estrelasHtml(meu.estrelas)} · Nv ${meu.nivel}/${E.nivelMaximo(meu)} <span class="suave">(XP ${fmt(meu.xp)}/${fmt(E.xpParaNivel(meu.nivel))})</span></div>
        <div class="suave">${E.comandanteOcupado(s, id) ? '🚀 Em marcha' : '🛰️ Na base'}</div>
        ${meu.estrelas < 5 ? `<div class="acoes">${botao('estrela', `★ Evoluir (${custo} frag.)`, { dados: { id }, desativado: frag + univ < custo })}</div>` : ''}`;
    } else {
      const custo = E.custoDesbloqueio(id);
      corpo = `<div class="suave">Bloqueado</div>
        <div class="acoes">${botao('desbloquear', `Forjar (${custo} frag.)`, { dados: { id }, desativado: frag + univ < custo })}</div>`;
    }
    return `<div class="cartao ${meu ? '' : 'bloqueado'}">
      <div class="titulo"><strong>${c.icone} ${c.nome}</strong><span class="raridade-${c.raridade}">${c.raridade}</span></div>
      <div>${c.desc}</div>
      <div class="suave">🧩 Fragmentos: ${frag} · Universais ${c.raridade}: ${univ} · token #${c.tokenId}</div>
      ${corpo}
    </div>`;
  }).join('');

  const cantina = s.edificios.cantina;
  const sinais = Object.entries(SINAIS).map(([id, def]) => `<div class="cartao">
      <div class="titulo"><strong>${def.icone} ${def.nome}</strong><span class="suave">você tem ${s.inventario[id] || 0}</span></div>
      <div class="suave">${def.fragmentos[0]}–${def.fragmentos[1]} fragmentos · ${Math.round(def.chanceLendario * 100)}% lendário</div>
      <div class="acoes">
        ${botao('sinal', 'Abrir item', { dados: { id }, desativado: !cantina || !(s.inventario[id] > 0) })}
        ${botao('sinal', `${def.quasares} ${PREMIUM.icone}`, { dados: { id, quasares: 1 }, classe: 'secundario', desativado: !cantina || s.quasares < def.quasares })}
        ${id === 'sinalPrata' ? (E.sinalGratisDisponivel(s, now) ? botao('sinal', 'Grátis!', { dados: { id, gratis: 1 } })
          : cantina ? `<span class="suave">grátis em ${relogio(s.ultimoSinalGratis + E.INTERVALO_SINAL_GRATIS)}</span>` : '') : ''}
      </div></div>`).join('');

  return `<h2>🎖️ Comandantes</h2>
    <p class="subtitulo">Semi-NFTs (ERC-1155): junte fragmentos para forjar e evoluir estrelas, como as esculturas do RoK. Cada estrela aumenta o nível máximo em 10 e os bônus em 10%. Na marcha, o secundário dá metade dos bônus.</p>
    <div class="secao"><h3>🍸 Cantina Estelar ${cantina ? '' : '<span class="motivo">— construa a Cantina (Centro de Comando 3)</span>'}</h3><div class="grade">${sinais}</div></div>
    <div class="grade">${cards}</div>`;
}

function telaPesquisa(s) {
  const cards = Object.entries(PESQUISAS).map(([id, p]) => {
    const nivel = s.pesquisas[id];
    const alvo = nivel + 1;
    const v = E.podePesquisar(s, id);
    return `<div class="cartao">
      <div class="titulo"><strong>${p.icone} ${p.nome}</strong><span class="nivel">${nivel}/${p.max}</span></div>
      <div class="suave">${p.efeito}</div>
      ${alvo > p.max ? '<div class="sucesso">Concluída</div>' : `${custoHtml(s, E.custoPesquisa(id, alvo))}
        <div class="suave">⏱️ ${fmtTempo(E.tempoPesquisa(id, alvo) * 1000)}</div>
        ${!v.ok ? `<div class="motivo">${esc(v.motivo)}</div>` : ''}
        <div class="acoes">${botao('pesquisar', 'Pesquisar', { dados: { id }, desativado: !v.ok })}</div>`}
    </div>`;
  }).join('');
  return `<h2>🧪 Laboratório Quântico</h2><p class="subtitulo">Tecnologias permanentes para economia e guerra.</p><div class="grade">${cards}</div>`;
}

function telaAlianca(s, now) {
  const a = s.aliancas.jogador;
  const rivais = Object.entries(s.aliancas).filter(([id]) => id !== 'jogador').map(([id, r]) => {
    const monolitos = s.mapa.filter((e) => e.tipo === 'monolito' && e.alianca === id).length;
    const estacao = s.mapa.some((e) => e.tipo === 'estacao' && e.alianca === id);
    return `<tr><td><span class="cor" style="background:${r.cor}"></span>[${esc(r.tag)}] ${esc(r.nome)}</td><td>${estacao ? '🏛️' : `💥 reconstrói em ${relogio(s.bots.reconstrucao[id] || now)}`}</td><td>${monolitos}</td></tr>`;
  }).join('');
  const rivaisHtml = `<div class="secao"><h3>Alianças rivais</h3><table class="tabela"><thead><tr><th>Aliança</th><th>Estação</th><th>Monólitos</th></tr></thead><tbody>${rivais}</tbody></table></div>`;

  if (!a) {
    return `<h2>🤝 Aliança</h2>
      <p class="subtitulo">Funde uma aliança para ancorar a Estação Central e erguer Monólitos de Domínio. Dentro do território sua Nave-Cidade não pode ser atacada.</p>
      ${s.edificios.embaixada < 1 ? '<div class="motivo secao">Construa a Embaixada Galáctica primeiro.</div>' : `
      <div class="cartao secao" style="max-width:420px">
        <div class="campo"><label for="nomeAlianca">Nome</label><input type="text" id="nomeAlianca" maxlength="24" placeholder="Ronin Estelar"></div>
        <div class="campo"><label for="tagAlianca">Tag (2–4)</label><input type="text" id="tagAlianca" maxlength="4" placeholder="RNS"></div>
        ${custoHtml(s, E.CUSTO_ALIANCA)}
        <div class="acoes">${botao('fundar', 'Fundar aliança')}</div>
      </div>`}
      ${rivaisHtml}`;
  }

  const minhas = s.mapa.filter((e) => (e.tipo === 'monolito' || e.tipo === 'estacao') && e.alianca === 'jogador');
  const estacao = minhas.find((e) => e.tipo === 'estacao');
  const area = areaPorAlianca(s.mapa).jogador || 0;
  const lista = minhas.map((e) => {
    const reforco = s.marchas.filter((m) => m.fase === 'guarnecendo' && m.alvoId === e.id).reduce((n, m) => n + E.totalTropas(m.tropas), 0);
    return `<tr><td>${e.tipo === 'estacao' ? '🏛️ Estação Central' : '🪨 Monólito'}</td><td>(${e.x}, ${e.y})</td><td>${fmt(E.totalTropas(e.tropas))}${reforco ? ` + ${fmt(reforco)} reforço` : ''}</td>
      <td>${botao('irMapa', 'Ver no mapa', { dados: { x: e.x, y: e.y }, classe: 'mini secundario' })}</td></tr>`;
  }).join('');

  return `<h2>🤝 [${esc(a.tag)}] ${esc(a.nome)}</h2>
    <p class="subtitulo">Território: ${area} setores · ${DOMINIO.icone} +${fmt(E.producaoDominio(s) * 3600)}/h · Monólitos ${minhas.length - (estacao ? 1 : 0)}/${E.MAX_MONOLITOS}</p>
    <div class="grade secao">
      <div class="cartao"><h3>🎁 Presente da aliança</h3>
        ${E.presenteDisponivel(s, now) ? botao('presente', 'Resgatar') : `<div class="suave">Próximo em ${relogio(s.ultimoPresente + E.INTERVALO_PRESENTE)}</div>`}</div>
      <div class="cartao"><h3>${estacao ? '🪨 Erguer Monólito' : '🏛️ Ancorar Estação Central'}</h3>
        <div class="suave">${estacao ? 'Na aba Galáxia, clique num setor livre ligado ao seu território.' : 'Na aba Galáxia, clique num setor livre a até 5 casas da sua Nave-Cidade.'}</div>
        ${custoHtml(s, estacao ? E.custoMonolito(s) : E.CUSTO_ESTACAO)}
        <div class="acoes">${botao('aba', 'Abrir Galáxia', { dados: { aba: 'galaxia' }, classe: 'secundario' })}</div></div>
      <div class="cartao"><h3>⚔️ Guerra por território</h3>
        <div class="suave">Rivais atacam seus Monólitos da borda. Envie reforços (marcha até seu Monólito) e destrua os Monólitos deles com Couraçados de Cerco. Destruir uma Estação Central faz o território rival inteiro colapsar.</div></div>
    </div>
    ${minhas.length ? `<div class="secao"><h3>Suas estruturas</h3><table class="tabela"><thead><tr><th>Estrutura</th><th>Posição</th><th>Guarnição</th><th></th></tr></thead><tbody>${lista}</tbody></table></div>` : ''}
    ${rivaisHtml}`;
}

function telaInventario(s) {
  const itens = Object.entries(ITENS).filter(([id]) => s.inventario[id] > 0).map(([id, it]) => `<div class="cartao">
    <div class="titulo"><strong>${it.icone} ${it.nome}</strong><span class="nivel">×${s.inventario[id]}</span></div>
    <div class="suave">${it.desc}</div>
    <div class="acoes">${id === 'salto' ? '<span class="suave">Use clicando num setor livre na Galáxia.</span>'
      : SINAIS[id] ? botao('aba', 'Ir para a Cantina', { dados: { aba: 'comandantes' }, classe: 'secundario' })
      : botao('usar', 'Usar', { dados: { id } })}</div></div>`).join('');
  return `<h2>🎒 Inventário</h2>
    <p class="subtitulo">Recursos guardados em caixas não podem ser saqueados: abra só quando for gastar.</p>
    <div class="grade">${itens || '<div class="suave">Inventário vazio. Missões, presentes e o check-in on-chain dão itens.</div>'}</div>`;
}

function telaMissoes(s) {
  const lista = E.missoes(s).map((m) => `<div class="cartao ${m.resgatada ? 'bloqueado' : ''}">
    <div class="titulo"><strong>${m.concluida ? '✅' : '⬜'} ${m.titulo}</strong></div>
    <div class="suave">Prêmio: ${premioHtml(m.premio)}</div>
    <div class="acoes">${m.resgatada ? '<span class="suave">Resgatada</span>' : botao('missao', 'Resgatar', { dados: { id: m.id }, desativado: !m.concluida })}</div>
  </div>`).join('');
  return `<h2>📜 Missões</h2><p class="subtitulo">Guia de progressão: siga as missões para aprender o jogo.</p><div class="grade">${lista}</div>`;
}

function telaRegistro(s) {
  const itens = s.registro.map((r) => `<li class="${r.tipo}"><time>${new Date(r.t).toLocaleTimeString('pt-BR')}</time>${esc(r.msg)}</li>`).join('');
  return `<h2>📋 Registro</h2><p class="subtitulo">Relatórios de batalha e eventos.</p>
    <ul class="registro">${itens}</ul>
    <div class="secao" style="margin-top:24px">${botao('reiniciar', 'Reiniciar jogo desta nave', { classe: 'perigo' })}</div>`;
}

// ---------- galáxia ----------

const NOMES_TIPO = { recurso: 'Campo de recursos', pirata: 'Frota pirata', fortaleza: 'Fortaleza Xeno', portal: 'Portal Estelar', monolito: 'Monólito de Domínio', estacao: 'Estação Central' };

function tropasHtml(s, tropas) {
  if (s.edificios.radar < 1) return '<span class="suave">?? (construa a Torre de Radar)</span>';
  return Object.entries(tropas).filter(([, n]) => n > 0).map(([k, n]) => `${NAVES[k].icone} ${fmt(n)}`).join(' · ') || 'nenhuma';
}

export function painelSelecaoHtml(s, sel) {
  if (!sel) return '<div class="suave">Clique num setor do mapa para ver detalhes e agir.</div>';
  const { x, y } = sel;
  const z = E.zona(x, y);
  const dono = E.donoDe(s.mapa, x, y);
  const donoTxt = dono ? `Território de [${esc(s.aliancas[dono].tag)}]` : 'Espaço livre';
  const cab = `<div class="suave">(${x}, ${y}) · ${ZONAS[z].nome}${z > s.zonasLiberadas ? ' 🔒' : ''} · ${donoTxt}</div>`;

  if (s.base.x === x && s.base.y === y) {
    return `<h3>🛸 Sua Nave-Cidade</h3>${cab}<div>${tropasHtml({ edificios: { radar: 1 } }, s.tropas)}</div>`;
  }
  const e = s.mapa.find((m) => m.x === x && m.y === y);
  if (e) {
    const valido = E.avaliarAlvo(s, e);
    const tipo = E.tipoMarcha(e);
    const rotulo = { coleta: '🛸 Coletar', ataque: '⚔️ Atacar', reforco: '🛡️ Reforçar' }[tipo];
    let info = '';
    if (e.tipo === 'recurso') info = `<div>${RECURSOS[e.recurso].icone} ${fmt(e.quantidade)} restantes · nível ${e.nivel}${e.ocupadoPor ? ' · <span class="motivo">sendo coletado</span>' : ''}</div>`;
    else if (e.tropas) info = `<div>Defesa: ${e.alianca === 'jogador' ? tropasHtml({ edificios: { radar: 1 } }, e.tropas) : tropasHtml(s, e.tropas)}</div>`;
    if (e.tipo === 'portal') info += `<div class="suave">Abre o ${ZONAS[e.abre].nome}. ${e.capturado ? '✅ Capturado' : 'Exige território da aliança encostado no Portal.'}</div>`;
    const onChain = e.tipo === 'monolito' && e.alianca === 'jogador' ? botao('monolitoOnChain', '⛓️ Registrar no Setor', { dados: { x, y }, classe: 'secundario' }) : '';
    return `<h3>${esc(E.nomeAlvo(s, e))}</h3><div class="suave">${NOMES_TIPO[e.tipo]}</div>${cab}${info}
      ${!valido.ok ? `<div class="motivo">${esc(valido.motivo)}</div>` : ''}
      <div class="acoes">${e.tipo === 'portal' && e.capturado ? '' : botao('marcha', rotulo, { dados: { id: e.id }, desativado: !valido.ok })}${onChain}</div>`;
  }

  const acoes = [];
  const temEstacao = s.mapa.some((m) => m.tipo === 'estacao' && m.alianca === 'jogador');
  if (s.aliancas.jogador && !temEstacao) {
    const v = E.avaliarEstacao(s, x, y);
    acoes.push(botao('estacao', '🏛️ Ancorar Estação', { dados: { x, y }, desativado: !v.ok, titulo: v.motivo || '' }) + (v.ok ? '' : ` <span class="motivo">${esc(v.motivo)}</span>`));
  }
  if (temEstacao) {
    const v = E.avaliarMonolito(s, x, y);
    acoes.push(`<div>${botao('monolito', '🪨 Erguer Monólito', { dados: { x, y }, desativado: !v.ok })} ${v.ok ? custoHtml(s, E.custoMonolito(s)) : `<span class="motivo">${esc(v.motivo)}</span>`}</div>`);
  }
  const salto = E.avaliarSalto(s, x, y);
  const custoSalto = salto.custo === null ? 'grátis (território)' : salto.custo === 'item' ? 'usa 1 Salto Warp' : `${E.CUSTO_SALTO} ${PREMIUM.icone}`;
  acoes.push(`<div>${botao('saltar', '🌀 Salto Warp', { dados: { x, y }, classe: 'secundario', desativado: !salto.ok })} <span class="${salto.ok ? 'suave' : 'motivo'}">${esc(salto.ok ? custoSalto : salto.motivo)}</span></div>`);
  return `<h3>Setor vazio</h3>${cab}<div class="acoes" style="flex-direction:column;align-items:flex-start">${acoes.join('')}</div>`;
}

function telaGalaxia(s, now, ctx) {
  const legenda = [
    ['🛸', 'Sua Nave-Cidade'], ['⛏️💎⚡', 'Recursos'], ['🏴‍☠️', 'Piratas'], ['👾', 'Fortaleza Xeno'], ['🌀', 'Portal'], ['🪨', 'Monólito'], ['🏛️', 'Estação'],
  ].map(([i, t]) => `<span>${i} ${t}</span>`).join('');
  const cores = Object.values(s.aliancas).filter(Boolean).map((a) => `<span><span class="cor" style="background:${a.cor}"></span>[${esc(a.tag)}]</span>`).join('');
  return `<h2>🌌 Setor Galáctico</h2>
    <p class="subtitulo">Borda Exterior → Braço Espiral → Núcleo Galáctico. Capture Portais para avançar e conseguir loot melhor.</p>
    <div class="mapa-area">
      <div class="linha"><div class="legenda">${legenda}${cores}</div>
        ${botao('zoom', ctx.zoom > 1 ? '🔍 Afastar' : '🔍 Aproximar', { classe: 'mini secundario' })}</div>
      <div class="mapa-moldura"><canvas id="mapa"></canvas></div>
      <div class="cartao" id="painelSelecao"></div>
    </div>`;
}

// ---------- Ronin / on-chain ----------

function telaRonin(s, now, ctx) {
  const w = ctx.carteira;
  const rede = ctx.rede;
  const podBox = `<div class="cartao destaque-pod secao"><h3>🏆 Proof of Distribution (POD)</h3>
    <div class="suave">Cada ação on-chain do jogo gera métricas do Builder Score da Ronin: mint de Naves-Cidade (gás e volume de NFT), fragmentos de comandante negociáveis (volume de NFT), forja e estrelas (gás), check-in diário (usuários ativos e retenção) e Monólitos registrados no Setor (volume de contrato).</div></div>`;

  if (!w.providerDisponivel) {
    return `<h2>⛓️ Ronin</h2>${podBox}
      <div class="cartao"><h3>Carteira não encontrada</h3>
      <div>Instale a <a href="https://wallet.roninchain.com" target="_blank" rel="noopener">Ronin Wallet</a> para criar sua Nave-Cidade NFT, abrir Sinais on-chain e fazer o check-in diário. O jogo funciona sem carteira (modo local).</div></div>`;
  }
  if (!w.configurado) {
    return `<h2>⛓️ Ronin</h2>${podBox}
      <div class="cartao"><h3>Contratos ainda não publicados em ${esc(rede.nome)}</h3>
      <div>Rode <code>PRIVATE_KEY=0x... npm run deploy:saigon</code> para publicar NaveCidade, Comandantes e Setor. O script preenche <code>src/config.js</code>.</div></div>`;
  }
  if (!w.endereco) {
    return `<h2>⛓️ Ronin</h2>${podBox}
      <div class="cartao"><h3>${esc(w.nome)} detectada</h3><div class="suave">Rede: ${esc(rede.nome)} (chain ${rede.chainId})</div>
      <div class="acoes">${botao('conectar', 'Conectar carteira')}</div></div>`;
  }

  const ocupado = w.ocupado ? `<div class="motivo">⏳ ${esc(w.ocupado)}</div>` : '';
  const ultimaTx = w.ultimaTx ? `<div class="suave">Última transação: <a href="${esc(w.ultimaTx.link)}" target="_blank" rel="noopener">${esc(w.ultimaTx.hash.slice(0, 10))}…</a></div>` : '';
  const naves = (w.naves || []).map((n) => `<tr><td>#${n.tokenId}</td><td>${esc(n.nome)}</td><td>${n.nivelComando}</td>
    <td>${s.nave.tokenId === n.tokenId ? '<span class="sucesso">Comandando</span>' : botao('selecionarNave', 'Comandar', { dados: { id: n.tokenId }, classe: 'mini secundario' })}</td></tr>`).join('');
  const frag = w.fragmentos || {};
  const est = w.estrelas || [];
  const linhasCmd = Object.entries(COMANDANTES).map(([id, c]) => {
    const e = est[c.tokenId - 1] || 0;
    const custo = e ? (e < 5 ? RARIDADES[c.raridade].porEstrela * e : null) : RARIDADES[c.raridade].desbloqueio;
    const disponivel = (frag[c.tokenId] || 0) + (frag[c.raridade === 'Lendário' ? 102 : 101] || 0);
    return `<tr><td>${c.icone} ${c.nome}</td><td>${frag[c.tokenId] ?? '…'}</td><td>${e ? estrelasHtml(e) : 'bloqueado'}</td>
      <td>${custo === null ? '' : botao(e ? 'estrelaOnChain' : 'forjarOnChain', e ? `★ (${custo})` : `Forjar (${custo})`, { dados: { id: c.tokenId }, classe: 'mini secundario', desativado: Boolean(w.ocupado) || disponivel < custo })}</td></tr>`;
  }).join('');
  const j = w.setor;
  const podeCheckIn = j?.registrado && j.hoje > j.ultimoDia;

  return `<h2>⛓️ Ronin</h2>
    <p class="subtitulo">${esc(w.endereco.slice(0, 6))}…${esc(w.endereco.slice(-4))} · ${esc(rede.nome)} · ${w.saldo ?? '…'} RON
      ${rede.faucet ? ` · <a href="${rede.faucet}" target="_blank" rel="noopener">faucet</a>` : ''} · ${botao('atualizarCarteira', '↻', { classe: 'mini secundario' })}</p>
    ${ocupado}${ultimaTx}${podBox}
    <div class="grade secao">
      <div class="cartao"><h3>🛸 Naves-Cidade (ERC-721)</h3>
        ${naves ? `<table class="tabela"><thead><tr><th>ID</th><th>Nome</th><th>CC</th><th></th></tr></thead><tbody>${naves}</tbody></table>` : '<div class="suave">Você ainda não tem uma Nave-Cidade NFT.</div>'}
        <div class="linha"><input type="text" id="nomeNave" maxlength="24" placeholder="Nome da nave (letras e números)">
        ${botao('criarNave', w.precoNave === '0.0' ? 'Criar (grátis)' : `Criar (${w.precoNave ?? '…'} RON)`, { desativado: Boolean(w.ocupado) })}</div>
        <div class="suave">Cada nave tem seu próprio progresso salvo. A primeira é grátis (só gás).</div></div>
      <div class="cartao"><h3>📅 Check-in diário (Setor)</h3>
        ${!j ? '<div class="suave">Carregando…</div>' : !j.registrado ? `<div class="linha"><input type="text" id="nomeSetor" maxlength="24" placeholder="Nome de comandante">${botao('registrarSetor', 'Registrar', { desativado: Boolean(w.ocupado) })}</div>`
          : `<div>Sequência: <strong>${j.sequencia}</strong> dia(s) · total ${j.total}</div>
             <div class="acoes">${botao('checkIn', podeCheckIn ? 'Fazer check-in' : 'Check-in de hoje feito ✅', { desativado: !podeCheckIn || Boolean(w.ocupado) })}</div>
             <div class="suave">Recompensa no jogo: Quasares (×sequência até 7), caixa e Sinal. Monólitos registrados: ${j.monolitos}.</div>`}</div>
    </div>
    <div class="secao"><h3>🎖️ Comandantes on-chain (ERC-1155)</h3>
      <div class="acoes" style="margin-bottom:8px">${botao('sinalOnChain', `🥈 Abrir Sinal on-chain (${w.precoSinal ?? '…'} RON)`, { desativado: Boolean(w.ocupado) })}
        ${botao('sincronizarCmd', '⬇️ Sincronizar no jogo', { classe: 'secundario' })}</div>
      <table class="tabela"><thead><tr><th>Comandante</th><th>Fragmentos</th><th>Estrelas</th><th></th></tr></thead><tbody>${linhasCmd}</tbody></table>
      <div class="suave">Universais: épico ${frag[101] ?? '…'} · lendário ${frag[102] ?? '…'}. Fragmentos podem ser negociados em marketplaces; forjar e evoluir queima fragmentos.</div></div>`;
}

export const TELAS = {
  nave: telaNave, galaxia: telaGalaxia, frota: telaFrota, comandantes: telaComandantes, pesquisa: telaPesquisa,
  alianca: telaAlianca, inventario: telaInventario, missoes: telaMissoes, ronin: telaRonin, registro: telaRegistro,
};

// ---------- modal de marcha ----------

export function modalMarchaHtml(s, alvo) {
  const tipo = E.tipoMarcha(alvo);
  const naves = Object.keys(NAVES).filter((k) => (tipo === 'coleta' ? k === 'extrator' : TIPOS_COMBATE.includes(k)));
  const livres = Object.keys(s.comandantes).filter((id) => !E.comandanteOcupado(s, id));
  const opcoes = (vazio) => (vazio ? '<option value="">— nenhum —</option>' : '')
    + livres.map((id) => `<option value="${id}">${COMANDANTES[id].icone} ${COMANDANTES[id].nome} (Nv ${s.comandantes[id].nivel})</option>`).join('');
  const titulo = { coleta: '🛸 Enviar Naves de Extração', ataque: '⚔️ Atacar', reforco: '🛡️ Reforçar estrutura' }[tipo];
  return `<div class="caixa" role="dialog" aria-modal="true" aria-label="${titulo}">
    <h3>${titulo}: ${esc(E.nomeAlvo(s, alvo))}</h3>
    ${alvo.tropas && alvo.alianca !== 'jogador' ? `<div class="suave">Inimigo: ${tropasHtml(s, alvo.tropas)}</div>` : ''}
    ${livres.length ? '' : '<div class="motivo">Todos os comandantes estão em marcha.</div>'}
    <div class="campo"><label for="mPrincipal">Comandante principal</label><select id="mPrincipal">${opcoes(false)}</select></div>
    <div class="campo"><label for="mSecundario">Comandante secundário (metade dos bônus)</label><select id="mSecundario">${opcoes(true)}</select></div>
    ${naves.map((k) => `<div class="campo"><label for="m-${k}">${NAVES[k].icone} ${NAVES[k].nome} (disponível ${fmt(s.tropas[k])})</label>
      <div class="linha"><input type="number" id="m-${k}" min="0" max="${s.tropas[k]}" value="${s.tropas[k]}" data-nave="${k}">
      <button class="botao mini secundario" data-acao="maxNave" data-id="${k}">Máx</button></div></div>`).join('')}
    <div id="mResumo" class="suave"></div>
    <div class="acoes">${botao('confirmarMarcha', 'Enviar', { dados: { id: alvo.id }, desativado: !livres.length })}${botao('fecharModal', 'Cancelar', { classe: 'secundario' })}</div>
  </div>`;
}

export function resumoMarcha(s, alvo, tropas, principal, secundario) {
  if (!E.totalTropas(tropas)) return 'Selecione naves.';
  const tempo = E.tempoViagem(s, alvo, tropas, principal, secundario) * 1000;
  const partes = [`⏱️ Viagem ${fmtTempo(tempo)}`, `🚀 ${fmt(E.totalTropas(tropas))} naves`];
  if (E.tipoMarcha(alvo) === 'coleta') partes.push(`📦 Carga ${fmt(E.cargaMarcha(s, tropas, principal, secundario))}`);
  return partes.join(' · ');
}
