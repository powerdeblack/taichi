// Slingshot-style projectile motion: gravity arc, spread for multi-hit cards, hit detection.
export const GRAVITY = 1500;
export const HIT_RADIUS = 34;

export function canvasPoint(canvas, evt){
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

// Spawns one projectile per pellet in the card's spread (e.g. Pena's 3-way fan),
// staggered slightly so they read as separate shots instead of a single blob.
export function fireProjectile(state, origin, baseVx, baseVy, card, from){
  const spread = card.effect === 'multi' ? [-0.14, 0, 0.14] : [0];
  spread.forEach((offset, i) => {
    setTimeout(() => {
      state.projectiles.push({
        x: origin.x, y: origin.y,
        vx: baseVx, vy: baseVy + offset*260,
        color: card.color, from, card, alive:true, trail:[], id: Math.random()
      });
    }, i*70);
  });
}

// Advances all live projectiles by dt, resolves ground/edge death, and calls
// onHit(projectile, targetSide) the instant one lands within HIT_RADIUS of its target.
export function updateProjectiles(state, dt, positions, canvasWidth, groundY, onHit){
  for (const p of state.projectiles){
    if (!p.alive) continue;
    p.trail.push({x:p.x,y:p.y});
    if (p.trail.length>14) p.trail.shift();
    p.vy += GRAVITY*dt;
    p.x += p.vx*dt;
    p.y += p.vy*dt;

    const targetPos = p.from==='you' ? positions.rival : positions.you;
    const targetSide = p.from==='you' ? 'rival' : 'you';
    const distToTarget = Math.hypot(p.x-targetPos.x, p.y-(targetPos.y-10));

    if (distToTarget < HIT_RADIUS && p.alive){
      p.alive = false;
      onHit(p, targetSide);
    }
    if (p.y > groundY+20 || p.x < -30 || p.x > canvasWidth+30){
      p.alive = false;
    }
  }
  state.projectiles = state.projectiles.filter(p=>p.alive || p.trail.length>0);
}
