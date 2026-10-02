// Desenho do Setor Galáctico em canvas: vazio estrelado, zonas, territórios, entidades e marchas.
import { TAMANHO_MAPA, CENTRO, zona, mapaTerritorio } from './territorio.js';
import { rng } from './engine.js';

const ICONES = {
  recurso: { minerio: '⛏️', cristal: '💎', plasma: '⚡' },
  pirata: '🏴‍☠️', fortaleza: '👾', portal: '🌀', monolito: '🪨', estacao: '🏛️',
};

let estrelas = null;
function gerarEstrelas() {
  const r = rng(1337);
  return Array.from({ length: 450 }, () => ({ x: r(), y: r(), raio: r() * 1.2 + 0.2, brilho: 0.3 + r() * 0.7 }));
}

// O mapa inteiro cabe na largura disponível e em ~72% da altura da janela (no zoom 1).
export function tamanhoCelula(largura, zoom) {
  const lado = Math.min(largura - 2, window.innerHeight * 0.72, 800);
  return Math.max(7, Math.floor(lado / TAMANHO_MAPA)) * zoom;
}

export function desenharMapa(canvas, s, { selecionado, zoom, now }) {
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

  // Vazio da Via Láctea com uma faixa galáctica no núcleo.
  g.fillStyle = '#05060f';
  g.fillRect(0, 0, tam, tam);
  const nucleo = g.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam * 0.55);
  nucleo.addColorStop(0, 'rgba(120, 90, 200, 0.35)');
  nucleo.addColorStop(0.4, 'rgba(60, 70, 160, 0.15)');
  nucleo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = nucleo;
  g.fillRect(0, 0, tam, tam);
  estrelas ??= gerarEstrelas();
  for (const e of estrelas) {
    g.fillStyle = `rgba(255,255,255,${e.brilho * (0.75 + 0.25 * Math.sin(now / 900 + e.x * 50))})`;
    g.beginPath();
    g.arc(e.x * tam, e.y * tam, e.raio, 0, Math.PI * 2);
    g.fill();
  }

  // Zonas: anéis concêntricos; zonas bloqueadas ficam escurecidas.
  for (const [z, d] of [[2, 13], [3, 6]]) {
    const ini = (CENTRO - d) * c;
    const lado = (2 * d + 1) * c;
    g.strokeStyle = 'rgba(140, 160, 255, 0.35)';
    g.setLineDash([6, 6]);
    g.strokeRect(ini, ini, lado, lado);
    g.setLineDash([]);
    if (z > s.zonasLiberadas) {
      g.fillStyle = 'rgba(0, 0, 10, 0.35)';
      g.fillRect(ini, ini, lado, lado);
    }
  }

  // Territórios das alianças.
  const territorio = mapaTerritorio(s.mapa);
  for (const [chave, alianca] of territorio) {
    const [x, y] = chave.split(',').map(Number);
    const cor = s.aliancas[alianca]?.cor || '#888';
    g.fillStyle = cor + '30';
    g.fillRect(x * c, y * c, c, c);
    g.strokeStyle = cor + 'aa';
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

  // Entidades.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const e of s.mapa) {
    const icone = e.tipo === 'recurso' ? ICONES.recurso[e.recurso] : ICONES[e.tipo];
    const cx = e.x * c + c / 2;
    const cy = e.y * c + c / 2;
    if (e.alianca) {
      g.fillStyle = s.aliancas[e.alianca].cor;
      g.beginPath();
      g.arc(cx, cy, c * 0.48, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = e.tipo === 'portal' && e.capturado ? 0.4 : 1;
    g.font = `${Math.floor(c * (e.tipo === 'estacao' ? 0.85 : 0.7))}px serif`;
    g.fillText(icone, cx, cy + 1);
    g.globalAlpha = 1;
    if (e.nivel && c >= 14 && e.tipo !== 'estacao') {
      g.font = `bold ${Math.max(8, Math.floor(c * 0.32))}px sans-serif`;
      g.fillStyle = '#fff';
      g.strokeStyle = '#000';
      g.lineWidth = 2.5;
      g.strokeText(e.nivel, e.x * c + c * 0.82, e.y * c + c * 0.82);
      g.fillText(e.nivel, e.x * c + c * 0.82, e.y * c + c * 0.82);
      g.lineWidth = 1;
    }
  }

  // Nave-Cidade do jogador.
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

  // Marchas: linha até o alvo e um ponto na posição atual.
  for (const m of s.marchas) {
    const ax = m.alvoX * c + c / 2;
    const ay = m.alvoY * c + c / 2;
    let p = 1;
    if (m.fase === 'indo') p = Math.min(1, (now - m.inicio) / (m.fim - m.inicio || 1));
    else if (m.fase === 'voltando') p = 1 - Math.min(1, (now - m.inicio) / (m.fim - m.inicio || 1));
    const cor = m.tipo === 'ataque' ? '#ff6b6b' : m.tipo === 'reforco' ? '#4dabf7' : '#38d9a9';
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

  if (selecionado) {
    g.strokeStyle = '#ffd43b';
    g.lineWidth = 2;
    g.strokeRect(selecionado.x * c + 1, selecionado.y * c + 1, c - 2, c - 2);
    g.lineWidth = 1;
  }
  return c;
}

export function celulaDoClique(canvas, evento, celula) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((evento.clientX - r.left) / celula);
  const y = Math.floor((evento.clientY - r.top) / celula);
  if (x < 0 || y < 0 || x >= TAMANHO_MAPA || y >= TAMANHO_MAPA) return null;
  return { x, y, zona: zona(x, y) };
}
