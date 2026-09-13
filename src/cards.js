// Axie roster: one Axie per class, each with 2 class-flavored attack cards
// (short + long range). Defense and heal cards are universal -- any class's
// Axie can equip them. A lane's actual power/toughness/heal-strength isn't a
// fixed role anymore: it's computed from how many attack/defense/heal cards
// you gave that Axie in its 5-card loadout (see computeLaneStats below).
export const AXIES = [
  {
    classId: 'Beast', name: 'Fera', color: '#c97b3d',
    attackCards: [
      { id:'investida', name:'Investida', range:'short', role:'attack', cost:0, dmg:14, effect:'ambush',
        desc:'Curto alcance. Ambush: dobra de dano no 1º acerto da partida.' },
      { id:'investida_pesada', name:'Investida Pesada', range:'long', role:'attack', cost:0, dmg:20, effect:'none',
        desc:'Longo alcance. Golpe pesado, mira a linha inimiga mais fraca.' },
    ],
  },
  {
    classId: 'Aqua', name: 'Maré', color: '#4c8fb0',
    attackCards: [
      { id:'respingo', name:'Respingo', range:'short', role:'attack', cost:0, dmg:8, effect:'none',
        desc:'Curto alcance. Barato e direto, sem efeito extra.' },
      { id:'mare', name:'Maré Alta', range:'long', role:'attack', cost:0, dmg:9, effect:'bleed',
        desc:'Longo alcance. Aplica Sangramento: dano ao longo de 2 rodadas.' },
    ],
  },
  {
    classId: 'Plant', name: 'Broto', color: '#3f6b4a',
    attackCards: [
      { id:'raiz', name:'Raiz', range:'short', role:'attack', cost:0, dmg:10, effect:'retain',
        desc:'Curto alcance. Retain: nunca sai da sua mão, acerte ou erre.' },
      { id:'espinho', name:'Espinho', range:'long', role:'attack', cost:0, dmg:16, effect:'none',
        desc:'Longo alcance. Investida de espinhos, mira a linha mais fraca.' },
    ],
  },
  {
    classId: 'Bird', name: 'Pluma', color: '#d9b44a',
    attackCards: [
      { id:'mergulho', name:'Mergulho', range:'short', role:'attack', cost:0, dmg:18, effect:'none',
        desc:'Curto alcance. Um golpe único e forte.' },
      { id:'pena', name:'Pena', range:'long', role:'attack', cost:0, dmg:6, effect:'multi',
        desc:'Longo alcance. 3 projéteis: +50% de dano bônus se 2+ acertarem.' },
    ],
  },
  {
    classId: 'Bug', name:'Larva', color: '#7a5c9e',
    attackCards: [
      { id:'picada', name:'Picada', range:'short', role:'attack', cost:0, dmg:7, effect:'none',
        desc:'Curto alcance. Barata e direta.' },
      { id:'veneno', name:'Veneno', range:'long', role:'attack', cost:0, dmg:9, effect:'deathmark',
        desc:'Longo alcance. Aplica Marca da Morte: próximo golpe recebido tem +10 de dano puro.' },
    ],
  },
  {
    classId: 'Reptile', name:'Casco', color: '#8a8f5c',
    attackCards: [
      { id:'investida_casco', name:'Investida de Casco', range:'short', role:'attack', cost:0, dmg:9, effect:'none',
        desc:'Curto alcance. Investida direta com o casco.' },
      { id:'cauda_aco', name:'Cauda de Aço', range:'long', role:'attack', cost:0, dmg:13, effect:'none',
        desc:'Longo alcance. Chicotada de cauda, mira a linha mais fraca.' },
    ],
  },
];

// Universal support cards -- any class's Axie can be loaded with these.
export const DEFENSE_CARDS = [
  { id:'postura_defensiva', name:'Postura Defensiva', range:'own', role:'defense', cost:1, effect:'shield',
    desc:'Bloqueia 50% do próximo dano da própria linha.' },
  { id:'bastiao', name:'Bastião', range:'own', role:'defense', cost:2, effect:'shield_cleanse',
    desc:'Bloqueia 50% do próximo dano e remove 1 status negativo da própria linha.' },
];
export const HEAL_CARDS = [
  { id:'cura_leve', name:'Cura Leve', range:'own', role:'heal', cost:1, heal:15,
    desc:'Cura 15 de HP (escalado por MP) da própria linha.' },
  { id:'cura_profunda', name:'Cura Profunda', range:'own', role:'heal', cost:2, heal:25,
    desc:'Cura 25 de HP (escalado por MP) da própria linha.' },
];

// Beast > Plant > Aqua > Beast
export const TRI_A = ['Beast','Plant','Aqua'];
// Bird > Bug > Reptile > Bird
export const TRI_B = ['Bird','Bug','Reptile'];

export function classMultiplier(attackerCls, defenderCls){
  for (const tri of [TRI_A, TRI_B]){
    const ai = tri.indexOf(attackerCls), di = tri.indexOf(defenderCls);
    if (ai !== -1 && di !== -1){
      if ((ai+1)%3 === di) return 1.2;
      if ((di+1)%3 === ai) return 0.85;
    }
  }
  return 1;
}

export function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

export function axieById(classId){
  return AXIES.find(a => a.classId === classId);
}

export const ALL_CLASSES = AXIES.map(a => a.classId);
export const LOADOUT_SIZE = 5;
export const BASE_HP = 100;
export const BASE_MP = 100;

// Builds the actual card pool for one Axie's loadout: attackCount cards
// cycling through its class's 2 attack cards, defenseCount cycling through
// the universal defense cards, healCount cycling through the universal heal
// cards. Card type COUNTS -- not a fixed role -- are what drive that Axie's
// stats (see computeLaneStats).
export function buildLoadout(classId, counts){
  const axie = axieById(classId);
  const pool = [];
  for (let i=0; i<counts.attack; i++) pool.push({ ...axie.attackCards[i % axie.attackCards.length] });
  for (let i=0; i<counts.defense; i++) pool.push({ ...DEFENSE_CARDS[i % DEFENSE_CARDS.length] });
  for (let i=0; i<counts.heal; i++) pool.push({ ...HEAL_CARDS[i % HEAL_CARDS.length] });
  return pool;
}

// Count-based stats: every attack card adds outgoing power, every defense
// card adds HP and passive damage reduction (capped), every heal card adds
// MP (which scales heal/shield strength -- see game.js). Orthogonal by
// design: 5 defense cards doesn't stop you from also carrying 1 attack card,
// it just means your build only invested in toughness, not power.
export function computeLaneStats(counts){
  const powerMult = 1 + counts.attack * 0.15;
  const damageReduction = Math.min(0.5, counts.defense * 0.06);
  const maxHp = BASE_HP + counts.defense * 10;
  const mp = BASE_MP + counts.heal * 20;
  return { powerMult, damageReduction, maxHp, mp };
}
