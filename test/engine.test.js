import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.js';

const T0 = 1_700_000_000_000;
const novo = () => E.novoEstado(T0, 42);

test('estado inicial gera mapa com recursos, piratas e fortalezas', () => {
  const s = novo();
  assert.equal(s.mapa.filter((e) => e.tipo === 'recurso').length, 26);
  assert.equal(s.mapa.filter((e) => e.tipo === 'pirata').length, 18);
  assert.equal(s.mapa.filter((e) => e.tipo === 'fortaleza').length, 3);
  const posicoes = new Set(s.mapa.map((e) => `${e.x},${e.y}`));
  assert.equal(posicoes.size, s.mapa.length);
  assert.ok(!posicoes.has(`${s.base.x},${s.base.y}`));
});

test('mesma seed gera o mesmo mapa', () => {
  assert.deepEqual(E.novoEstado(T0, 7).mapa, E.novoEstado(T0, 7).mapa);
});

test('produção acumula até a capacidade do armazém', () => {
  const s = novo();
  E.tick(s, T0 + 10_000);
  assert.equal(Math.round(s.recursos.minerio), 2500 + 20);
  E.tick(s, T0 + 10_000 + 4 * 3600_000);
  assert.equal(s.recursos.minerio, E.capacidade(s));
});

test('evoluir edifício cobra recursos e conclui no tempo certo', () => {
  const s = novo();
  const custo = E.custoEdificio('extrator', 2);
  assert.ok(E.evoluir(s, 'extrator', T0).ok);
  assert.equal(s.recursos.minerio, 2500 - custo.minerio);
  assert.equal(E.evoluir(s, 'extrator', T0).ok, false);
  const fim = s.filas.construcao[0].fim;
  E.tick(s, fim - 1);
  assert.equal(s.edificios.extrator, 1);
  E.tick(s, fim);
  assert.equal(s.edificios.extrator, 2);
});

test('edifícios não passam do Centro de Comando', () => {
  const s = novo();
  s.recursos = { minerio: 1e6, cristal: 1e6, plasma: 1e6 };
  assert.ok(E.evoluir(s, 'extrator', T0).ok);
  E.tick(s, T0 + 1e6);
  s.recursos = { minerio: 1e6, cristal: 1e6, plasma: 1e6 };
  const r = E.podeEvoluir(s, 'extrator');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /Centro de Comando/);
});

test('treino respeita requisitos e adiciona naves', () => {
  const s = novo();
  assert.equal(E.treinar(s, 'caca', 10, T0).ok, false);
  assert.ok(E.treinar(s, 'fragata', 20, T0).ok);
  E.tick(s, T0 + 60_000);
  assert.equal(s.tropas.fragata, 80);
  assert.equal(s.stats.tropasTreinadas, 20);
});

test('triângulo de vantagens: fragatas vencem caças em igualdade', () => {
  const mods = { ataque: 0, defesa: 0 };
  const r = E.batalha({ tropas: { fragata: 100 }, mods }, { tropas: { caca: 100 }, mods });
  assert.ok(r.vitoria);
});

test('cerco causa dano dobrado em fortalezas', () => {
  const mods = { ataque: 0, defesa: 0 };
  const def = { tropas: { fragata: 200 }, mods };
  const sem = E.batalha({ tropas: { cerco: 100 }, mods }, def);
  const com = E.batalha({ tropas: { cerco: 100 }, mods }, def, { alvoFortaleza: true });
  assert.ok(com.perdasDefensor.fragata > sem.perdasDefensor.fragata);
});

test('ataque a pirata nível 1 com frota inicial vence e traz saque', () => {
  const s = novo();
  const pirata = s.mapa.filter((e) => e.tipo === 'pirata').sort((a, b) => a.nivel - b.nivel)[0];
  pirata.nivel = 1;
  pirata.tropas = E.gerarExercito(1);
  const tropas = { ...s.tropas };
  assert.ok(E.enviarMarcha(s, { alvoId: pirata.id, comandante: 'kaito', tropas }, T0).ok);
  assert.equal(E.totalTropas(s.tropas), 0);
  E.tick(s, T0 + 3600_000);
  assert.equal(s.marchas.length, 0);
  assert.equal(s.stats.piratas, 1);
  assert.ok(!s.mapa.some((e) => e.id === pirata.id));
  assert.equal(s.mapa.filter((e) => e.tipo === 'pirata').length, 18, 'pirata reaparece');
  assert.ok(s.quasares > 100);
});

test('coleta retira do nó e entrega recursos na volta', () => {
  const s = novo();
  const no = s.mapa.find((e) => e.tipo === 'recurso' && e.recurso === 'cristal');
  const qtdInicial = no.quantidade;
  const cristalAntes = s.recursos.cristal;
  assert.ok(E.enviarMarcha(s, { alvoId: no.id, comandante: 'orion', tropas: { fragata: 20 } }, T0).ok);
  assert.equal(E.enviarMarcha(s, { alvoId: no.id, comandante: 'kaito', tropas: { fragata: 5 } }, T0).ok, false);
  E.tick(s, T0 + 3600_000);
  assert.equal(s.marchas.length, 0);
  const carga = E.cargaMarcha(s, { fragata: 20 });
  assert.equal(s.stats.coletado, carga);
  const restante = s.mapa.find((e) => e.id === no.id);
  if (restante) assert.equal(restante.quantidade, qtdInicial - carga);
  assert.ok(s.recursos.cristal >= cristalAntes);
});

test('retornar marcha devolve as naves', () => {
  const s = novo();
  const no = s.mapa.find((e) => e.tipo === 'recurso');
  E.enviarMarcha(s, { alvoId: no.id, comandante: 'orion', tropas: { fragata: 10 } }, T0);
  const m = s.marchas[0];
  assert.ok(E.retornarMarcha(s, m.id, T0 + 1000).ok);
  E.tick(s, T0 + 2001);
  assert.equal(s.tropas.fragata, 60);
  assert.equal(no.ocupadoPor, null);
});

test('aceleração e ajuda da aliança reduzem timers', () => {
  const s = novo();
  E.evoluir(s, 'extrator', T0);
  const item = s.filas.construcao[0];
  assert.equal(E.ajudaAlianca(s, 'construcao', item.id, T0).ok, false);
  s.edificios.embaixada = 1;
  const antes = item.fim;
  assert.ok(E.ajudaAlianca(s, 'construcao', item.id, T0).ok);
  assert.ok(item.fim < antes);
  const q = s.quasares;
  assert.ok(E.acelerar(s, 'construcao', item.id, T0).ok);
  assert.ok(s.quasares < q);
  E.tick(s, T0);
  assert.equal(s.edificios.extrator, 2);
});

test('invasão pirata ocorre com Centro de Comando 3 e é defendida pela guarnição', () => {
  const s = novo();
  s.edificios.comando = 3;
  s.tropas = { fragata: 300, caca: 0, cruzador: 300, cerco: 0 };
  E.tick(s, T0 + 1);
  assert.equal(s.proximoRaid, T0 + 1 + E.INTERVALO_RAID);
  E.tick(s, s.proximoRaid);
  assert.equal(s.stats.raidsDefendidas, 1);
});

test('missões podem ser resgatadas uma vez', () => {
  const s = novo();
  s.edificios.extrator = 2;
  assert.ok(E.resgatarMissao(s, 'extrator2', T0).ok);
  assert.equal(E.resgatarMissao(s, 'extrator2', T0).ok, false);
});

test('recrutar comandante consome quasares', () => {
  const s = novo();
  assert.equal(E.recrutar(s, 'vega', T0).ok, false);
  s.quasares = 200;
  assert.ok(E.recrutar(s, 'vega', T0).ok);
  assert.equal(s.quasares, 50);
  assert.equal(s.comandantes.vega.nivel, 1);
});
