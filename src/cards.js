// Axie roster: one Axie per class, each with 2 class-flavored attack cards
// (short + long range). Defense and heal cards are universal -- any class's
// Axie can equip them. A lane's actual power/toughness/heal-strength isn't a
// fixed role anymore: it's computed from how many attack/defense/heal cards
// you gave that Axie in its 5-card loadout (see computeLaneStats below).
//
// Card names and flavor are reskinned from real Axie Origin cards (Beast:
// Besta Perigosa/Quebra-Nozes, Aqua: Koi/Ranchu, Plant: Cenoura/Melancia,
// Bird: Corvo/Melodia das Penas, Bug: Broca de Nariz/Cupins, Reptile:
// Dinossaurinho/Garra Venenosa) and the universal support cards below
// (Ornitorrinco, Guardião Tropical, Cachorrinho, Trevo). Numbers are tuned
// for this game's own HP/energy scale, not ported 1:1 from Origin.
export const AXIES = [
  {
    classId: 'Beast', name: 'Beast', color: '#c97b3d',
    attackCards: [
      { id:'besta_perigosa', name:'Besta Perigosa', range:'short', role:'attack', cost:0, dmg:14, effect:'ambush',
        desc:'Short range. Ambush: doubles damage on the match’s first hit.' },
      { id:'quebra_nozes', name:'Quebra-Nozes', range:'long', role:'attack', cost:0, dmg:20, effect:'none',
        desc:'Long range. Heavy hit, targets the weakest enemy lane.' },
    ],
  },
  {
    classId: 'Aqua', name: 'Tide', color: '#4c8fb0',
    attackCards: [
      { id:'koi', name:'Koi', range:'short', role:'attack', cost:0, dmg:8, effect:'none',
        desc:'Short range. Cheap and direct, no extra effect.' },
      { id:'ranchu', name:'Ranchu', range:'long', role:'attack', cost:0, dmg:9, effect:'bleed',
        desc:'Long range. Applies Bleed: damage over 2 rounds.' },
    ],
  },
  {
    classId: 'Plant', name: 'Sprout', color: '#3f6b4a',
    attackCards: [
      { id:'cenoura', name:'Cenoura', range:'short', role:'attack', cost:0, dmg:10, effect:'retain',
        desc:'Short range. Retain: never leaves your hand, hit or miss.' },
      { id:'melancia', name:'Melancia', range:'long', role:'attack', cost:0, dmg:16, effect:'none',
        desc:'Long range. Heavy strike, targets the weakest enemy lane.' },
    ],
  },
  {
    classId: 'Bird', name: 'Plume', color: '#d9b44a',
    attackCards: [
      { id:'corvo', name:'Corvo', range:'short', role:'attack', cost:0, dmg:18, effect:'none',
        desc:'Short range. A single strong hit.' },
      { id:'melodia_das_penas', name:'Melodia das Penas', range:'long', role:'attack', cost:0, dmg:6, effect:'multi',
        desc:'Long range. 3 projectiles: +50% bonus damage if 2+ land.' },
    ],
  },
  {
    classId: 'Bug', name:'Larva', color: '#7a5c9e',
    attackCards: [
      { id:'broca_de_nariz', name:'Broca de Nariz', range:'short', role:'attack', cost:0, dmg:7, effect:'none',
        desc:'Short range. Cheap and direct.' },
      { id:'cupins', name:'Cupins', range:'long', role:'attack', cost:0, dmg:9, effect:'deathmark',
        desc:'Long range. Applies Deathmark: the next hit it takes deals +10 pure damage.' },
    ],
  },
  {
    classId: 'Reptile', name:'Shell', color: '#8a8f5c',
    attackCards: [
      { id:'dinossaurinho', name:'Dinossaurinho', range:'short', role:'attack', cost:0, dmg:9, effect:'none',
        desc:'Short range. A direct charge.' },
      { id:'garra_venenosa', name:'Garra Venenosa', range:'long', role:'attack', cost:0, dmg:11, effect:'poison',
        desc:'Long range. Applies Poison: fading damage that stacks with itself.' },
    ],
  },
];

// Universal support cards -- any class's Axie can be loaded with these.
// Each one has its own named mechanic (not just a bigger number), the way
// real Origin support cards work. Both can target an ally (normal effect)
// or an enemy (reversed -- see game.js resolveCard): shield/cleanse
// reversed becomes Vulnerable (a debuff), heal/regen reversed becomes
// straight damage (Reverse Heal, a real Origin mechanic).
export const DEFENSE_CARDS = [
  { id:'ornitorrinco', name:'Ornitorrinco', range:'own', role:'defense', cost:1, effect:'shield',
    desc:'Guard: blocks 50% of the next hit taken. Reversed on an enemy: Vulnerable, +30% damage taken for its next 2 hits.' },
  { id:'guardiao_tropical', name:'Guardião Tropical', range:'own', role:'defense', cost:2, effect:'bulwark_cleanse',
    desc:'Cleanse: removes Bleed/Poison/Deathmark, then Bulwark reduces its next 2 hits by 25% each. Reversed on an enemy: Vulnerable instead.' },
];
export const HEAL_CARDS = [
  { id:'cachorrinho', name:'Cachorrinho', range:'own', role:'heal', cost:1, heal:15,
    desc:'Heals 15 HP (scaled by MP) right away. Reversed on an enemy: Reverse Heal, deals that much damage instead.' },
  { id:'trevo', name:'Trevo', range:'own', role:'heal', cost:2, effect:'regen', regenTicks:3,
    desc:'Regeneration: heals a little HP (scaled by MP) every tick for 3 ticks. Reversed on an enemy: the same as damage over time instead.' },
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
//
// `evolved` is this game's take on Origin's card-evolution tiers (α / base /
// "+"): mark an Axie as evolved in the squad builder and its whole build
// gets a flat +15% to power, HP and MP -- a levelled-up version of the same
// loadout, not a different one.
export const EVOLVE_BONUS = 0.15;
export function computeLaneStats(counts, evolved){
  const mult = evolved ? (1 + EVOLVE_BONUS) : 1;
  const powerMult = (1 + counts.attack * 0.15) * mult;
  const damageReduction = Math.min(0.5, counts.defense * 0.06);
  const maxHp = Math.round((BASE_HP + counts.defense * 10) * mult);
  const mp = Math.round((BASE_MP + counts.heal * 20) * mult);
  return { powerMult, damageReduction, maxHp, mp };
}
