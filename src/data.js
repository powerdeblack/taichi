// Dados estáticos do jogo (ver docs/GDD.md).

export const RECURSOS = {
  minerio: { nome: 'Minério', icone: '⛏️' },
  cristal: { nome: 'Cristal', icone: '💎' },
  plasma: { nome: 'Plasma', icone: '⚡' },
};

export const PREMIUM = { nome: 'Quasares', icone: '🌟' };
export const DOMINIO = { nome: 'Cristais de Domínio', icone: '🔷' };

// Módulos da Nave-Cidade. custo/tempo são do nível 1; o engine escala por nível.
export const EDIFICIOS = {
  comando: { nome: 'Centro de Comando', icone: '🛰️', max: 15, tempo: 30, custo: { minerio: 300, cristal: 300 },
    desc: 'Coração da Nave-Cidade. Nenhum módulo passa do nível dele.' },
  extrator: { nome: 'Extrator de Minério', icone: '⛏️', max: 15, tempo: 10, custo: { minerio: 80, cristal: 120 }, producao: { minerio: 2 },
    desc: 'Produz minério continuamente.' },
  minaCristal: { nome: 'Mina de Cristal', icone: '💎', max: 15, tempo: 10, custo: { minerio: 120, cristal: 80 }, producao: { cristal: 1.6 },
    desc: 'Produz cristal continuamente.' },
  reator: { nome: 'Reator de Plasma', icone: '⚡', max: 15, tempo: 20, custo: { minerio: 200, cristal: 200 }, producao: { plasma: 1 },
    desc: 'Produz plasma para pesquisas e naves avançadas.' },
  armazem: { nome: 'Armazém Orbital', icone: '📦', max: 15, tempo: 15, custo: { minerio: 150, cristal: 150 },
    desc: 'Aumenta a capacidade e o cofre (recursos que não podem ser saqueados).' },
  hangarDrones: { nome: 'Hangar de Drones', icone: '🐝', max: 15, tempo: 20, custo: { minerio: 200, cristal: 120 },
    desc: 'Fabrica Drones de Enxame.' },
  hangarInterceptores: { nome: 'Hangar de Interceptores', icone: '✈️', max: 15, tempo: 20, custo: { minerio: 220, cristal: 160 }, requer: { comando: 3 },
    desc: 'Fabrica Interceptores.' },
  docaArtilharia: { nome: 'Doca de Artilharia', icone: '🎯', max: 15, tempo: 20, custo: { minerio: 160, cristal: 220 },
    desc: 'Fabrica Fragatas de Artilharia.' },
  forjaCerco: { nome: 'Forja de Cerco', icone: '☄️', max: 15, tempo: 25, custo: { minerio: 300, cristal: 300, plasma: 100 }, requer: { comando: 4 },
    desc: 'Fabrica Couraçados de Cerco, essenciais contra Monólitos e Fortalezas.' },
  docaExtracao: { nome: 'Doca de Extração', icone: '🛸', max: 15, tempo: 15, custo: { minerio: 150, cristal: 150 },
    desc: 'Fabrica Naves de Extração, as únicas que coletam no espaço.' },
  laboratorio: { nome: 'Laboratório Quântico', icone: '🧪', max: 15, tempo: 25, custo: { minerio: 300, cristal: 400 },
    desc: 'Pesquisa tecnologias.' },
  hospital: { nome: 'Baía de Reparos', icone: '🏥', max: 15, tempo: 15, custo: { minerio: 200, cristal: 100 },
    desc: 'Recebe tripulações gravemente feridas para reparo.' },
  muralha: { nome: 'Casco de Escudos', icone: '🛡️', max: 15, tempo: 25, custo: { minerio: 300, cristal: 200 },
    desc: 'Reforça a defesa da Nave-Cidade contra invasões.' },
  radar: { nome: 'Torre de Radar', icone: '📡', max: 15, tempo: 15, custo: { minerio: 150, cristal: 200 },
    desc: 'Avisa ataques chegando e revela a composição das frotas inimigas.' },
  cantina: { nome: 'Cantina Estelar', icone: '🍸', max: 15, tempo: 20, custo: { minerio: 250, cristal: 250 }, requer: { comando: 3 },
    desc: 'Abre Sinais de Recrutamento (fragmentos de comandantes). Sinal de Prata grátis periódico.' },
  embaixada: { nome: 'Embaixada Galáctica', icone: '🤝', max: 15, tempo: 20, custo: { minerio: 200, cristal: 200 },
    desc: 'Permite fundar a aliança, receber ajudas e presentes.' },
};

// Triângulo de vantagens (RoK): Drone > Interceptor > Artilharia > Drone. Cerco contra estruturas.
export const NAVES = {
  drone: { nome: 'Drone de Enxame', classe: 'Infantaria', icone: '🐝', edificio: 'hangarDrones',
    atk: 10, def: 14, hp: 12, carga: 4, vel: 1.0, poder: 2, tempo: 1.5, custo: { minerio: 40, cristal: 30 }, forteContra: 'interceptor' },
  interceptor: { nome: 'Interceptor', classe: 'Cavalaria', icone: '✈️', edificio: 'hangarInterceptores',
    atk: 14, def: 9, hp: 10, carga: 3, vel: 1.6, poder: 3, tempo: 2, custo: { minerio: 30, cristal: 30, plasma: 15 }, forteContra: 'artilharia' },
  artilharia: { nome: 'Fragata de Artilharia', classe: 'Arqueiros', icone: '🎯', edificio: 'docaArtilharia',
    atk: 15, def: 8, hp: 9, carga: 3, vel: 1.0, poder: 2, tempo: 2, custo: { minerio: 20, cristal: 50 }, forteContra: 'drone' },
  cerco: { nome: 'Couraçado de Cerco', classe: 'Cerco', icone: '☄️', edificio: 'forjaCerco',
    atk: 12, def: 10, hp: 11, carga: 5, vel: 0.7, poder: 4, tempo: 3, custo: { minerio: 60, cristal: 40, plasma: 30 }, bonusEstrutura: 2 },
  extrator: { nome: 'Nave de Extração', classe: 'Coleta', icone: '🛸', edificio: 'docaExtracao', coleta: true,
    atk: 2, def: 6, hp: 10, carga: 40, vel: 1.2, poder: 1, tempo: 2, custo: { minerio: 50, cristal: 50 } },
};

export const TIPOS_COMBATE = ['drone', 'interceptor', 'artilharia', 'cerco'];

// Comandantes semi-NFT: cada fragmento é 1 unidade do token ERC-1155 de mesmo `tokenId`.
export const RARIDADES = {
  Lendário: { desbloqueio: 20, porEstrela: 10, cor: '#f5b942' },
  Épico: { desbloqueio: 10, porEstrela: 5, cor: '#b06cff' },
};

export const COMANDANTES = {
  kaito: { tokenId: 1, nome: 'Kaito, o Ronin Estelar', icone: '⚔️', raridade: 'Lendário', inicial: true,
    bonus: { ataque: 0.10 }, desc: '+10% de ataque da frota.' },
  orion: { tokenId: 2, nome: 'Orion Drake', icone: '🧭', raridade: 'Épico', inicial: true,
    bonus: { velocidade: 0.20, coleta: 0.30 }, desc: '+20% velocidade e +30% coleta.' },
  vega: { tokenId: 3, nome: 'Vega Solaris', icone: '☀️', raridade: 'Épico',
    bonus: { defesa: 0.15 }, desc: '+15% de defesa da frota.' },
  mira: { tokenId: 4, nome: 'Mira Okada', icone: '🛸', raridade: 'Épico',
    bonus: { coleta: 0.40, carga: 0.20 }, desc: '+40% coleta e +20% carga das Naves de Extração.' },
  nyx: { tokenId: 5, nome: 'Nyx Valkyria', icone: '🌑', raridade: 'Lendário',
    bonus: { ataque: 0.08, piratas: 0.25 }, desc: '+8% ataque e +25% contra piratas.' },
  ryu: { tokenId: 6, nome: 'Ryu Tenkai', icone: '🐉', raridade: 'Lendário',
    bonus: { ataque: 0.05, estruturas: 0.30 }, desc: '+5% ataque e +30% contra Monólitos, Fortalezas e Portais.' },
};

export const SINAIS = {
  sinalPrata: { nome: 'Sinal de Prata', icone: '🥈', quasares: 30, fragmentos: [2, 4], chanceLendario: 0.1 },
  sinalOuro: { nome: 'Sinal de Ouro', icone: '🥇', quasares: 120, fragmentos: [3, 6], chanceLendario: 0.45 },
};

export const ITENS = {
  caixaMinerio: { nome: 'Caixa de Minério', icone: '📦⛏️', conteudo: { minerio: 1000 }, desc: 'Abra só quando for gastar: caixas não podem ser saqueadas.' },
  caixaCristal: { nome: 'Caixa de Cristal', icone: '📦💎', conteudo: { cristal: 1000 }, desc: 'Abra só quando for gastar: caixas não podem ser saqueadas.' },
  caixaPlasma: { nome: 'Caixa de Plasma', icone: '📦⚡', conteudo: { plasma: 500 }, desc: 'Abra só quando for gastar: caixas não podem ser saqueadas.' },
  escudo: { nome: 'Escudo de Paz (4h)', icone: '🔰', desc: 'A Nave-Cidade não pode ser atacada por 4 horas. Atacar quebra o escudo.' },
  salto: { nome: 'Salto Warp', icone: '🌀', desc: 'Move a Nave-Cidade para qualquer coordenada livre de uma zona liberada.' },
  sinalPrata: { nome: 'Sinal de Prata', icone: '🥈', desc: 'Abra na Cantina para ganhar fragmentos de comandante.' },
  sinalOuro: { nome: 'Sinal de Ouro', icone: '🥇', desc: 'Abra na Cantina: maior chance de fragmentos lendários.' },
};

export const PESQUISAS = {
  mineracao: { nome: 'Mineração Avançada', icone: '⛏️', max: 5, tempo: 30, custo: { minerio: 400, cristal: 400 }, efeito: '+10% produção por nível' },
  canhoes: { nome: 'Canhões de Íons', icone: '🔫', max: 5, tempo: 40, custo: { minerio: 500, cristal: 600, plasma: 100 }, efeito: '+5% ataque por nível' },
  blindagem: { nome: 'Blindagem Nanotech', icone: '🧱', max: 5, tempo: 40, custo: { minerio: 600, cristal: 500, plasma: 100 }, efeito: '+5% defesa por nível' },
  warp: { nome: 'Propulsão Warp', icone: '🌀', max: 5, tempo: 35, custo: { minerio: 300, cristal: 500, plasma: 150 }, efeito: '+10% velocidade de marcha por nível' },
  logistica: { nome: 'Logística Estelar', icone: '📦', max: 5, tempo: 30, custo: { minerio: 400, cristal: 300 }, efeito: '+10% carga e coleta por nível' },
  engenharia: { nome: 'Engenharia Rápida', icone: '🔧', max: 5, tempo: 45, custo: { minerio: 500, cristal: 500 }, efeito: '+8% velocidade de construção por nível' },
};

export const ZONAS = {
  1: { nome: 'Borda Exterior', pirata: [1, 5], recurso: [1, 2], fortaleza: [6, 7] },
  2: { nome: 'Braço Espiral', pirata: [6, 12], recurso: [3, 4], fortaleza: [10, 12] },
  3: { nome: 'Núcleo Galáctico', pirata: [13, 20], recurso: [5, 5], fortaleza: [16, 18] },
};

// Regiões nomeadas do Setor (como as províncias do mapa do RoK): 8 por anel + o buraco negro central.
export const REGIOES = {
  1: ['Órion', 'Perseu', 'Cygnus', 'Cassiopeia', 'Carina', 'Centauro', 'Scutum', 'Norma'],
  2: ['Lira', 'Áquila', 'Draco', 'Hydra', 'Pégaso', 'Andrômeda', 'Fênix', 'Vela'],
  3: ['Sagitário A*'],
};

export const NOMES_NAVES_RIVAIS = {
  vtx: ['Kraken', 'Tempestade', 'Hélice', 'Ciclone'],
  nbl: ['Umbra', 'Penumbra', 'Eclipse', 'Breu'],
};

export const ALIANCAS_RIVAIS = {
  vtx: { nome: 'Vórtice', tag: 'VTX', cor: '#ff5470', estacao: { x: 33, y: 6 } },
  nbl: { nome: 'Nébula Sombria', tag: 'NBL', cor: '#ffb020', estacao: { x: 31, y: 34 } },
};

export const MISSOES = [
  { id: 'extrator2', titulo: 'Evolua o Extrator de Minério ao nível 2', premio: { minerio: 500, cristal: 300 }, feita: (s) => s.edificios.extrator >= 2 },
  { id: 'extracao', titulo: 'Construa 10 Naves de Extração', premio: { caixaCristal: 1 }, feita: (s) => s.stats.extratoresTreinados >= 10 },
  { id: 'coleta2k', titulo: 'Colete 2.000 recursos no espaço', premio: { caixaPlasma: 1, quasares: 20 }, feita: (s) => s.stats.coletado >= 2000 },
  { id: 'pirata1', titulo: 'Derrote uma frota pirata', premio: { quasares: 50 }, feita: (s) => s.stats.piratas >= 1 },
  { id: 'comando3', titulo: 'Evolua o Centro de Comando ao nível 3', premio: { caixaMinerio: 2, caixaCristal: 2, quasares: 30 }, feita: (s) => s.edificios.comando >= 3 },
  { id: 'alianca', titulo: 'Funde sua aliança', premio: { escudo: 1 }, feita: (s) => Boolean(s.aliancas.jogador) },
  { id: 'estacao', titulo: 'Ancore a Estação Central da Aliança', premio: { caixaMinerio: 3, quasares: 50 }, feita: (s) => s.mapa.some((e) => e.tipo === 'estacao' && e.alianca === 'jogador') },
  { id: 'monolito', titulo: 'Erga um Monólito de Domínio', premio: { salto: 1 }, feita: (s) => s.stats.monolitosErguidos >= 1 },
  { id: 'pesquisa1', titulo: 'Conclua uma pesquisa', premio: { caixaMinerio: 1, caixaCristal: 1 }, feita: (s) => s.stats.pesquisas >= 1 },
  { id: 'cantina', titulo: 'Abra um Sinal de Recrutamento', premio: { sinalPrata: 2 }, feita: (s) => s.stats.sinais >= 1 },
  { id: 'recrutar', titulo: 'Desbloqueie um novo comandante', premio: { sinalOuro: 1 }, feita: (s) => Object.keys(s.comandantes).length >= 3 },
  { id: 'monolitoInimigo', titulo: 'Destrua um Monólito inimigo', premio: { quasares: 100 }, feita: (s) => s.stats.monolitosDestruidos >= 1 },
  { id: 'zona2', titulo: 'Capture um Portal Estelar e libere o Braço Espiral', premio: { sinalOuro: 2 }, feita: (s) => s.zonasLiberadas >= 2 },
  { id: 'explorar3', titulo: 'Explore 3 cavernas ou destroços com Sondas', premio: { sinalPrata: 1, caixaMinerio: 1 }, feita: (s) => s.stats.explorados >= 3 },
  { id: 'saque1', titulo: 'Saqueie uma Nave-Cidade rival fora do território dela', premio: { quasares: 80 }, feita: (s) => s.stats.navesSaqueadas >= 1 },
  { id: 'fortaleza1', titulo: 'Conquiste uma Fortaleza Xeno', premio: { quasares: 200 }, feita: (s) => s.stats.fortalezas >= 1 },
  { id: 'poder30k', titulo: 'Alcance 30.000 de poder', premio: { sinalOuro: 2, quasares: 150 }, feita: (s, ctx) => ctx.poder >= 30000 },
];
