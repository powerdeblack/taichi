// Desenho do Setor Galáctico em canvas: vazio estrelado, zonas, regiões, territórios, entidades, marchas e minimapa.
import { TAMANHO_MAPA, CENTRO, zona, mapaTerritorio, indiceRegiao } from './territorio.js';
import { REGIOES } from './data.js';
import { rng } from './engine.js';

const ICONES = {
  recurso: { minerio: '⛏️', cristal: '💎', plasma: '⚡' },
  pirata: '🏴‍☠️', fortaleza: '👾', portal: '🌀', monolito: '🪨', estacao: '🏛️', nave: '🛸', caverna: '🕳️', destroco: '🔩',
};

// Categoria de filtro de cada entidade (Portais e a própria nave sempre aparecem).
const CATEGORIA = {
  recurso: 'recursos', pirata: 'inimigos', fortaleza: 'inimigos', monolito: 'alianca', estacao: 'alianca', nave: 'alianca',
  caverna: 'exploracao', destroco: 'exploracao',
};

const COR_MARCHA = { ataque: '#ff6b6b', reforco: '#4dabf7', coleta: '#38d9a9', sonda: '#c084fc' };

let estrelas = null;
let centrosRegioes = null;

function gerarEstrelas() {
  const r = rng(1337);
  return Array.from({ length: 500 }, () => ({ x: r(), y: r(), raio: r() * 1.2 + 0.2, brilho: 0.3 + r() * 0.7 }));
}

// Centro de massa de cada região, para posicionar os nomes.
function calcularCentrosRegioes() {
  const soma = {};
  for (let x = 0; x < TAMANHO_MAPA; x++) {
    for (let y = 0; y < TAMANHO_MAPA; y++) {
      const { zona: z, indice } = indiceRegiao(x, y);
      const k = `${z}:${indice}`;
      soma[k] ??= { x: 0, y: 0, n: 0, nome: REGIOES[z][indice] };
      soma[k].x += x + 0.5;
      soma[k].y += y + 0.5;
      soma[k].n++;
    }
  }
  return Object.values(soma).map((r) => ({ nome: r.nome, x: r.x / r.n, y: r.y / r.n }));
}

// O mapa inteiro cabe na largura disponível e em ~72% da altura da janela (no zoom 1).
export function tamanhoCelula(largura, zoom) {
  const lado = Math.min(largura - 2, window.innerHeight * 0.72, 800);
  return Math.max(7, Math.floor(lado / TAMANHO_MAPA)) * zoom;
}

function selo(g, x, y, texto, cor, tam) {
  g.fillStyle = '#05060f';
  g.strokeStyle = cor;
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * tam, y + Math.sin(a) * tam * 0.8);
  }
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.font = `bold ${Math.floor(tam)}px sans-serif`;
  g.fillText(texto, x, y + 1);
  g.lineWidth = 1;
}

function rotulo(g, texto, x, y, cor, tam) {
  g.font = `bold ${tam}px sans-serif`;
  const w = g.measureText(texto).width + 8;
  g.fillStyle = 'rgba(5, 6, 15, 0.75)';
  g.fillRect(x - w / 2, y - tam / 2 - 2, w, tam + 4);
  g.fillStyle = cor;
  g.fillText(texto, x, y);
}

export function desenharMapa(canvas, s, { selecionado, zoom, now, filtros }) {
  const largura = canvas.parentElement.clientWidth;
  const c = tamanhoCelula(largura, zoom);
  const tam = c * TAMANHO_MAPA;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== tam * dpr) {
    canvas.width = tam * dpr;
    canvas.height = tam * dpr;
    canvas.style.width = `${tam}px`;
    canvas.style.height = `${tam}px`;
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const detalhe = c >= 16; // rótulos de nível e nomes só com espaço suficiente

  // Vazio da Via Láctea, com o brilho do bojo galáctico.
  g.fillStyle = '#05060f';
  g.fillRect(0, 0, tam, tam);
  const bojo = g.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam * 0.55);
  bojo.addColorStop(0, 'rgba(150, 110, 220, 0.4)');
  bojo.addColorStop(0.35, 'rgba(70, 80, 170, 0.16)');
  bojo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = bojo;
  g.fillRect(0, 0, tam, tam);
  estrelas ??= gerarEstrelas();
  for (const e of estrelas) {
    g.fillStyle = `rgba(255,255,255,${e.brilho * (0.75 + 0.25 * Math.sin(now / 900 + e.x * 50))})`;
    g.beginPath();
    g.arc(e.x * tam, e.y * tam, e.raio, 0, Math.PI * 2);
    g.fill();
  }

  // Sagitário A*: o buraco negro supermassivo no centro do Núcleo.
  const cx0 = (CENTRO + 0.5) * c;
  const anel = g.createRadialGradient(cx0, cx0, c * 0.6, cx0, cx0, c * 2.4);
  anel.addColorStop(0, 'rgba(0,0,0,1)');
  anel.addColorStop(0.35, 'rgba(255, 170, 60, 0.85)');
  anel.addColorStop(0.6, 'rgba(255, 90, 40, 0.25)');
  anel.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = anel;
  g.beginPath();
  g.arc(cx0, cx0, c * 2.4, 0, Math.PI * 2);
  g.fill();

  // Limites das zonas como cinturões de detritos; zonas bloqueadas ficam escurecidas.
  const rd = rng(7);
  for (const [z, d] of [[2, 13], [3, 6]]) {
    const ini = (CENTRO - d) * c;
    const lado = (2 * d + 1) * c;
    if (z > s.zonasLiberadas) {
      g.fillStyle = 'rgba(0, 0, 10, 0.4)';
      g.fillRect(ini, ini, lado, lado);
    }
    g.fillStyle = 'rgba(150, 140, 190, 0.55)';
    for (let i = 0; i < lado; i += Math.max(3, c / 4)) {
      for (const [px, py] of [[ini + i, ini], [ini + i, ini + lado], [ini, ini + i], [ini + lado, ini + i]]) {
        g.beginPath();
        g.arc(px + (rd() - 0.5) * c * 0.5, py + (rd() - 0.5) * c * 0.5, 0.6 + rd() * 1.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // Territórios das alianças.
  if (filtros.alianca) {
    const territorio = mapaTerritorio(s.mapa);
    for (const [chave, alianca] of territorio) {
      const [x, y] = chave.split(',').map(Number);
      const cor = s.aliancas[alianca]?.cor || '#888';
      g.fillStyle = cor + '30';
      g.fillRect(x * c, y * c, c, c);
      g.strokeStyle = cor + 'cc';
      g.lineWidth = 1.5;
      const borda = (dx, dy) => territorio.get(`${x + dx},${y + dy}`) !== alianca;
      g.beginPath();
      if (borda(0, -1)) { g.moveTo(x * c, y * c); g.lineTo((x + 1) * c, y * c); }
      if (borda(0, 1)) { g.moveTo(x * c, (y + 1) * c); g.lineTo((x + 1) * c, (y + 1) * c); }
      if (borda(-1, 0)) { g.moveTo(x * c, y * c); g.lineTo(x * c, (y + 1) * c); }
      if (borda(1, 0)) { g.moveTo((x + 1) * c, y * c); g.lineTo((x + 1) * c, (y + 1) * c); }
      g.stroke();
    }
    g.lineWidth = 1;
  }

  // Entidades.
  for (const e of s.mapa) {
    const cat = CATEGORIA[e.tipo];
    if (cat && !filtros[cat]) continue;
    const icone = e.tipo === 'recurso' ? ICONES.recurso[e.recurso] : ICONES[e.tipo];
    const cx = e.x * c + c / 2;
    const cy = e.y * c + c / 2;
    if (e.alianca) {
      g.fillStyle = s.aliancas[e.alianca].cor + (e.tipo === 'nave' ? '66' : 'ff');
      g.beginPath();
      g.arc(cx, cy, c * 0.48, 0, Math.PI * 2);
      g.fill();
    }
    const feito = e.investigado || e.visitado || (e.tipo === 'portal' && e.capturado);
    g.globalAlpha = feito && e.tipo !== 'portal' ? 0.45 : 1;
    g.font = `${Math.floor(c * (e.tipo === 'estacao' ? 0.85 : 0.7))}px serif`;
    g.fillText(icone, cx, cy + 1);
    g.globalAlpha = 1;
    if (feito && e.tipo !== 'portal' && detalhe) {
      g.font = `${Math.floor(c * 0.4)}px serif`;
      g.fillText('✅', e.x * c + c * 0.82, e.y * c + c * 0.22);
    }
    if (e.tipo === 'portal') {
      // Como os passes do RoK: selo com o nível, vermelho se inimigo, azul se capturado.
      selo(g, cx, e.y * c + c * 1.05, String(e.abre), e.capturado ? '#4dabf7' : '#ff6b6b', Math.max(7, c * 0.42));
    } else if (e.nivel && detalhe && !['estacao', 'nave', 'caverna', 'destroco'].includes(e.tipo)) {
      g.font = `bold ${Math.max(8, Math.floor(c * 0.32))}px sans-serif`;
      g.fillStyle = '#fff';
      g.strokeStyle = '#000';
      g.lineWidth = 2.5;
      g.strokeText(e.nivel, e.x * c + c * 0.82, e.y * c + c * 0.82);
      g.fillText(e.nivel, e.x * c + c * 0.82, e.y * c + c * 0.82);
      g.lineWidth = 1;
    }
    if (e.tipo === 'nave' && detalhe) {
      rotulo(g, `[${s.aliancas[e.alianca].tag}]${e.nome} ${e.nivel}`, cx, e.y * c + c * 1.15, s.aliancas[e.alianca].cor, Math.max(9, Math.floor(c * 0.36)));
    }
  }

  // Marcadores.
  if (filtros.marcadores) {
    g.font = `${Math.floor(c * 0.6)}px serif`;
    for (const m of s.marcadores) g.fillText('📍', m.x * c + c * 0.5, m.y * c + c * 0.1);
  }

  // Nave-Cidade do jogador, com nome como as cidades no mapa do RoK.
  const bx = s.base.x * c + c / 2;
  const by = s.base.y * c + c / 2;
  const pulso = 0.5 + 0.5 * Math.sin(now / 300);
  g.strokeStyle = `rgba(56, 217, 169, ${0.5 + 0.5 * pulso})`;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(bx, by, c * (0.6 + 0.1 * pulso), 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 1;
  g.font = `${Math.floor(c * 0.9)}px serif`;
  g.fillText('🛸', bx, by + 1);
  if (detalhe) {
    const tag = s.aliancas.jogador ? `[${s.aliancas.jogador.tag}]` : '';
    rotulo(g, `${tag}${s.nome} ${s.edificios.comando}`, bx, by + c * 0.95, '#38d9a9', Math.max(9, Math.floor(c * 0.38)));
  }

  // Marchas: linha até o alvo e um ponto na posição atual.
  for (const m of s.marchas) {
    const ax = m.alvoX * c + c / 2;
    const ay = m.alvoY * c + c / 2;
    const p = progressoMarcha(m, now);
    const cor = COR_MARCHA[m.tipo];
    g.strokeStyle = cor + '99';
    g.setLineDash([4, 4]);
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(ax, ay);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = cor;
    g.beginPath();
    g.arc(bx + (ax - bx) * p, by + (ay - by) * p, Math.max(3, c * 0.18), 0, Math.PI * 2);
    g.fill();
  }

  // Visão afastada: nomes das regiões, como as províncias do mapa do reino no RoK.
  if (!detalhe || zoom === 1) {
    centrosRegioes ??= calcularCentrosRegioes();
    g.font = `bold ${Math.max(11, Math.floor(c * 1.1))}px sans-serif`;
    g.fillStyle = 'rgba(230, 236, 255, 0.28)';
    for (const r of centrosRegioes) g.fillText(r.nome, r.x * c, r.y * c);
  }

  if (selecionado) {
    g.strokeStyle = '#ffd43b';
    g.lineWidth = 2;
    g.strokeRect(selecionado.x * c + 1, selecionado.y * c + 1, c - 2, c - 2);
    g.lineWidth = 1;
  }
  return c;
}

export function progressoMarcha(m, now) {
  const t = Math.min(1, Math.max(0, (now - m.inicio) / (m.fim - m.inicio || 1)));
  if (m.fase === 'indo') return t;
  if (m.fase === 'voltando') return 1 - t;
  return 1;
}

// Minimapa: setor inteiro, territórios, nave do jogador e retângulo da área visível.
export function desenharMinimapa(canvas, s, visivel) {
  const g = canvas.getContext('2d');
  const lado = canvas.width;
  const c = lado / TAMANHO_MAPA;
  g.fillStyle = '#05060f';
  g.fillRect(0, 0, lado, lado);
  for (const [z, d] of [[2, 13], [3, 6]]) {
    const ini = (CENTRO - d) * c;
    g.strokeStyle = 'rgba(140,160,255,0.4)';
    g.strokeRect(ini, ini, (2 * d + 1) * c, (2 * d + 1) * c);
    if (z > s.zonasLiberadas) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(ini, ini, (2 * d + 1) * c, (2 * d + 1) * c);
    }
  }
  for (const [k, a] of mapaTerritorio(s.mapa)) {
    const [x, y] = k.split(',').map(Number);
    g.fillStyle = (s.aliancas[a]?.cor || '#888') + 'aa';
    g.fillRect(x * c, y * c, c, c);
  }
  for (const e of s.mapa) {
    if (e.tipo !== 'portal') continue;
    g.fillStyle = e.capturado ? '#4dabf7' : '#ff6b6b';
    g.fillRect(e.x * c, e.y * c, c, c);
  }
  g.fillStyle = '#38d9a9';
  g.beginPath();
  g.arc((s.base.x + 0.5) * c, (s.base.y + 0.5) * c, Math.max(2.5, c), 0, Math.PI * 2);
  g.fill();
  if (visivel) {
    g.strokeStyle = '#ffd43b';
    g.strokeRect(visivel.x * c, visivel.y * c, visivel.w * c, visivel.h * c);
  }
}

export function celulaDoClique(canvas, evento, celula) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((evento.clientX - r.left) / celula);
  const y = Math.floor((evento.clientY - r.top) / celula);
  if (x < 0 || y < 0 || x >= TAMANHO_MAPA || y >= TAMANHO_MAPA) return null;
  return { x, y, zona: zona(x, y) };
}
