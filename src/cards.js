// Card pool adapted from the Axie Origin core: energy cost, class, status effect.
// 12 cards total, 2 per class, so deck-building means real trade-offs.
export const POOL = [
  { id:'horn',      name:'Investida',        cls:'Beast',   cost:1, dmg:14, color:'#c97b3d', type:'attack',  effect:'ambush',
    desc:'Reto e veloz. Ambush: dobra de dano no 1º acerto da partida.' },
  { id:'horn2',     name:'Investida Pesada', cls:'Beast',   cost:2, dmg:22, color:'#c97b3d', type:'attack',  effect:'none',
    desc:'Mais lento, mas um golpe bem mais forte. Sem efeito extra.' },
  { id:'tail',      name:'Maré',             cls:'Aqua',    cost:2, dmg:8,  color:'#4c8fb0', type:'attack',  effect:'bleed',
    desc:'Arco longo. Aplica Sangramento: dano ao longo de 2 rodadas.' },
  { id:'tail_alt',  name:'Respingo',         cls:'Aqua',    cost:1, dmg:6,  color:'#4c8fb0', type:'attack',  effect:'none',
    desc:'Barato e rápido de reciclar. Dano baixo, sem efeito.' },
  { id:'mouth',     name:'Raiz',             cls:'Plant',   cost:1, dmg:10, color:'#3f6b4a', type:'attack',  effect:'retain',
    desc:'Curto alcance. Retain: nunca sai da sua mão, acerte ou erre.' },
  { id:'mouth_alt', name:'Espinho',          cls:'Plant',   cost:2, dmg:16, color:'#3f6b4a', type:'attack',  effect:'none',
    desc:'Mais dano que a Raiz, mas some da mão como as outras cartas.' },
  { id:'back',      name:'Pena',             cls:'Bird',    cost:1, dmg:6,  color:'#d9b44a', type:'attack',  effect:'multi',
    desc:'3 projéteis em leque. +50% de dano bônus se 2+ acertarem.' },
  { id:'back_alt',  name:'Mergulho',         cls:'Bird',    cost:2, dmg:18, color:'#d9b44a', type:'attack',  effect:'none',
    desc:'Um golpe único e forte, sem dividir em vários projéteis.' },
  { id:'sting',     name:'Veneno',           cls:'Bug',     cost:2, dmg:9,  color:'#7a5c9e', type:'attack',  effect:'deathmark',
    desc:'Lento. Aplica Marca da Morte: próximo golpe recebido tem +10 de dano puro.' },
  { id:'sting_alt', name:'Picada',           cls:'Bug',     cost:1, dmg:7,  color:'#7a5c9e', type:'attack',  effect:'none',
    desc:'Barata e direta. Sem efeito de status.' },
  { id:'shell',     name:'Escudo',           cls:'Reptile', cost:2, dmg:0,  color:'#8a8f5c', type:'defense', effect:'shield_cleanse',
    desc:'Não ataca. Bloqueia 50% do próximo dano e remove 1 status negativo seu.' },
  { id:'shell_alt', name:'Casca',            cls:'Reptile', cost:1, dmg:0,  color:'#8a8f5c', type:'defense', effect:'shield',
    desc:'Defesa mais barata: bloqueia 50% do próximo dano, sem remover status.' },
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
