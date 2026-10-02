// Dados estáticos do jogo: recursos, edifícios, naves, comandantes, pesquisas e missões.

export const RECURSOS = {
  minerio: { nome: 'Minério', icone: '⛏️' },
  cristal: { nome: 'Cristal', icone: '💎' },
  plasma: { nome: 'Plasma', icone: '⚡' },
};

export const PREMIUM = { nome: 'Quasares', icone: '🌟' };

// custo e tempo são do nível 1; cada nível seguinte multiplica pelos fatores do engine.
export const EDIFICIOS = {
  comando: {
    nome: 'Centro de Comando', icone: '🛰️', max: 10, tempo: 30,
    custo: { minerio: 300, cristal: 300 },
    desc: 'Coração da sua base. Limita o nível de todos os outros edifícios.',
  },
  extrator: {
    nome: 'Extrator de Minério', icone: '⛏️', max: 10, tempo: 10,
    custo: { minerio: 80, cristal: 120 }, producao: { minerio: 2 },
    desc: 'Extrai minério de asteroides próximos.',
  },
  minaCristal: {
    nome: 'Mina de Cristal', icone: '💎', max: 10, tempo: 10,
    custo: { minerio: 120, cristal: 80 }, producao: { cristal: 1.6 },
    desc: 'Lapida cristais usados em quase tudo.',
  },
  reator: {
    nome: 'Reator de Plasma', icone: '⚡', max: 10, tempo: 20,
    custo: { minerio: 200, cristal: 200 }, producao: { plasma: 1 }, requer: { comando: 2 },
    desc: 'Gera plasma para Caças e naves de cerco.',
  },
  armazem: {
    nome: 'Armazém Orbital', icone: '📦', max: 10, tempo: 15,
    custo: { minerio: 150, cristal: 150 },
    desc: 'Aumenta a capacidade e protege recursos contra saques.',
  },
  estaleiro: {
    nome: 'Estaleiro Espacial', icone: '🚀', max: 10, tempo: 20,
    custo: { minerio: 250, cristal: 150 },
    desc: 'Constrói naves. Níveis maiores liberam naves e aceleram o treino.',
  },
  laboratorio: {
    nome: 'Laboratório Quântico', icone: '🧪', max: 10, tempo: 25,
    custo: { minerio: 300, cristal: 400 }, requer: { comando: 2 },
    desc: 'Permite pesquisar tecnologias.',
  },
  hospital: {
    nome: 'Baía Médica', icone: '🏥', max: 10, tempo: 15,
    custo: { minerio: 200, cristal: 100 },
    desc: 'Recupera tripulações feridas em batalha.',
  },
  muralha: {
    nome: 'Muralha de Escudos', icone: '🛡️', max: 10, tempo: 25,
    custo: { minerio: 300, cristal: 200 }, requer: { comando: 3 },
    desc: 'Fortalece a defesa da base contra invasões piratas.',
  },
  embaixada: {
    nome: 'Embaixada Galáctica', icone: '🤝', max: 10, tempo: 20,
    custo: { minerio: 200, cristal: 200 }, requer: { comando: 2 },
    desc: 'Liga você à aliança: ajudas reduzem tempos e há presentes periódicos.',
  },
};

// Triângulo de vantagens no estilo RoK: Fragata > Caça > Cruzador > Fragata.
export const NAVES = {
  fragata: {
    nome: 'Fragata', classe: 'Infantaria', icone: '🛡️',
    atk: 10, def: 14, hp: 12, carga: 10, vel: 1.0, poder: 2, tempo: 1.5,
    custo: { minerio: 40, cristal: 30 }, requer: { estaleiro: 1 }, forteContra: 'caca',
  },
  caca: {
    nome: 'Caça', classe: 'Cavalaria', icone: '✈️',
    atk: 14, def: 9, hp: 10, carga: 6, vel: 1.6, poder: 3, tempo: 2,
    custo: { minerio: 30, cristal: 30, plasma: 15 }, requer: { estaleiro: 2, reator: 1 }, forteContra: 'cruzador',
  },
  cruzador: {
    nome: 'Cruzador', classe: 'Arqueiros', icone: '🎯',
    atk: 15, def: 8, hp: 9, carga: 8, vel: 1.0, poder: 2, tempo: 2,
    custo: { minerio: 20, cristal: 50 }, requer: { estaleiro: 1 }, forteContra: 'fragata',
  },
  cerco: {
    nome: 'Couraçado de Cerco', classe: 'Cerco', icone: '☄️',
    atk: 12, def: 10, hp: 11, carga: 20, vel: 0.7, poder: 4, tempo: 3,
    custo: { minerio: 60, cristal: 40, plasma: 30 }, requer: { estaleiro: 3, reator: 1 }, bonusFortaleza: 2,
  },
};

// bônus crescem 5% por nível do comandante.
export const COMANDANTES = {
  kaito: {
    nome: 'Kaito, o Ronin Estelar', icone: '⚔️', raridade: 'Lendário', inicial: true,
    bonus: { ataque: 0.10 }, desc: '+10% de ataque da frota.',
  },
  orion: {
    nome: 'Orion Drake', icone: '🧭', raridade: 'Épico', inicial: true,
    bonus: { velocidade: 0.20, coleta: 0.30 }, desc: '+20% velocidade e +30% coleta.',
  },
  vega: {
    nome: 'Vega Solaris', icone: '☀️', raridade: 'Épico', custo: 150,
    bonus: { defesa: 0.15 }, desc: '+15% de defesa da frota.',
  },
  nyx: {
    nome: 'Nyx Valkyria', icone: '🌑', raridade: 'Lendário', custo: 250,
    bonus: { ataque: 0.08, piratas: 0.25 }, desc: '+8% ataque e +25% contra piratas.',
  },
};

export const PESQUISAS = {
  mineracao: { nome: 'Mineração Avançada', icone: '⛏️', max: 5, tempo: 30, custo: { minerio: 400, cristal: 400 }, efeito: '+10% produção por nível' },
  canhoes: { nome: 'Canhões de Íons', icone: '🔫', max: 5, tempo: 40, custo: { minerio: 500, cristal: 600, plasma: 100 }, efeito: '+5% ataque por nível' },
  blindagem: { nome: 'Blindagem Nanotech', icone: '🧱', max: 5, tempo: 40, custo: { minerio: 600, cristal: 500, plasma: 100 }, efeito: '+5% defesa por nível' },
  warp: { nome: 'Propulsão Warp', icone: '🌀', max: 5, tempo: 35, custo: { minerio: 300, cristal: 500, plasma: 150 }, efeito: '+10% velocidade de marcha por nível' },
  logistica: { nome: 'Logística Estelar', icone: '📦', max: 5, tempo: 30, custo: { minerio: 400, cristal: 300 }, efeito: '+10% carga e coleta por nível' },
  engenharia: { nome: 'Engenharia Rápida', icone: '🔧', max: 5, tempo: 45, custo: { minerio: 500, cristal: 500 }, efeito: '+8% velocidade de construção por nível' },
};

export const MISSOES = [
  { id: 'extrator2', titulo: 'Evolua o Extrator de Minério ao nível 2', premio: { minerio: 500, cristal: 300 }, feita: (s) => s.edificios.extrator >= 2 },
  { id: 'fragatas30', titulo: 'Treine 30 naves', premio: { minerio: 400, cristal: 400 }, feita: (s) => s.stats.tropasTreinadas >= 30 },
  { id: 'comando3', titulo: 'Evolua o Centro de Comando ao nível 3', premio: { minerio: 1500, cristal: 1500, quasares: 30 }, feita: (s) => s.edificios.comando >= 3 },
  { id: 'pirata1', titulo: 'Derrote uma frota pirata', premio: { quasares: 50 }, feita: (s) => s.stats.piratas >= 1 },
  { id: 'coleta2k', titulo: 'Colete 2.000 recursos na galáxia', premio: { plasma: 500, quasares: 20 }, feita: (s) => s.stats.coletado >= 2000 },
  { id: 'pesquisa1', titulo: 'Conclua uma pesquisa', premio: { minerio: 1000, cristal: 1000 }, feita: (s) => s.stats.pesquisas >= 1 },
  { id: 'ajuda1', titulo: 'Receba ajuda da aliança', premio: { quasares: 20 }, feita: (s) => s.stats.ajudas >= 1 },
  { id: 'recrutar', titulo: 'Recrute um novo comandante', premio: { plasma: 1000 }, feita: (s) => Object.keys(s.comandantes).length >= 3 },
  { id: 'comando5', titulo: 'Evolua o Centro de Comando ao nível 5', premio: { minerio: 5000, cristal: 5000, quasares: 100 }, feita: (s) => s.edificios.comando >= 5 },
  { id: 'raid1', titulo: 'Defenda a base de uma invasão pirata', premio: { quasares: 60 }, feita: (s) => s.stats.raidsDefendidas >= 1 },
  { id: 'fortaleza1', titulo: 'Conquiste uma Fortaleza Xeno', premio: { quasares: 200 }, feita: (s) => s.stats.fortalezas >= 1 },
  { id: 'poder20k', titulo: 'Alcance 20.000 de poder', premio: { quasares: 150 }, feita: (s, ctx) => ctx.poder >= 20000 },
];
