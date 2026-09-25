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
// `defaultCounts` is the attack/defense/heal split (always summing to
// LOADOUT_SIZE) a freshly-picked Axie starts with when it's given this
// set -- a preset loadout matching that set's own identity (Warrior hits
// hard, Priest heals big, etc.) instead of the same generic split for
// everyone. The player can still tweak it with the steppers afterward;
// picking a different set re-applies THAT set's own preset (see main.js's
// addToSquad/changeSet).
export const CARD_SETS = [
  {
    id: 'warrior', name: 'Warrior', icon: '⚔️', color: '#c97b3d', nativeClassId: 'Beast',
    defaultCounts: { attack: 4, defense: 1, heal: 0 },
    attackCards: [
      { id:'corte_selvagem', name:'Savage Slash', range:'short', role:'attack', cost:0, dmg:21, effect:'ambush',
        desc:'Short range. Ambush: doubles damage on the match’s first hit.' },
      { id:'investida_brutal', name:'Brutal Charge', range:'long', role:'attack', cost:0, dmg:34, effect:'none',
        desc:'Long range. Heavy hit, targets the weakest enemy lane.' },
    ],
    signatureCard: { id:'furia_selvagem', name:'Savage Fury', range:'short', role:'attack', cost:0, dmg:20, effect:'bleed',
      desc:'Beast-born Warrior signature. Short range. Bites deep: applies Bleed on top of a heavy hit.' },
    controlCard: { id:'golpe_atordoante', name:'Stunning Blow', range:'short', role:'attack', cost:1, dmg:14, effect:'stun', duration:2.5,
      desc:'Short range. Stun 2.5s: the target can\'t play cards, its cast is interrupted, a stunned Tank can\'t move.' },
    secretCard: { id:'contra_ataque', name:'Counterattack', range:'own', role:'defense', cost:1, effect:'secret', trap:'counter', amount:22,
      desc:'Secret: laid face-down on an ally. When it\'s attacked, it strikes back for 22 (scaled by Power).' },
    defenseCard: { id:'postura_defensiva', name:'Defensive Stance', range:'own', role:'defense', cost:2, effect:'bulwark', hits:3,
      desc:'Bulwark: reduces the next 3 hits taken by 35% each, no cleanse.' },
    healCard: { id:'grito_de_guerra', name:'War Cry', range:'own', role:'heal', cost:1, heal:17,
      desc:'A battle cry that mends wounds -- heals 17 HP right away (scaled by MP). Reversed on an enemy: Reverse Heal, deals that much damage instead.' },
  },
  {
    id: 'priest', name: 'Priest', icon: '🙏', color: '#3f6b4a', nativeClassId: 'Plant',
    defaultCounts: { attack: 1, defense: 0, heal: 4 },
    attackCards: [
      { id:'punicao_sagrada', name:'Holy Smite', range:'short', role:'attack', cost:0, dmg:14, effect:'retain',
        desc:'Short range. Retain: never leaves your hand, hit or miss.' },
      { id:'julgamento_final', name:'Final Judgment', range:'long', role:'attack', cost:0, dmg:16, effect:'deathmark',
        desc:'Long range. Applies Deathmark: the next 2 hits it takes deal +30 pure damage each.' },
    ],
    signatureCard: { id:'espinhos_da_fe', name:'Thorns of Faith', range:'short', role:'attack', cost:0, dmg:15, effect:'retain',
      desc:'Plant-born Priest signature. Short range. Thorny faith: Retain, never leaves your hand, hit or miss.' },
    controlCard: { id:'luz_ofuscante', name:'Blinding Light', range:'long', role:'attack', cost:1, dmg:10, effect:'fear',
      desc:'Long range. Fear: the target\'s next attack misses completely.' },
    secretCard: { id:'graca_oculta', name:'Hidden Grace', range:'own', role:'defense', cost:1, effect:'secret', trap:'grace', amount:26,
      desc:'Secret: laid face-down on an ally. When a hit drops it under half HP, it heals 26 (scaled by MP).' },
    defenseCard: { id:'protecao_divina', name:'Divine Guard', range:'own', role:'defense', cost:1, effect:'shield',
      desc:'Guard: blocks 60% of the next hit taken.' },
    healCard: { id:'bencao', name:'Blessing', range:'own', role:'heal', cost:2, heal:24,
      desc:'A priest’s biggest single heal -- 24 HP right away (scaled by MP). Reversed on an enemy: Reverse Heal, deals that much damage instead.' },
    signatureDefenseCard: { id:'purificacao', name:'Purify', range:'own', role:'defense', cost:1, effect:'bulwark_cleanse', hits:2,
      desc:'Plant-born Priest signature. Cleanse: removes Bleed, Poison and Deathmark from an ally, then Bulwark (next 2 hits taken -35%).' },
    signatureHealCard: { id:'brotos_curativos', name:'Healing Sprouts', range:'own', role:'heal', cost:1, effect:'regen', regenTicks:3,
      desc:'Plant-born Priest signature. Regeneration: heals a little HP (scaled by MP) every tick for 3 ticks, blossoming from your own vitality. Reversed on an enemy: the same as damage over time instead.' },
  },
  {
    id: 'mage', name: 'Mage', icon: '🔮', color: '#4c8fb0', nativeClassId: 'Aqua',
    defaultCounts: { attack: 3, defense: 2, heal: 0 },
    attackCards: [
      { id:'centelha_arcana', name:'Arcane Spark', range:'short', role:'attack', cost:0, dmg:12, effect:'bleed',
        desc:'Short range. Applies Bleed: arcane burns that linger for 2 rounds.' },
      { id:'explosao_arcana', name:'Arcane Blast', range:'long', role:'attack', cost:0, dmg:22, effect:'none',
        desc:'Long range. Heavy nuke, targets the weakest enemy lane.' },
    ],
    signatureCard: { id:'mare_arcana', name:'Arcane Tide', range:'long', role:'attack', cost:0, dmg:16, effect:'poison',
      desc:'Aqua-born Mage signature. Long range. A corrosive arcane tide: applies Poison.' },
    controlCard: { id:'rajada_gelida', name:'Frost Gust', range:'long', role:'attack', cost:0, dmg:12, effect:'chill', duration:8,
      desc:'Long range. Chill 8s: the target can\'t dodge and a chilled Tank moves at half speed.' },
    secretCard: { id:'armadilha_gelida', name:'Frost Trap', range:'own', role:'defense', cost:1, effect:'secret', trap:'frost', amount:12, duration:8,
      desc:'Secret: laid face-down on an ally. When it\'s attacked, the attacker takes 12 and is Chilled for 8s.' },
    defenseCard: { id:'barreira_arcana', name:'Arcane Barrier', range:'own', role:'defense', cost:2, effect:'barrier', amount:44,
      desc:'Barrier: absorbs the next 44 damage taken, no matter how many hits it takes to burn through.' },
    healCard: { id:'dreno_vital', name:'Life Drain', range:'own', role:'heal', cost:1, heal:21,
      desc:'Channels life force -- heals an ally for 21 HP (scaled by MP), or drains an enemy for the same amount as damage instead (Reverse Heal).' },
  },
  {
    id: 'ranger', name: 'Ranger', icon: '🏹', color: '#d9b44a', nativeClassId: 'Bird',
    defaultCounts: { attack: 3, defense: 1, heal: 1 },
    attackCards: [
      { id:'tiro_certeiro', name:'True Shot', range:'short', role:'attack', cost:0, dmg:22, effect:'none',
        desc:'Short range. A precise, direct shot.' },
      { id:'chuva_de_flechas', name:'Arrow Rain', range:'long', role:'attack', cost:0, dmg:13, effect:'multi',
        desc:'Long range. 3 arrows: +50% bonus damage if 2+ land.' },
    ],
    signatureCard: { id:'voo_certeiro', name:'Swift Flight', range:'long', role:'attack', cost:0, dmg:12, effect:'multi',
      desc:'Bird-born Ranger signature. Long range. A second arrow-rain: 3 more arrows, +50% bonus if 2+ land.' },
    controlCard: { id:'flecha_congelante', name:'Freezing Arrow', range:'long', role:'attack', cost:0, dmg:14, effect:'chill', duration:8,
      desc:'Long range. Chill 8s: the target can\'t dodge and a chilled Tank moves at half speed.' },
    secretCard: { id:'rede_de_caca', name:"Hunter's Net", range:'own', role:'defense', cost:1, effect:'secret', trap:'snare', duration:3,
      desc:'Secret: laid face-down on an ally. When it\'s attacked, the attacker is Stunned for 3s.' },
    defenseCard: { id:'reflexos_ageis', name:'Agile Reflexes', range:'own', role:'defense', cost:2, effect:'dodge', charges:2, chance:0.5,
      desc:'Evasion: 50% chance to fully dodge each of the next 2 hits taken.' },
    healCard: { id:'kit_medico', name:'Med Kit', range:'own', role:'heal', cost:1, heal:21,
      desc:'A quick field patch -- heals 21 HP right away (scaled by MP). Reversed on an enemy: Reverse Heal, deals that much damage instead.' },
  },
  {
    id: 'rogue', name: 'Rogue', icon: '🗡️', color: '#7a5c9e', nativeClassId: 'Bug',
    defaultCounts: { attack: 3, defense: 1, heal: 1 },
    attackCards: [
      { id:'facada_nas_costas', name:'Backstab', range:'short', role:'attack', cost:0, dmg:16, effect:'none',
        desc:'Short range. Cheap and direct.' },
      { id:'lamina_envenenada', name:'Venom Blade', range:'long', role:'attack', cost:0, dmg:16, effect:'poison',
        desc:'Long range. Applies Poison: fading damage that stacks with itself.' },
    ],
    signatureCard: { id:'ferroada', name:'Sting', range:'short', role:'attack', cost:0, dmg:14, effect:'poison',
      desc:'Bug-born Rogue signature. Short range. A venomous sting: applies Poison up close.' },
    controlCard: { id:'golpe_sombrio', name:'Shadow Strike', range:'short', role:'attack', cost:1, dmg:13, effect:'fear',
      desc:'Short range. Fear: the target\'s next attack misses completely.' },
    secretCard: { id:'sombra', name:'Shadow', range:'own', role:'defense', cost:2, effect:'secret', trap:'shadow',
      desc:'Secret: laid face-down on an ally. The first attack on it is dodged and the attacker is Feared.' },
    defenseCard: { id:'cortina_de_fumaca', name:'Smoke Screen', range:'own', role:'defense', cost:2, effect:'dodge', charges:1, chance:0.6,
      desc:'Smoke bomb: 60% chance to dodge the next hit taken.' },
    healCard: { id:'adrenalina', name:'Adrenaline', range:'own', role:'heal', cost:1, effect:'regen', regenTicks:2,
      desc:'Regeneration: heals a little HP (scaled by MP) every tick for 2 ticks -- a quick burst. Reversed on an enemy: the same as damage over time instead.' },
  },
  {
    id: 'shaman', name: 'Shaman', icon: '🪶', color: '#8a8f5c', nativeClassId: 'Reptile',
    defaultCounts: { attack: 2, defense: 2, heal: 1 },
    attackCards: [
      { id:'toque_espiritual', name:'Spirit Touch', range:'short', role:'attack', cost:0, dmg:14, effect:'none',
        desc:'Short range. A direct spiritual strike.' },
      { id:'furia_ancestral', name:'Ancestral Fury', range:'long', role:'attack', cost:0, dmg:16, effect:'none',
        desc:'Long range. Channels ancestral fury, targets the weakest enemy lane.' },
    ],
    signatureCard: { id:'presas_ancestrais', name:'Ancestral Fangs', range:'short', role:'attack', cost:0, dmg:15, effect:'deathmark',
      desc:'Reptile-born Shaman signature. Short range. Ancestral fangs mark the prey: applies Deathmark.' },
    controlCard: { id:'uivo_ancestral', name:'Ancestral Howl', range:'short', role:'attack', cost:1, dmg:12, effect:'stun', duration:2,
      desc:'Short range. Stun 2s: the target can\'t play cards, its cast is interrupted, a stunned Tank can\'t move.' },
    secretCard: { id:'totem_amaldicoado', name:'Cursed Totem', range:'own', role:'defense', cost:1, effect:'secret', trap:'venom',
      desc:'Secret: laid face-down on an ally. When it\'s attacked, the attacker gets Bleed and Poison.' },
    defenseCard: { id:'vinculo_espiritual', name:'Spirit Bond', range:'own', role:'defense', cost:2, effect:'thorns', hits:3, pct:0.6,
      desc:'Thorns: reflects 60% of the damage from the next 3 hits taken back onto whoever landed them.' },
    healCard: { id:'comunhao_ancestral', name:'Ancestral Communion', range:'own', role:'heal', cost:2, effect:'regen', regenTicks:4,
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
export const BASE_HP = 130;
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
  // Origin-style depth: each set's control attack (Stun / Fear / Chill)
  // comes after its regular and signature attacks, and its Secret after
  // its defenses -- so it shows up once a loadout invests enough in that
  // role.
  const attackPool = [...set.attackCards, ...((native && set.signatureCard) ? [set.signatureCard] : []), ...(set.controlCard ? [set.controlCard] : [])];
  const defensePool = [set.defenseCard, ...((native && set.signatureDefenseCard) ? [set.signatureDefenseCard] : []), ...(set.secretCard ? [set.secretCard] : [])];
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
  // Attack power: a flat +ATTACK_POINTS_PER_CARD per attack card in the
  // loadout, added to every hit's base (see game.js). Evolving still
  // multiplies the final hit by 1.15.
  const powerMult = mult;
  const attackBonus = counts.attack * ATTACK_POINTS_PER_CARD;
  const damageReduction = Math.min(0.5, counts.defense * 0.06);
  const maxHp = Math.round((BASE_HP + counts.defense * 13) * mult);
  const mp = Math.round((BASE_MP + counts.heal * 20) * mult);
  return { powerMult, attackBonus, damageReduction, maxHp, mp };
}

// Ready-made squads built around one synergy each. `picks` uses the exact
// squad-builder shape (species, card set, loadout counts, Tank flag), so
// loading one is just copying it into the squad. Every member is on its
// native set, so each unlocks its signature card.
export const ARCHETYPES = [
  {
    id: 'bleed', name: 'Savage Bleed', icon: '🩸', color: '#d9534f',
    tags: ['Bleed', 'Burst', 'Melee'],
    how: 'Warrior and Mage cut the same target up close: every Bleed hit adds a stack (up to 3) and each stack bleeds 6 every tick. The Shaman Tank walks in front, taunting attackers onto itself and reflecting their damage back with Thorns. Charge forward -- the Bleed hits are short range.',
    picks: [
      { classId: 'Reptile', setId: 'shaman', isTank: true, evolved: false, counts: { attack: 1, defense: 3, heal: 1 } },
      { classId: 'Beast', setId: 'warrior', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
      { classId: 'Aqua', setId: 'mage', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
    ],
  },
  {
    id: 'poison', name: 'Plague', icon: '☠️', color: '#8e5cc9',
    tags: ['Poison', 'Long range', 'Kite'],
    how: 'Rogue and Mage stack Poison from long range: each hit adds 3 stacks (up to 9), a tick deals 3 per stack and then fades by one -- a full stack (6) does about 63 damage over time. Stay back and keep re-applying it while the Shaman Tank regenerates and punishes anyone who rushes it with Thorns.',
    picks: [
      { classId: 'Reptile', setId: 'shaman', isTank: true, evolved: false, counts: { attack: 1, defense: 2, heal: 2 } },
      { classId: 'Bug', setId: 'rogue', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
      { classId: 'Aqua', setId: 'mage', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
    ],
  },
  {
    id: 'damage', name: 'Steel Rain', icon: '⚔️', color: '#e0a13a',
    tags: ['Damage', 'Long range', 'Burst'],
    how: 'Raw damage from far away: Ranger arrow volleys (+50% when they land), Mage Arcane Blast and the Warrior Tank\'s Brutal Charge are long-range hits that reach 6 units. The Warrior Tank soaks hits with Bulwark and taunts anyone who gets too close. Pick the weakest enemy and focus it down.',
    picks: [
      { classId: 'Beast', setId: 'warrior', isTank: true, evolved: false, counts: { attack: 2, defense: 3, heal: 0 } },
      { classId: 'Bird', setId: 'ranger', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
      { classId: 'Aqua', setId: 'mage', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
    ],
  },
  {
    id: 'heal', name: 'Sanctuary', icon: '💚', color: '#4caf6a',
    tags: ['Heal', 'Regen', 'Tank'],
    how: 'Outlast them: the Priest drops big heals and Regeneration on whoever is hurt, the Shaman Tank regenerates for 4 ticks and punishes attackers with Thorns, and the Ranger chips damage from range. Keep your Tank topped up and the enemy wears itself out.',
    picks: [
      { classId: 'Reptile', setId: 'shaman', isTank: true, evolved: false, counts: { attack: 0, defense: 3, heal: 2 } },
      { classId: 'Plant', setId: 'priest', isTank: false, evolved: false, counts: { attack: 1, defense: 0, heal: 4 } },
      { classId: 'Bird', setId: 'ranger', isTank: false, evolved: false, counts: { attack: 3, defense: 1, heal: 1 } },
    ],
  },
  {
    id: 'thorns', name: 'Thorn Wall', icon: '🌵', color: '#7c9a3c',
    tags: ['Thorns', 'Taunt', 'Anti-melee'],
    how: 'Bait them in: the Shaman Tank keeps Thorns up (60% of each of the next 3 hits it takes goes back to the attacker) and Taunt forces anyone who walks close to swing at it -- melee squads end up hitting the wall and hurting themselves. Behind it, the Warrior and the Ranger hit hard.',
    picks: [
      { classId: 'Reptile', setId: 'shaman', isTank: true, evolved: false, counts: { attack: 1, defense: 3, heal: 1 } },
      { classId: 'Beast', setId: 'warrior', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
      { classId: 'Bird', setId: 'ranger', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
    ],
  },
  {
    id: 'mirage', name: 'Mirage', icon: '💨', color: '#6ab7d9',
    tags: ['Evasion', 'Anti-burst', 'Poison'],
    how: 'Hard to hit: the Ranger Tank stacks Evasion (50% to dodge each of the next 2 hits, for the whole team) and the Rogue throws Smoke over the whole team (60% to dodge the next hit). A dodged hit deals nothing -- big single blows are wasted. Meanwhile arrows and poisoned blades chip away.',
    picks: [
      { classId: 'Bird', setId: 'ranger', isTank: true, evolved: false, counts: { attack: 1, defense: 3, heal: 1 } },
      { classId: 'Bug', setId: 'rogue', isTank: false, evolved: false, counts: { attack: 3, defense: 2, heal: 0 } },
      { classId: 'Bird', setId: 'ranger', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
    ],
  },
  {
    id: 'bastion', name: 'Arcane Bastion', icon: '🔵', color: '#3f7fd1',
    tags: ['Barrier', 'Shield', 'Sustain'],
    how: 'Layers of protection: the Mage Tank throws up Barriers on the whole team (each absorbs the next 44 damage), the Priest adds Guard (blocks 60% of the next hit), heals and a bit of damage. Burst gets soaked before it reaches HP, while the Mage behind trades Arcane Blasts. Weak spot: Bleed and Poison ticks go straight through barriers.',
    picks: [
      { classId: 'Aqua', setId: 'mage', isTank: true, evolved: false, counts: { attack: 1, defense: 3, heal: 1 } },
      { classId: 'Plant', setId: 'priest', isTank: false, evolved: false, counts: { attack: 2, defense: 2, heal: 1 } },
      { classId: 'Aqua', setId: 'mage', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
    ],
  },
  {
    id: 'deathmark', name: 'Deathmark Hunt', icon: '💀', color: '#9a6bd1',
    tags: ['Deathmark', 'Execute', 'Damage'],
    how: 'Mark, then crush: Shaman Fangs and Priest Final Judgment apply Deathmark (the next 2 hits on that Axie deal +30 each), and the Warrior follows with Brutal Charge (53) or a Savage Fury. Focus one target at a time and it drops fast.',
    picks: [
      { classId: 'Plant', setId: 'priest', isTank: true, evolved: false, counts: { attack: 2, defense: 3, heal: 0 } },
      { classId: 'Reptile', setId: 'shaman', isTank: false, evolved: false, counts: { attack: 3, defense: 1, heal: 1 } },
      { classId: 'Beast', setId: 'warrior', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
    ],
  },
  {
    id: 'toxic', name: 'Toxic Rush', icon: '🐍', color: '#5fa84a',
    tags: ['Poison', 'Rush', 'Anti-heal'],
    how: 'Three Rogues flood the enemy with Poison: every blade adds 3 stacks (up to 6, about 63 damage over time) faster than healers can undo it. Rush in, spread poison on the Tank, and let it tick while Smoke keeps your own Tank from being hit.',
    picks: [
      { classId: 'Bug', setId: 'rogue', isTank: true, evolved: false, counts: { attack: 2, defense: 2, heal: 1 } },
      { classId: 'Bug', setId: 'rogue', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
      { classId: 'Bug', setId: 'rogue', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
    ],
  },
  {
    id: 'hybrid', name: 'Blood & Venom', icon: '🧪', color: '#c0478c',
    tags: ['Bleed', 'Poison', 'Hybrid DOT'],
    how: 'Two damage-over-time effects at once: the Mage applies both Bleed (short) and Poison (long), the Rogue stacks more Poison, and they tick independently every 2s. The Warrior Tank holds the line with Bulwark (next 3 hits taken -35%).',
    picks: [
      { classId: 'Beast', setId: 'warrior', isTank: true, evolved: false, counts: { attack: 2, defense: 3, heal: 0 } },
      { classId: 'Aqua', setId: 'mage', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
      { classId: 'Bug', setId: 'rogue', isTank: false, evolved: false, counts: { attack: 4, defense: 1, heal: 0 } },
    ],
  },
];

export function copyArchetypePicks(archetype){
  return archetype.picks.map(p => ({ ...p, counts: { ...p.counts } }));
}

// ================= Attack damage model =================
// Every attack's base damage is a share of a *reference* Tank HP -- the
// average HP of the archetype Tanks (130 + 13 per defense card), a fixed
// number so two very defensive squads don't inflate each other's hits.
// ATTACK_FLOOR_SHARE (20%) of it is the floor: no attack card is ever
// weaker than that; stronger cards multiply above it (`power`). Effect
// cards (Bleed, Poison, Deathmark, arrows, control...) sit on the floor --
// their effect is their extra -- while plain hits carry the multipliers.
export const ATTACK_POINTS_PER_CARD = 2;
export const ATTACK_FLOOR_SHARE = 0.2;
export const REF_TANK_HP = Math.round(
  ARCHETYPES.map(a => a.picks.find(p => p.isTank)).reduce((sum, t) => sum + BASE_HP + t.counts.defense * 13, 0) / ARCHETYPES.length);
export const ATTACK_FLOOR = Math.round(REF_TANK_HP * ATTACK_FLOOR_SHARE);

// Relative strength of each attack card above the floor (1 = the floor).
const ATTACK_POWER = {
  investida_brutal: 1.6, explosao_arcana: 1.45, furia_ancestral: 1.3, tiro_certeiro: 1.3,
  facada_nas_costas: 1.25, toque_espiritual: 1.25,
};
// Energy cost of attacks: floor hits 2, heavy hits and Stuns 3 -- regen
// alone (~1.5 per cast window) can't keep up, so Heals (+2 energy) fund them.
const ATTACK_COST = { investida_brutal: 3, explosao_arcana: 3, golpe_atordoante: 3, uivo_ancestral: 3 };
// Active Defense/Heal cards reach the whole team; Heals also give energy.
for (const set of CARD_SETS){
  for (const card of [set.defenseCard, set.signatureDefenseCard, set.healCard, set.signatureHealCard]){
    if (!card || card.effect === 'secret' || card.effect === 'thorns') continue;
    card.desc = 'Whole team. ' + card.desc.replace(/ an ally/g, '').replace(/Reversed on an enemy:/, 'Reversed on an enemy it hits their whole team:')
      + (card.role === 'heal' ? ' Also gives +2 energy.' : '');
  }
}
for (const set of CARD_SETS){
  for (const card of [...set.attackCards, set.signatureCard, set.controlCard]){
    if (!card) continue;
    card.power = Math.max(1, ATTACK_POWER[card.id] || 1);
    card.dmg = Math.round(ATTACK_FLOOR * card.power);
    card.cost = ATTACK_COST[card.id] ?? 2;
  }
}
