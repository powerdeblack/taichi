// Geometria do Setor: zonas concêntricas e território das alianças (Estação Central + Monólitos de Domínio).

export const TAMANHO_MAPA = 40;
export const CENTRO = 20;
export const RAIO = { estacao: 3, monolito: 2 };

export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const dentroDoMapa = (x, y) => x >= 0 && y >= 0 && x < TAMANHO_MAPA && y < TAMANHO_MAPA;

// 1 = Borda Exterior, 2 = Braço Espiral, 3 = Núcleo Galáctico.
export function zona(x, y) {
  const d = cheb({ x, y }, { x: CENTRO, y: CENTRO });
  return d <= 6 ? 3 : d <= 13 ? 2 : 1;
}

export const ehEstrutura = (e) => e.tipo === 'estacao' || e.tipo === 'monolito';

// Estruturas se conectam quando suas áreas se tocam; só o que liga à Estação gera território.
export const alcanceConexao = (a, b) => RAIO[a.tipo] + RAIO[b.tipo] + 1;

export function estruturasConectadas(mapa, alianca) {
  const minhas = mapa.filter((e) => ehEstrutura(e) && e.alianca === alianca);
  const raiz = minhas.find((e) => e.tipo === 'estacao');
  const conectadas = new Set();
  if (!raiz) return conectadas;
  const fila = [raiz];
  conectadas.add(raiz.id);
  while (fila.length) {
    const atual = fila.shift();
    for (const e of minhas) {
      if (!conectadas.has(e.id) && cheb(atual, e) <= alcanceConexao(atual, e)) {
        conectadas.add(e.id);
        fila.push(e);
      }
    }
  }
  return conectadas;
}

let memo = { chave: null, valor: null };

// Map "x,y" -> id da aliança. Estruturas mais antigas têm prioridade em sobreposições.
export function mapaTerritorio(mapa) {
  const estruturas = mapa.filter(ehEstrutura);
  const chave = estruturas.map((e) => `${e.id}:${e.x},${e.y}:${e.alianca}`).join('|');
  if (memo.chave === chave) return memo.valor;
  const dono = new Map();
  const aliancas = [...new Set(estruturas.map((e) => e.alianca))];
  const conectadas = new Set(aliancas.flatMap((a) => [...estruturasConectadas(mapa, a)]));
  for (const e of [...estruturas].sort((a, b) => a.id - b.id)) {
    if (!conectadas.has(e.id)) continue;
    const r = RAIO[e.tipo];
    for (let x = e.x - r; x <= e.x + r; x++) {
      for (let y = e.y - r; y <= e.y + r; y++) {
        const k = `${x},${y}`;
        if (dentroDoMapa(x, y) && !dono.has(k)) dono.set(k, e.alianca);
      }
    }
  }
  memo = { chave, valor: dono };
  return dono;
}

export const donoDe = (mapa, x, y) => mapaTerritorio(mapa).get(`${x},${y}`) || null;

export function areaPorAlianca(mapa) {
  const area = {};
  for (const a of mapaTerritorio(mapa).values()) area[a] = (area[a] || 0) + 1;
  return area;
}
