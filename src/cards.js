// Axie roster: species (classId) is purely biological now -- it drives the
// 3D model, the portrait color, and the class-triangle damage bonus
// (classMultiplier), nothing else. What an Axie actually DOES in combat
// comes from its `setId` (a "card set", the functional class -- Warrior,
// Priest, Mage, Ranger, Rogue, Shaman): each set has its own 2 attack cards
// plus its own defense card and heal card, all with distinct named
// mechanics. A Beast Axie loaded with the Priest set plays and heals like a
// Priest, not a Beast -- species and function are fully decoupled, same way
// a real Axie's body PARTS (not its species) decide its actual cards. A
// loadout is still exactly 5 cards split across Attack/Defense/Heal in
// whatever proportion you want (see computeLaneStats below); the set just
// decides WHICH cards those counts draw from.
export const AXIES = [
  { classId: 'Beast', name: 'Beast', color: '#c97b3d', desc: 'Strong vs Plant, weak vs Aqua.' },
  { classId: 'Aqua', name: 'Tide', color: '#4c8fb0', desc: 'Strong vs Beast, weak vs Plant.' },
  { classId: 'Plant', name: 'Sprout', color: '#3f6b4a', desc: 'Strong vs Aqua, weak vs Beast.' },
  { classId: 'Bird', name: 'Plume', color: '#d9b44a', desc: 'Strong vs Bug, weak vs Reptile.' },
  { classId: 'Bug', name: 'Larva', color: '#7a5c9e', desc: 'Strong vs Reptile, weak vs Bird.' },
  { classId: 'Reptile', name: 'Shell', color: '#8a8f5c', desc: 'Strong vs Bird, weak vs Bug.' },
];

// Card sets (functional classes) -- original archetypes, not ported from
// Axie Origin. Every set carries exactly 4 base cards: 2 attack (short +
// long range) and 1 each of defense/heal, each with its own named mechanic.
// Defense/heal cards can be aimed at an ally (their normal effect below) or
// at an enemy instead (reversed: Guard/Bulwark/Barrier/Dodge/Thorns all
// become Vulnerable, Heal/Regen become damage or a damage-over-time --
// Reverse Heal, see game.js resolveCard).
//
// Each set also has a `nativeClassId` -- one species it's thematically
// "coupled" to (Bird/Ranger, Beast/Warrior, etc.) -- and optional signature
// cards (`signatureCard` for attack, `signatureHealCard` for heal,
// `signatureDefenseCard` for defense) that ONLY unlock when a lane's
// species matches its set's native species (see cards.js buildLoadout).
// Any species can equip any set (function stays fully open), but the
// native pairing gets a wider, more rewarding pool in whichever role fits
// its flavor best -- a Bird running Ranger gets a SECOND multi-arrow
// attack card, a Plant running Priest gets a SECOND heal card (a
// regeneration to complement the base instant Blessing) -- out-performing
// an off-species pick of the same set in that role. Each set's `color` is
// literally its native species' own color (same convention real Origin
// uses: a card's color band IS its class) -- so in the squad builder, a
// set icon whose color matches the Axie's own species color is the native
// combo; a mismatched color is an off-species (still fully playable) pick.
export const CARD_SETS = [
  {
    id: 'warrior', name: 'Guerreiro', icon: '⚔️', color: '#c97b3d', nativeClassId: 'Beast',
    attackCards: [
      { id:'corte_selvagem', name:'Corte Selvagem', range:'short', role:'attack', cost:0, dmg:14, effect:'ambush',
        desc:'Short range. Ambush: doubles damage on the match’s first hit.' },
      { id:'investida_brutal', name:'Investida Brutal', range:'long', role:'attack', cost:0, dmg:20, effect:'none',
        desc:'Long range. Heavy hit, targets the weakest enemy lane.' },
    ],
    signatureCard: { id:'furia_selvagem', name:'Fúria Selvagem', range:'short', role:'attack', cost:0, dmg:15, effect:'bleed',
      desc:'Beast-born Warrior signature. Short range. Bites deep: applies Bleed on top of a heavy hit.' },
    defenseCard: { id:'postura_defensiva', name:'Postura Defensiva', range:'own', role:'defense', cost:2, effect:'bulwark', hits:3,
      desc:'Bulwark: reduces the next 3 hits taken by 25% each, no cleanse. Reversed on an enemy: Vulnerable instead.' },
    healCard: { id:'grito_de_guerra', name:'Grito de Guerra', range:'own', role:'heal', cost:1, heal:12,
      desc:'A battle cry that mends wounds -- heals 12 HP right away (scaled by MP). Reversed on an enemy: Reverse Heal, deals that much damage instead.' },
  },
  {
    id: 'priest', name: 'Sacerdote', icon: '🙏', color: '#3f6b4a', nativeClassId: 'Plant',
    attackCards: [
      { id:'punicao_sagrada', name:'Punição Sagrada', range:'short', role:'attack', cost:0, dmg:8, effect:'retain',
        desc:'Short range. Retain: never leaves your hand, hit or miss.' },
      { id:'julgamento_final', name:'Julgamento Final', range:'long', role:'attack', cost:0, dmg:9, effect:'deathmark',
        desc:'Long range. Applies Deathmark: the next hit it takes deals +10 pure damage.' },
    ],
    signatureCard: { id:'espinhos_da_fe', name:'Espinhos da Fé', range:'short', role:'attack', cost:0, dmg:10, effect:'retain',
      desc:'Plant-born Priest signature. Short range. Thorny faith: Retain, never leaves your hand, hit or miss.' },
    defenseCard: { id:'protecao_divina', name:'Proteção Divina', range:'own', role:'defense', cost:1, effect:'shield',
      desc:'Guard: blocks 50% of the next hit taken. Reversed on an enemy: Vulnerable, +30% damage taken for its next 2 hits.' },
    healCard: { id:'bencao', name:'Bênção', range:'own', role:'heal', cost:2, heal:26,
      desc:'A priest’s biggest single heal -- 26 HP right away (scaled by MP). Reversed on an enemy: Reverse Heal, deals that much damage instead.' },
    signatureHealCard: { id:'brotos_curativos', name:'Brotos Curativos', range:'own', role:'heal', cost:1, effect:'regen', regenTicks:3,
      desc:'Plant-born Priest signature. Regeneration: heals a little HP (scaled by MP) every tick for 3 ticks, blossoming from your own vitality. Reversed on an enemy: the same as damage over time instead.' },
  },
  {
    id: 'mage', name: 'Mago', icon: '🔮', color: '#4c8fb0', nativeClassId: 'Aqua',
    attackCards: [
      { id:'centelha_arcana', name:'Centelha Arcana', range:'short', role:'attack', cost:0, dmg:9, effect:'bleed',
        desc:'Short range. Applies Bleed: arcane burns that linger for 2 rounds.' },
      { id:'explosao_arcana', name:'Explosão Arcana', range:'long', role:'attack', cost:0, dmg:16, effect:'none',
        desc:'Long range. Heavy nuke, targets the weakest enemy lane.' },
    ],
    signatureCard: { id:'mare_arcana', name:'Maré Arcana', range:'long', role:'attack', cost:0, dmg:12, effect:'poison',
      desc:'Aqua-born Mage signature. Long range. A corrosive arcane tide: applies Poison.' },
    defenseCard: { id:'barreira_arcana', name:'Barreira Arcana', range:'own', role:'defense', cost:2, effect:'barrier', amount:22,
      desc:'Barrier: absorbs the next 22 damage taken, no matter how many hits it takes to burn through. Reversed on an enemy: Vulnerable instead.' },
    healCard: { id:'dreno_vital', name:'Dreno Vital', range:'own', role:'heal', cost:1, heal:15,
      desc:'Channels life force -- heals an ally for 15 HP (scaled by MP), or drains an enemy for the same amount as damage instead (Reverse Heal).' },
  },
  {
    id: 'ranger', name: 'Arqueiro', icon: '🏹', color: '#d9b44a', nativeClassId: 'Bird',
    attackCards: [
      { id:'tiro_certeiro', name:'Tiro Certeiro', range:'short', role:'attack', cost:0, dmg:10, effect:'none',
        desc:'Short range. A precise, direct shot.' },
      { id:'chuva_de_flechas', name:'Chuva de Flechas', range:'long', role:'attack', cost:0, dmg:6, effect:'multi',
        desc:'Long range. 3 arrows: +50% bonus damage if 2+ land.' },
    ],
    signatureCard: { id:'voo_certeiro', name:'Voo Certeiro', range:'long', role:'attack', cost:0, dmg:7, effect:'multi',
      desc:'Bird-born Ranger signature. Long range. A second arrow-rain: 3 more arrows, +50% bonus if 2+ land.' },
    defenseCard: { id:'reflexos_ageis', name:'Reflexos Ágeis', range:'own', role:'defense', cost:2, effect:'dodge', charges:2, chance:0.5,
      desc:'Evasion: 50% chance to fully dodge each of the next 2 hits taken. Reversed on an enemy: Vulnerable instead.' },
    healCard: { id:'kit_medico', name:'Kit Médico', range:'own', role:'heal', cost:1, heal:15,
      desc:'A quick field patch -- heals 15 HP right away (scaled by MP). Reversed on an enemy: Reverse Heal, deals that much damage instead.' },
  },
  {
    id: 'rogue', name: 'Ladino', icon: '🗡️', color: '#7a5c9e', nativeClassId: 'Bug',
    attackCards: [
      { id:'facada_nas_costas', name:'Facada nas Costas', range:'short', role:'attack', cost:0, dmg:7, effect:'none',
        desc:'Short range. Cheap and direct.' },
      { id:'lamina_envenenada', name:'Lâmina Envenenada', range:'long', role:'attack', cost:0, dmg:9, effect:'poison',
        desc:'Long range. Applies Poison: fading damage that stacks with itself.' },
    ],
    signatureCard: { id:'ferroada', name:'Ferroada', range:'short', role:'attack', cost:0, dmg:8, effect:'poison',
      desc:'Bug-born Rogue signature. Short range. A venomous sting: applies Poison up close.' },
    defenseCard: { id:'cortina_de_fumaca', name:'Cortina de Fumaça', range:'own', role:'defense', cost:1, effect:'dodge', charges:1, chance:1,
      desc:'Smoke bomb: guaranteed dodge of the next hit taken. Reversed on an enemy: Vulnerable instead.' },
    healCard: { id:'adrenalina', name:'Adrenalina', range:'own', role:'heal', cost:1, effect:'regen', regenTicks:2,
      desc:'Regeneration: heals a little HP (scaled by MP) every tick for 2 ticks -- a quick burst. Reversed on an enemy: the same as damage over time instead.' },
  },
  {
    id: 'shaman', name: 'Xamã', icon: '🪶', color: '#8a8f5c', nativeClassId: 'Reptile',
    attackCards: [
      { id:'toque_espiritual', name:'Toque Espiritual', range:'short', role:'attack', cost:0, dmg:9, effect:'none',
        desc:'Short range. A direct spiritual strike.' },
      { id:'furia_ancestral', name:'Fúria Ancestral', range:'long', role:'attack', cost:0, dmg:11, effect:'none',
        desc:'Long range. Channels ancestral fury, targets the weakest enemy lane.' },
    ],
    signatureCard: { id:'presas_ancestrais', name:'Presas Ancestrais', range:'short', role:'attack', cost:0, dmg:10, effect:'deathmark',
      desc:'Reptile-born Shaman signature. Short range. Ancestral fangs mark the prey: applies Deathmark.' },
    defenseCard: { id:'vinculo_espiritual', name:'Vínculo Espiritual', range:'own', role:'defense', cost:2, effect:'thorns', hits:2, pct:0.4,
      desc:'Thorns: reflects 40% of the damage from the next 2 hits taken back onto whoever landed them. Reversed on an enemy: Vulnerable instead.' },
    healCard: { id:'comunhao_ancestral', name:'Comunhão Ancestral', range:'own', role:'heal', cost:2, effect:'regen', regenTicks:4,
      desc:'Regeneration: heals a little HP (scaled by MP) every tick for 4 ticks -- the longest regeneration around. Reversed on an enemy: the same as damage over time instead, for the full duration -- a true curse.' },
  },
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

export function setById(setId){
  return CARD_SETS.find(s => s.id === setId);
}

export const ALL_CLASSES = AXIES.map(a => a.classId);
export const ALL_SETS = CARD_SETS.map(s => s.id);
export const LOADOUT_SIZE = 5;
export const BASE_HP = 100;
export const BASE_MP = 100;

// Builds the actual card pool for one Axie's loadout: attackCount cards
// cycling through its SET's attack cards, defenseCount cycling through its
// defense card(s), healCount cycling through its heal card(s). Card type
// COUNTS -- not a fixed role -- are what drive that Axie's stats (see
// computeLaneStats). `classId` (the lane's species) decides whether the
// set's native-only signature cards are in the pool -- see CARD_SETS above.
export function buildLoadout(setId, classId, counts){
  const set = setById(setId);
  const native = set.nativeClassId === classId;
  const attackPool = (native && set.signatureCard) ? [...set.attackCards, set.signatureCard] : set.attackCards;
  const defensePool = (native && set.signatureDefenseCard) ? [set.defenseCard, set.signatureDefenseCard] : [set.defenseCard];
  const healPool = (native && set.signatureHealCard) ? [set.healCard, set.signatureHealCard] : [set.healCard];
  const pool = [];
  for (let i=0; i<counts.attack; i++) pool.push({ ...attackPool[i % attackPool.length] });
  for (let i=0; i<counts.defense; i++) pool.push({ ...defensePool[i % defensePool.length] });
  for (let i=0; i<counts.heal; i++) pool.push({ ...healPool[i % healPool.length] });
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
