// Axie roster for the lane board: one Axie per class, each with 2-3 signature
// cards. Card `range` decides legal targets: 'short' hits the mirrored enemy
// lane, 'long' can reach any enemy lane, and support cards (defense/heal) act
// on the caster's own lane.
export const AXIES = [
  {
    classId: 'Beast', name: 'Fera', color: '#c97b3d',
    cards: [
      { id:'investida', name:'Investida', range:'short', role:'attack', cost:1, dmg:14, effect:'ambush',
        desc:'Curto alcance. Ambush: dobra de dano no 1º acerto da partida.' },
      { id:'investida_pesada', name:'Investida Pesada', range:'long', role:'attack', cost:2, dmg:20, effect:'none',
        desc:'Longo alcance. Golpe pesado, mira a linha inimiga mais fraca.' },
    ],
  },
  {
    classId: 'Aqua', name: 'Maré', color: '#4c8fb0',
    cards: [
      { id:'respingo', name:'Respingo', range:'short', role:'attack', cost:1, dmg:8, effect:'none',
        desc:'Curto alcance. Barato e direto, sem efeito extra.' },
      { id:'mare', name:'Maré Alta', range:'long', role:'attack', cost:2, dmg:9, effect:'bleed',
        desc:'Longo alcance. Aplica Sangramento: dano ao longo de 2 rodadas.' },
    ],
  },
  {
    classId: 'Plant', name: 'Broto', color: '#3f6b4a',
    cards: [
      { id:'raiz', name:'Raiz', range:'short', role:'attack', cost:1, dmg:10, effect:'retain',
        desc:'Curto alcance. Retain: nunca sai da sua mão, acerte ou erre.' },
      { id:'brotamento', name:'Brotamento', range:'own', role:'heal', cost:2, heal:20, effect:'none',
        desc:'Cura 20 de HP da própria linha.' },
    ],
  },
  {
    classId: 'Bird', name: 'Pluma', color: '#d9b44a',
    cards: [
      { id:'mergulho', name:'Mergulho', range:'short', role:'attack', cost:2, dmg:18, effect:'none',
        desc:'Curto alcance. Um golpe único e forte.' },
      { id:'pena', name:'Pena', range:'long', role:'attack', cost:1, dmg:6, effect:'multi',
        desc:'Longo alcance. 3 projéteis: +50% de dano bônus se 2+ acertarem.' },
    ],
  },
  {
    classId: 'Bug', name:'Larva', color: '#7a5c9e',
    cards: [
      { id:'picada', name:'Picada', range:'short', role:'attack', cost:1, dmg:7, effect:'none',
        desc:'Curto alcance. Barata e direta.' },
      { id:'veneno', name:'Veneno', range:'long', role:'attack', cost:2, dmg:9, effect:'deathmark',
        desc:'Longo alcance. Aplica Marca da Morte: próximo golpe recebido tem +10 de dano puro.' },
    ],
  },
  {
    classId: 'Reptile', name:'Casco', color: '#8a8f5c',
    cards: [
      { id:'casca', name:'Casca', range:'own', role:'defense', cost:1, effect:'shield',
        desc:'Bloqueia 50% do próximo dano da própria linha.' },
      { id:'escudo', name:'Escudo', range:'own', role:'defense', cost:2, effect:'shield_cleanse',
        desc:'Bloqueia 50% do próximo dano e remove 1 status negativo da própria linha.' },
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
