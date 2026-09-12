// Canvas rendering: arena, Axie sprites, projectiles, aim trajectory preview,
// and "juice" (floating damage numbers, impact particles, screen shake).
import { GRAVITY } from './physics.js';

let particles = [];
let floatingTexts = [];
let shakeTime = 0;
let shakeMag = 0;

export function resetEffects(){
  particles = [];
  floatingTexts = [];
  shakeTime = 0;
  shakeMag = 0;
}

export function spawnFloatingText(x,y,text,color,size){
  floatingTexts.push({x,y,text,color,size:size||16,life:1,vy:-42});
}

export function spawnParticles(x,y,color,count){
  for (let i=0;i<(count||10);i++){
    const ang = Math.random()*Math.PI*2;
    const speed = 60+Math.random()*160;
    particles.push({ x,y, vx:Math.cos(ang)*speed, vy:Math.sin(ang)*speed, life:1, color, size:2+Math.random()*3 });
  }
}

export function triggerShake(amount, duration){
  shakeMag = Math.max(shakeMag, amount);
  shakeTime = Math.max(shakeTime, duration);
}

export function updateEffects(dt){
  for (const pt of particles){
    pt.x += pt.vx*dt; pt.y += pt.vy*dt; pt.vy += 500*dt; pt.life -= dt*1.6;
  }
  particles = particles.filter(pt => pt.life > 0);

  for (const ft of floatingTexts){
    ft.y += ft.vy*dt; ft.life -= dt*1.1;
  }
  floatingTexts = floatingTexts.filter(ft => ft.life > 0);

  if (shakeTime > 0){
    shakeTime -= dt;
    if (shakeTime <= 0){ shakeTime = 0; shakeMag = 0; }
  }
}

function drawAxieSprite(ctx, pos, isYou){
  // Placeholder blob sprite (canvas-drawn, no external image) -- swap for a
  // real Three.js Axie Mixer render or sprite sheet later.
  ctx.save();
  const topColor = isYou ? '#e39a5f' : '#7bb9d6';
  const baseColor = isYou ? '#c97b3d' : '#4c8fb0';
  const outline = isYou ? '#8a5222' : '#2e5f78';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y-4, 34, 0, Math.PI*2);
  const grad = ctx.createRadialGradient(pos.x-10,pos.y-16,4,pos.x,pos.y-4,36);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, baseColor);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3;
  ctx.stroke();
  // simple face
  ctx.fillStyle = '#1c1710';
  ctx.beginPath(); ctx.arc(pos.x-9,pos.y-8,3,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(pos.x+9,pos.y-8,3,0,Math.PI*2); ctx.fill();
  // tiny horns to read as "axie-like"
  ctx.strokeStyle = outline;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(pos.x-14,pos.y-30); ctx.lineTo(pos.x-20,pos.y-44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pos.x+14,pos.y-30); ctx.lineTo(pos.x+20,pos.y-44); ctx.stroke();
  ctx.restore();
}

function drawTrajectoryPreview(ctx, youPos, dragCurrent, dragStart, groundY, maxDrag, powerScale){
  let dx = dragStart.x - dragCurrent.x;
  let dy = dragStart.y - dragCurrent.y;
  let dist = Math.hypot(dx,dy);
  dist = Math.min(dist, maxDrag);
  const angle = Math.atan2(dy,dx);
  const power = dist * powerScale;
  const vx = -Math.cos(angle)*power;
  const vy = -Math.sin(angle)*power;
  ctx.setLineDash([6,6]);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let sx=youPos.x, sy=youPos.y, svx=vx, svy=vy;
  ctx.moveTo(sx,sy);
  for (let t=0;t<1.2;t+=0.05){
    svy += GRAVITY*0.05; sx += svx*0.05; sy += svy*0.05;
    if (sy>groundY) break;
    ctx.lineTo(sx,sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#c97b3d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(youPos.x,youPos.y);
  ctx.lineTo(dragCurrent.x, dragCurrent.y);
  ctx.stroke();
}

export function draw(ctx, canvas, state, positions, groundY, drag){
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.save();
  if (shakeTime > 0){
    const dx = (Math.random()-0.5)*shakeMag;
    const dy = (Math.random()-0.5)*shakeMag;
    ctx.translate(dx, dy);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, groundY, W, H-groundY);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.moveTo(0,groundY); ctx.lineTo(W,groundY); ctx.stroke();

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(positions.you.x, groundY, 30,7,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(positions.rival.x, groundY, 30,7,0,0,Math.PI*2); ctx.fill();

  drawAxieSprite(ctx, positions.you, true);
  drawAxieSprite(ctx, positions.rival, false);

  if (drag && drag.dragging && drag.dragStart && drag.dragCurrent){
    drawTrajectoryPreview(ctx, positions.you, drag.dragCurrent, drag.dragStart, groundY, drag.maxDrag, drag.powerScale);
  }

  for (const p of state.projectiles){
    ctx.save();
    p.trail.forEach((t,i)=>{
      ctx.globalAlpha = (i/p.trail.length)*0.35;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(t.x,t.y,5,0,Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,7,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  for (const pt of particles){
    ctx.save();
    ctx.globalAlpha = Math.max(0, pt.life);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  for (const ft of floatingTexts){
    ctx.save();
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.font = `800 ${ft.size}px 'Baloo 2', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = ft.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  ctx.restore();
}
