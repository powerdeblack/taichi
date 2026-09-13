// Axie roster: one Axie per class, each with 3 cards -- the original 2
// signature moves (short/long attack, or heal/defense) plus a stronger
// "ability" card usable regardless of assigned role. `role` on a card means
// how it resolves (attack/defense/heal); a lane's assigned ROLE (Tank/
// Attacker/Healer, chosen at team-build time) is independent of class and
// scales that lane's stats -- see ROLES below.
export const AXIES = [
  {
    classId: 'Beast', name: 'Fera', color: '#c97b3d',
    cards: [
      { id:'investida', name:'Investida', range:'short', role:'attack', cost:0, dmg:14, effect:'ambush',
        desc:'Curto alcance. Ambush: dobra de dano no 1º acerto da partida.' },
      { id:'investida_pesada', name:'Investida Pesada', range:'long', role:'attack', cost:0, dmg:20, effect:'none',
        desc:'Longo alcance. Golpe pesado, mira a linha inimiga mais fraca.' },
      { id:'furia_selvagem', name:'Fúria Selvagem', range:'short', role:'attack', cost:3, dmg:22, effect:'none', ability:true,
        desc:'HABILIDADE. Curto alcance. Golpe bruto de altíssimo dano.' },
    ],
  },
  {
    classId: 'Aqua', name: 'Maré', color: '#4c8fb0',
    cards: [
      { id:'respingo', name:'Respingo', range:'short', role:'attack', cost:0, dmg:8, effect:'none',
        desc:'Curto alcance. Barato e direto, sem efeito extra.' },
      { id:'mare', name:'Maré Alta', range:'long', role:'attack', cost:0, dmg:9, effect:'bleed',
        desc:'Longo alcance. Aplica Sangramento: dano ao longo de 2 rodadas.' },
      { id:'mare_brava', name:'Maré Brava', range:'long', role:'attack', cost:3, dmg:12, effect:'bleed', ability:true,
        desc:'HABILIDADE. Longo alcance. Dano maior + Sangramento garantido.' },
    ],
  },
  {
    classId: 'Plant', name: 'Broto', color: '#3f6b4a',
    cards: [
      { id:'raiz', name:'Raiz', range:'short', role:'attack', cost:0, dmg:10, effect:'retain',
        desc:'Curto alcance. Retain: nunca sai da sua mão, acerte ou erre.' },
      { id:'brotamento', name:'Brotamento', range:'own', role:'heal', cost:2, heal:20, effect:'none',
        desc:'Cura 20 de HP (escalado por MP) da própria linha.' },
      { id:'floracao', name:'Floração', range:'own_all', role:'heal', cost:3, heal:12, effect:'none', ability:true,
        desc:'HABILIDADE. Cura 12 de HP (escalado por MP) em TODAS as suas linhas vivas.' },
    ],
  },
  {
    classId: 'Bird', name: 'Pluma', color: '#d9b44a',
    cards: [
      { id:'mergulho', name:'Mergulho', range:'short', role:'attack', cost:0, dmg:18, effect:'none',
        desc:'Curto alcance. Um golpe único e forte.' },
      { id:'pena', name:'Pena', range:'long', role:'attack', cost:0, dmg:6, effect:'multi',
        desc:'Longo alcance. 3 projéteis: +50% de dano bônus se 2+ acertarem.' },
      { id:'voo_rasante', name:'Voo Rasante', range:'long', role:'attack', cost:3, dmg:9, effect:'multi', ability:true,
        desc:'HABILIDADE. Longo alcance. Versão mais forte da Pena.' },
    ],
  },
  {
    classId: 'Bug', name:'Larva', color: '#7a5c9e',
    cards: [
      { id:'picada', name:'Picada', range:'short', role:'attack', cost:0, dmg:7, effect:'none',
        desc:'Curto alcance. Barata e direta.' },
      { id:'veneno', name:'Veneno', range:'long', role:'attack', cost:0, dmg:9, effect:'deathmark',
        desc:'Longo alcance. Aplica Marca da Morte: próximo golpe recebido tem +10 de dano puro.' },
      { id:'enxame', name:'Enxame', range:'short', role:'attack', cost:3, dmg:12, effect:'deathmark', ability:true,
        desc:'HABILIDADE. Curto alcance. Dano maior + Marca da Morte garantida.' },
    ],
  },
  {
    classId: 'Reptile', name:'Casco', color: '#8a8f5c',
    cards: [
      { id:'casca', name:'Casca', range:'own', role:'defense', cost:1, effect:'shield',
        desc:'Bloqueia 50% do próximo dano da própria linha.' },
      { id:'escudo', name:'Escudo', range:'own', role:'defense', cost:2, effect:'shield_cleanse',
        desc:'Bloqueia 50% do próximo dano e remove 1 status negativo da própria linha.' },
      { id:'muralha', name:'Muralha', range:'own_all', role:'defense', cost:3, effect:'shield', ability:true,
        desc:'HABILIDADE. Bloqueia 50% do próximo dano em TODAS as suas linhas vivas.' },
    ],
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

// Roles are chosen per-lane at team-build time, independent of class. They
// set that lane's HP/MP (MP scales heal and shield strength) and combat
// bonuses. Exactly one Tank is required per team; losing it ends the match.
export const ROLES = {
  Tank:     { label:'Tanque',      hpMult:1.6, mpMult:0.5, powerMult:1.0, healMult:1.0, damageReduction:0.25 },
  Attacker: { label:'Atacante',    hpMult:1.0, mpMult:1.0, powerMult:1.3, healMult:1.0, damageReduction:0 },
  Healer:   { label:'Curandeiro',  hpMult:0.6, mpMult:1.6, powerMult:1.0, healMult:1.5, damageReduction:0 },
};
export const ROLE_IDS = Object.keys(ROLES);
export const BASE_HP = 100;
export const BASE_MP = 100;
