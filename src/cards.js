// Axie roster: one Axie per class, each with 2 class-flavored attack cards
// (short + long range). Defense and heal cards are universal -- any class's
// Axie can equip them. A lane's actual power/toughness/heal-strength isn't a
// fixed role anymore: it's computed from how many attack/defense/heal cards
// you gave that Axie in its 5-card loadout (see computeLaneStats below).
export const AXIES = [
  {
    classId: 'Beast', name: 'Beast', color: '#c97b3d',
    attackCards: [
      { id:'charge', name:'Charge', range:'short', role:'attack', cost:0, dmg:14, effect:'ambush',
        desc:'Short range. Ambush: doubles damage on the match’s first hit.' },
      { id:'heavy_charge', name:'Heavy Charge', range:'long', role:'attack', cost:0, dmg:20, effect:'none',
        desc:'Long range. Heavy hit, targets the weakest enemy lane.' },
    ],
  },
  {
    classId: 'Aqua', name: 'Tide', color: '#4c8fb0',
    attackCards: [
      { id:'splash', name:'Splash', range:'short', role:'attack', cost:0, dmg:8, effect:'none',
        desc:'Short range. Cheap and direct, no extra effect.' },
      { id:'high_tide', name:'High Tide', range:'long', role:'attack', cost:0, dmg:9, effect:'bleed',
        desc:'Long range. Applies Bleed: damage over 2 rounds.' },
    ],
  },
  {
    classId: 'Plant', name: 'Sprout', color: '#3f6b4a',
    attackCards: [
      { id:'root', name:'Root', range:'short', role:'attack', cost:0, dmg:10, effect:'retain',
        desc:'Short range. Retain: never leaves your hand, hit or miss.' },
      { id:'thorn', name:'Thorn', range:'long', role:'attack', cost:0, dmg:16, effect:'none',
        desc:'Long range. Thorn strike, targets the weakest enemy lane.' },
    ],
  },
  {
    classId: 'Bird', name: 'Plume', color: '#d9b44a',
    attackCards: [
      { id:'dive', name:'Dive', range:'short', role:'attack', cost:0, dmg:18, effect:'none',
        desc:'Short range. A single strong hit.' },
      { id:'feather', name:'Feather', range:'long', role:'attack', cost:0, dmg:6, effect:'multi',
        desc:'Long range. 3 projectiles: +50% bonus damage if 2+ land.' },
    ],
  },
  {
    classId: 'Bug', name:'Larva', color: '#7a5c9e',
    attackCards: [
      { id:'sting', name:'Sting', range:'short', role:'attack', cost:0, dmg:7, effect:'none',
        desc:'Short range. Cheap and direct.' },
      { id:'venom', name:'Venom', range:'long', role:'attack', cost:0, dmg:9, effect:'deathmark',
        desc:'Long range. Applies Deathmark: the next hit it takes deals +10 pure damage.' },
    ],
  },
  {
    classId: 'Reptile', name:'Shell', color: '#8a8f5c',
    attackCards: [
      { id:'shell_charge', name:'Shell Charge', range:'short', role:'attack', cost:0, dmg:9, effect:'none',
        desc:'Short range. A direct shell-first charge.' },
      { id:'steel_tail', name:'Steel Tail', range:'long', role:'attack', cost:0, dmg:13, effect:'none',
        desc:'Long range. Tail whip, targets the weakest enemy lane.' },
    ],
  },
];

// Universal support cards -- any class's Axie can be loaded with these.
export const DEFENSE_CARDS = [
  { id:'defensive_stance', name:'Defensive Stance', range:'own', role:'defense', cost:1, effect:'shield',
    desc:'Blocks 50% of the next hit taken by this lane.' },
  { id:'bastion', name:'Bastion', range:'own', role:'defense', cost:2, effect:'shield_cleanse',
    desc:'Blocks 50% of the next hit and removes 1 negative status from this lane.' },
];
export const HEAL_CARDS = [
  { id:'light_heal', name:'Light Heal', range:'own', role:'heal', cost:1, heal:15,
    desc:'Heals 15 HP (scaled by MP) on this lane.' },
  { id:'deep_heal', name:'Deep Heal', range:'own', role:'heal', cost:2, heal:25,
    desc:'Heals 25 HP (scaled by MP) on this lane.' },
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
