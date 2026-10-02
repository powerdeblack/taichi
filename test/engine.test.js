import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';
import { mapaTerritorio, estruturasConectadas } from '../src/territorio.js';

const T0 = 1_700_000_000_000;
const RICO = { minerio: 1e6, cristal: 1e6, plasma: 1e6 };
const SEM_TROPAS = { drone: 0, interceptor: 0, artilharia: 0, cerco: 0, extrator: 0 };
const novo = () => E.novoEstado(T0, 42);
const dePorTipo = (s, tipo) => s.mapa.filter((e) => e.tipo === tipo);
const pausarRivais = (s) => { s.bots.expansao = Infinity; s.bots.ataque = Infinity; };

// Aliança com Estação Central ao lado da Nave-Cidade.
function comAlianca(s) {
  s.edificios.embaixada = 1;
  s.recursos = { ...RICO };
  assert.ok(E.fundarAlianca(s, 'Ronin Estelar', 'RNS', T0).ok);
  assert.ok(E.ancorarEstacao(s, s.base.x + 1, s.base.y, T0).ok);
  return dePorTipo(s, 'estacao').find((e) => e.alianca === 'jogador');
}

test('mapa: zonas, portais, rivais e posições únicas', () => {
  const s = novo();
  assert.equal(E.zona(s.base.x, s.base.y), 1);
  assert.equal(dePorTipo(s, 'portal').length, 8);
  assert.equal(dePorTipo(s, 'estacao').length, 2);
  assert.equal(dePorTipo(s, 'monolito').length, 4);
  const pos = new Set(s.mapa.map((e) => `${e.x},${e.y}`));
  assert.equal(pos.size, s.mapa.length);
  assert.ok(!pos.has(`${s.base.x},${s.base.y}`));
  for (const p of dePorTipo(s, 'pirata')) assert.equal(E.donoDe(s.mapa, p.x, p.y), null);
  assert.deepEqual(E.novoEstado(T0, 7).mapa, E.novoEstado(T0, 7).mapa);
});

test('produção acumula até a capacidade do Armazém', () => {
  const s = novo();
  pausarRivais(s);
  E.tick(s, T0 + 10_000);
  assert.equal(Math.round(s.recursos.minerio), 2520);
  E.tick(s, T0 + 10_000 + 4 * 3600_000);
  assert.equal(s.recursos.minerio, E.capacidade(s));
});

test('módulos respeitam o nível do Centro de Comando', () => {
  const s = novo();
  s.recursos = { ...RICO };
  assert.ok(E.evoluir(s, 'extrator', T0).ok);
  assert.equal(E.evoluir(s, 'extrator', T0).ok, false);
  E.tick(s, T0 + 1e6);
  assert.equal(s.edificios.extrator, 2);
  s.recursos = { ...RICO };
  assert.match(E.podeEvoluir(s, 'extrator').motivo, /Centro de Comando/);
});

test('cada hangar tem sua fila de treino', () => {
  const s = novo();
  pausarRivais(s);
  assert.ok(E.treinar(s, 'drone', 20, T0).ok);
  assert.equal(E.treinar(s, 'drone', 5, T0).ok, false);
  assert.ok(E.treinar(s, 'extrator', 10, T0).ok);
  assert.match(E.treinar(s, 'interceptor', 5, T0).motivo, /Hangar de Interceptores/);
  E.tick(s, T0 + 600_000);
  assert.equal(s.tropas.drone, 80);
  assert.equal(s.tropas.extrator, 20);
  assert.equal(s.stats.extratoresTreinados, 10);
});

test('combate: triângulo de vantagens e cerco contra estruturas', () => {
  const mods = { ataque: 0, defesa: 0 };
  assert.ok(E.batalha({ tropas: { drone: 100 }, mods }, { tropas: { interceptor: 100 }, mods }).vitoria);
  const def = { tropas: { drone: 200 }, mods };
  const sem = E.batalha({ tropas: { cerco: 100 }, mods }, def);
  const com = E.batalha({ tropas: { cerco: 100 }, mods }, def, { alvoEstrutura: true });
  assert.ok(com.perdasDefensor.drone > sem.perdasDefensor.drone);
});

test('só Naves de Extração coletam, e elas não entram em combate', () => {
  const s = novo();
  const no = dePorTipo(s, 'recurso').find((e) => e.zona === 1);
  const pirata = dePorTipo(s, 'pirata').find((p) => p.zona === 1);
  assert.match(E.enviarMarcha(s, { alvoId: no.id, comandante: 'orion', tropas: { drone: 10 } }, T0).motivo, /Extração/);
  assert.match(E.enviarMarcha(s, { alvoId: pirata.id, comandante: 'kaito', tropas: { extrator: 5 } }, T0).motivo, /Extração/);
});

test('coleta traz recursos e respeita a carga', () => {
  const s = novo();
  pausarRivais(s);
  const no = dePorTipo(s, 'recurso').find((e) => e.zona === 1);
  assert.ok(E.enviarMarcha(s, { alvoId: no.id, comandante: 'orion', tropas: { extrator: 10 } }, T0).ok);
  assert.equal(E.enviarMarcha(s, { alvoId: no.id, comandante: 'kaito', tropas: { extrator: 1 } }, T0).ok, false);
  E.tick(s, T0 + 3600_000);
  assert.equal(s.marchas.length, 0);
  const carga = E.cargaMarcha(s, { extrator: 10 }, 'orion');
  assert.ok([carga, Math.floor(carga / 2)].includes(s.stats.coletado), 'carga cheia, ou metade se interceptada');
});

test('ataque a pirata nível 1 vence, dá saque e o pirata reaparece', () => {
  const s = novo();
  pausarRivais(s);
  const pirata = dePorTipo(s, 'pirata').find((p) => p.zona === 1);
  pirata.nivel = 1;
  pirata.tropas = E.gerarExercito(1);
  const total = dePorTipo(s, 'pirata').length;
  assert.ok(E.enviarMarcha(s, { alvoId: pirata.id, comandante: 'kaito', secundario: 'orion', tropas: { drone: 60, artilharia: 40 } }, T0).ok);
  assert.equal(E.comandanteOcupado(s, 'orion'), true);
  E.tick(s, T0 + 3600_000);
  assert.equal(s.stats.piratas, 1);
  assert.equal(dePorTipo(s, 'pirata').length, total);
  assert.ok(s.comandantes.kaito.xp > 0 || s.comandantes.kaito.nivel > 1);
});

test('zonas bloqueadas não podem ser alvo', () => {
  const s = novo();
  const alvo = dePorTipo(s, 'pirata').find((p) => p.zona === 2);
  assert.match(E.enviarMarcha(s, { alvoId: alvo.id, comandante: 'kaito', tropas: { drone: 10 } }, T0).motivo, /Portal/);
});

test('aliança: Estação gera território que protege a Nave-Cidade', () => {
  const s = novo();
  assert.equal(E.naveProtegida(s, T0), false);
  assert.match(E.fundarAlianca(s, 'Xyz', 'XY', T0).motivo, /Embaixada/);
  comAlianca(s);
  assert.equal(E.naveProtegida(s, T0), true);
  assert.equal(mapaTerritorio(s.mapa).get(`${s.base.x},${s.base.y}`), 'jogador');
  E.tick(s, T0 + 100_000);
  assert.ok(s.aliancas.jogador.cristais > 300, 'território gera Cristais de Domínio');
});

test('Monólitos precisam estar conectados ao território', () => {
  const s = novo();
  const est = comAlianca(s);
  let longe = { x: est.x, y: est.y + 12 };
  while (E.ocupado(s, longe.x, longe.y)) longe = { x: longe.x + 1, y: longe.y };
  assert.match(E.erguerMonolito(s, longe.x, longe.y, T0).motivo, /conectado/);
  assert.ok(E.erguerMonolito(s, est.x, est.y + 5, T0).ok);
  assert.equal(estruturasConectadas(s.mapa, 'jogador').size, 2);
  assert.equal(E.donoDe(s.mapa, est.x, est.y + 7), 'jogador');
});

test('invasão pirata não atinge nave dentro do território', () => {
  const s = novo();
  comAlianca(s);
  pausarRivais(s);
  s.edificios.comando = 3;
  s.tropas = { ...SEM_TROPAS };
  E.tick(s, T0 + 1);
  const antes = s.recursos.minerio;
  E.tick(s, s.proximoRaid);
  assert.ok(s.recursos.minerio >= antes, 'nada foi saqueado');
  assert.match(s.registro[0].msg, /protegida/);
});

test('fora do território, o saque respeita o cofre', () => {
  const s = novo();
  pausarRivais(s);
  s.edificios.comando = 3;
  s.tropas = { ...SEM_TROPAS };
  s.recursos = { minerio: 1000, cristal: 9000, plasma: 1000 };
  E.tick(s, T0 + 1);
  s.ultimoTick = s.proximoRaid; // sem produção, para isolar o saque
  E.tick(s, s.proximoRaid);
  assert.equal(Math.round(s.recursos.minerio), 1000, 'abaixo do cofre não perde nada');
  assert.ok(s.recursos.cristal < 9000);
});

test('rivais destroem Monólito mal defendido', () => {
  const s = novo();
  const est = comAlianca(s);
  assert.ok(E.erguerMonolito(s, est.x, est.y + 5, T0).ok);
  const mono = dePorTipo(s, 'monolito').find((e) => e.alianca === 'jogador');
  mono.tropas = { ...SEM_TROPAS, drone: 1 };
  s.edificios.comando = 10;
  s.bots.expansao = Infinity;
  E.tick(s, s.bots.ataque);
  assert.equal(s.stats.monolitosPerdidos, 1);
  assert.ok(!s.mapa.some((e) => e.id === mono.id));
});

test('reforço guarnece Monólito até ser recolhido', () => {
  const s = novo();
  pausarRivais(s);
  const est = comAlianca(s);
  assert.ok(E.erguerMonolito(s, est.x, est.y + 5, T0).ok);
  const mono = dePorTipo(s, 'monolito').find((e) => e.alianca === 'jogador');
  assert.ok(E.enviarMarcha(s, { alvoId: mono.id, comandante: 'kaito', tropas: { drone: 30 } }, T0).ok);
  E.tick(s, T0 + 60_000);
  const m = s.marchas[0];
  assert.equal(m.fase, 'guarnecendo');
  assert.ok(E.retornarMarcha(s, m.id, T0 + 60_000).ok);
  E.tick(s, T0 + 120_000);
  assert.equal(s.marchas.length, 0);
  assert.equal(s.tropas.drone, 60);
});

test('destruir Monólito rival encolhe o território dele', () => {
  const s = novo();
  pausarRivais(s);
  const alvo = dePorTipo(s, 'monolito').find((e) => e.alianca === 'vtx' && E.zona(e.x, e.y) === 1);
  alvo.tropas = { ...SEM_TROPAS, drone: 1 };
  assert.equal(E.donoDe(s.mapa, alvo.x, alvo.y), 'vtx');
  s.tropas.cerco = 50;
  assert.ok(E.enviarMarcha(s, { alvoId: alvo.id, comandante: 'kaito', tropas: { cerco: 50 } }, T0).ok);
  E.tick(s, T0 + 3600_000);
  assert.equal(s.stats.monolitosDestruidos, 1);
  assert.ok(!s.mapa.some((e) => e.id === alvo.id));
});

test('Portal exige território conectado e libera a próxima zona', () => {
  const s = novo();
  pausarRivais(s);
  const portal = dePorTipo(s, 'portal').find((p) => p.abre === 2 && p.x === 6);
  assert.match(E.avaliarAlvo(s, portal).motivo, /território/);
  const est = comAlianca(s);
  s.aliancas.jogador.cristais = 1e6;
  // corrente de Monólitos da Estação até o Portal
  for (let y = est.y - 5; y > portal.y; y -= 4) assert.ok(E.erguerMonolito(s, est.x, y, T0).ok, `monólito em y=${y}`);
  assert.ok(E.avaliarAlvo(s, portal).ok);
  portal.tropas = { ...SEM_TROPAS, drone: 1 };
  assert.ok(E.enviarMarcha(s, { alvoId: portal.id, comandante: 'kaito', tropas: { drone: 60 } }, T0).ok);
  E.tick(s, T0 + 3600_000);
  assert.equal(s.zonasLiberadas, 2);
  assert.equal(portal.capturado, true);
});

test('fragmentos desbloqueiam comandantes e sobem estrelas', () => {
  const s = novo();
  assert.match(E.desbloquearComandante(s, 'vega', T0).motivo, /10 fragmentos/);
  s.fragmentos.vega = 6;
  s.universais['Épico'] = 4;
  assert.ok(E.desbloquearComandante(s, 'vega', T0).ok);
  assert.equal(s.universais['Épico'], 0);
  s.fragmentos.vega = 5;
  assert.ok(E.evoluirEstrela(s, 'vega', T0).ok);
  assert.equal(s.comandantes.vega.estrelas, 2);
  assert.equal(E.nivelMaximo(s.comandantes.vega), 20);
});

test('Cantina: sinal grátis, por item e por Quasares', () => {
  const s = novo();
  assert.match(E.abrirSinal(s, 'sinalPrata', T0, { gratis: true }).motivo, /Cantina/);
  s.edificios.cantina = 1;
  assert.ok(E.abrirSinal(s, 'sinalPrata', T0 + E.INTERVALO_SINAL_GRATIS, { gratis: true }).ok);
  assert.equal(E.abrirSinal(s, 'sinalPrata', T0 + E.INTERVALO_SINAL_GRATIS, { gratis: true }).ok, false);
  assert.ok(E.abrirSinal(s, 'sinalPrata', T0, { comQuasares: true }).ok);
  assert.equal(s.quasares, 70);
  const soma = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.ok(soma(s.fragmentos) + soma(s.universais) >= 4);
  assert.equal(s.stats.sinais, 2);
});

test('itens: caixa, escudo e Salto Warp', () => {
  const s = novo();
  const antes = s.recursos.minerio;
  assert.ok(E.usarItem(s, 'caixaMinerio', T0).ok);
  assert.equal(s.recursos.minerio, antes + 1000);
  s.inventario.escudo = 1;
  assert.ok(E.usarItem(s, 'escudo', T0).ok);
  assert.equal(E.naveProtegida(s, T0 + 1000), true);
  const pirata = dePorTipo(s, 'pirata').find((p) => p.zona === 1);
  assert.ok(E.enviarMarcha(s, { alvoId: pirata.id, comandante: 'kaito', tropas: { drone: 1 } }, T0).ok);
  assert.equal(E.naveProtegida(s, T0 + 1000), false, 'atacar quebra o escudo');
  const livre = { x: 3, y: 30 };
  while (E.ocupado(s, livre.x, livre.y)) livre.y++;
  assert.match(E.saltar(s, livre.x, livre.y, T0).motivo, /marchas/);
  s.marchas = [];
  assert.ok(E.saltar(s, livre.x, livre.y, T0).ok);
  assert.equal(s.quasares, 100 - E.CUSTO_SALTO);
  assert.deepEqual(s.base, livre);
});

test('check-in on-chain recompensa uma vez por dia', () => {
  const s = novo();
  assert.ok(E.recompensarCheckIn(s, 100, 3, T0).ok);
  assert.equal(E.recompensarCheckIn(s, 100, 3, T0).ok, false);
  assert.equal(s.quasares, 130);
  assert.equal(s.inventario.sinalPrata, 1);
});

test('missões com prêmios em itens', () => {
  const s = novo();
  s.edificios.extrator = 2;
  assert.ok(E.resgatarMissao(s, 'extrator2', T0).ok);
  assert.equal(E.resgatarMissao(s, 'extrator2', T0).ok, false);
  s.edificios.embaixada = 1;
  s.recursos = { ...RICO };
  E.fundarAlianca(s, 'Teste', 'TT', T0);
  assert.ok(E.resgatarMissao(s, 'alianca', T0).ok);
  assert.equal(s.inventario.escudo, 1);
});

test('progresso offline é limitado e o estado é serializável', () => {
  const s = novo();
  E.tick(s, T0 + 48 * 3600_000);
  const copia = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copia.recursos, s.recursos);
  assert.ok(E.poder(s) > 0);
});

test('comandantes forjados on-chain são desbloqueados no jogo', () => {
  const s = novo();
  assert.equal(E.sincronizarComandantesOnChain(s, [0, 0, 2, 0, 0, 0], T0), 1);
  assert.equal(s.comandantes.vega.estrelas, 2);
  assert.equal(E.sincronizarComandantesOnChain(s, [0, 0, 2, 0, 0, 0], T0), 0);
});

test('Sondas exploram cavernas e destroços (exigem Torre de Radar)', () => {
  const s = novo();
  pausarRivais(s);
  const caverna = dePorTipo(s, 'caverna').find((e) => e.zona === 1);
  const destroco = dePorTipo(s, 'destroco').find((e) => e.zona === 1);
  assert.match(E.enviarSonda(s, caverna.id, T0).motivo, /Radar/);
  s.edificios.radar = 1;
  assert.ok(E.enviarSonda(s, caverna.id, T0).ok);
  assert.match(E.enviarSonda(s, destroco.id, T0).motivo, /em missão/);
  // Sondas não ocupam vagas de marcha: as 2 vagas de frota continuam livres.
  const [p1, p2] = dePorTipo(s, 'pirata').filter((p) => p.zona === 1);
  assert.ok(E.enviarMarcha(s, { alvoId: p1.id, comandante: 'kaito', tropas: { drone: 1 } }, T0).ok);
  assert.ok(E.enviarMarcha(s, { alvoId: p2.id, comandante: 'orion', tropas: { drone: 1 } }, T0).ok);
  s.marchas = s.marchas.filter((m) => m.tipo === 'sonda');
  const q = s.quasares;
  E.tick(s, T0 + 3600_000);
  assert.equal(caverna.investigado, true);
  assert.ok(s.quasares > q);
  assert.equal(s.stats.explorados, 1);
  assert.match(E.avaliarSonda(s, caverna).motivo, /explorado/);
  assert.ok(E.enviarSonda(s, destroco.id, T0 + 3600_000).ok);
  const minerio = s.recursos.minerio;
  E.tick(s, T0 + 7200_000);
  assert.equal(destroco.visitado, true);
  assert.ok(s.recursos.minerio >= Math.min(minerio + 600, E.capacidade(s)));
});

test('naves rivais: protegidas no território, saqueáveis fora dele', () => {
  const s = novo();
  pausarRivais(s);
  const naves = dePorTipo(s, 'nave');
  assert.equal(naves.length, 8);
  const protegida = naves.find((n) => E.donoDe(s.mapa, n.x, n.y) === n.alianca);
  const exposta = naves.find((n) => E.donoDe(s.mapa, n.x, n.y) !== n.alianca && E.zona(n.x, n.y) === 1);
  assert.match(E.avaliarAlvo(s, protegida).motivo, /território/);
  assert.ok(exposta, 'existe nave rival exposta na Borda');
  exposta.tropas = { ...SEM_TROPAS, drone: 1 };
  assert.ok(E.enviarMarcha(s, { alvoId: exposta.id, comandante: 'kaito', tropas: { drone: 60, artilharia: 40 } }, T0).ok);
  E.tick(s, T0 + 3600_000);
  assert.equal(s.stats.navesSaqueadas, 1);
  assert.equal(E.donoDe(s.mapa, exposta.x, exposta.y), exposta.alianca, 'fugiu para o território');
  assert.ok(E.totalTropas(exposta.tropas) > 1, 'reabastecida');
});

test('marcadores, regiões e migração de saves antigos', () => {
  const s = novo();
  assert.ok(E.adicionarMarcador(s, 10, 10, 'Base inimiga').ok);
  assert.equal(E.adicionarMarcador(s, 10, 10, 'de novo').ok, false);
  assert.ok(E.removerMarcador(s, 10, 10).ok);
  assert.equal(E.regiao(20, 20), 'Sagitário A*');
  assert.notEqual(E.regiao(0, 20), E.regiao(39, 20));
  const antigo = JSON.parse(JSON.stringify(s));
  delete antigo.marcadores;
  delete antigo.stats.explorados;
  E.migrar(antigo);
  assert.deepEqual(antigo.marcadores, []);
  assert.equal(antigo.stats.explorados, 0);
});
