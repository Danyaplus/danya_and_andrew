import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMultiplayerGame } from '../../lib/useMultiplayerGame.js';

const TANKS = [
  { id: 'standard', name: 'Стандарт', icon: '🟢', text: 'Сбалансированный. Способность: авиаудар.' },
  { id: 'twin', name: 'Двухствольный', icon: '🟣', text: 'Два ствола. Способность: мина-турель.' },
  { id: 'fire', name: 'Огненный', icon: '🔥', text: 'Поджигает землю. Способность: огненный шар.' },
  { id: 'frost', name: 'Зимний', icon: '❄️', text: 'Замедляет врага. Способность: ледяная бомба.' },
  { id: 'heavy', name: 'Тяжёлый', icon: '🛡️', text: 'Больше брони. Способность: сейсмо-заряд.' },
];

const WEAPONS = {
  shell: { name: 'Обычный', icon: '●', tint: '#ffd54a' },
  heavy: { name: 'Тяжёлый', icon: '◆', tint: '#ff7849' },
  cluster: { name: 'Кластер', icon: '✦', tint: '#ffbb33' },
  drill: { name: 'Бур', icon: '▼', tint: '#8ee8ff' },
  bouncer: { name: 'Рикошет', icon: '↗', tint: '#d59bff' },
  nuke: { name: 'Ядерный', icon: '☢', tint: '#b9ff4a' },
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

export default function ArtilleryDuelGame() {
  const { waiting, state, error, findMatch, cancelSearch, sendAction } = useMultiplayerGame('artillery-duel');
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [angle, setAngle] = useState(45);
  const [power, setPower] = useState(68);
  const [weapon, setWeapon] = useState('shell');
  const [anim, setAnim] = useState({ startedAt: 0, shotId: null });
  const [size, setSize] = useState({ w: 1000, h: 560 });

  const you = state?.you ?? null;
  const me = you == null ? null : state?.players?.[you];
  const canAct = Boolean(state && state.phase === 'battle' && state.turn === you && !state.winner);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.max(320, Math.floor(entry.contentRect.width));
      setSize({ w, h: Math.round(w * 0.56) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (state?.lastShot?.id && state.lastShot.id !== anim.shotId) {
      setAnim({ shotId: state.lastShot.id, startedAt: performance.now() });
    }
  }, [state?.lastShot?.id]);

  useEffect(() => {
    let raf = 0;
    const draw = (now) => {
      const c = canvasRef.current;
      if (!c || !state) { raf = requestAnimationFrame(draw); return; }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.floor(size.w * dpr);
      c.height = Math.floor(size.h * dpr);
      c.style.width = `${size.w}px`;
      c.style.height = `${size.h}px`;
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx, state, size.w, size.h, anim, now);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [state, size, anim]);

  useEffect(() => {
    if (me?.ammo && !me.ammo[weapon]) {
      const next = Object.keys(me.ammo).find(k => me.ammo[k] > 0 && k !== 'nuke');
      if (next) setWeapon(next);
    }
  }, [me?.ammo, weapon]);

  const availableWeapons = useMemo(() => {
    if (!me) return [];
    return Object.entries(WEAPONS).filter(([id]) => (me.ammo?.[id] || 0) > 0);
  }, [me]);

  if (!state && !waiting) {
    return <div className="art-shell"><div className="art-lobby"><h2>💥 Tank Artillery</h2><p>Пошаговая танковая дуэль с физикой снарядов, разрушаемой землёй и ящиками.</p><button className="art-main-btn" onClick={findMatch}>Найти соперника</button>{error && <div className="art-error">{error}</div>}</div></div>;
  }

  if (waiting && !state) {
    return <div className="art-shell"><div className="art-lobby"><div className="art-loader"/><h2>Ищем соперника…</h2><button className="art-ghost-btn" onClick={cancelSearch}>Отмена</button></div></div>;
  }

  if (!state) return null;

  if (state.phase === 'select') {
    return <div className="art-shell"><div className="art-select"><div><div className="art-kicker">ВЫБОР МАШИНЫ</div><h2>Выбери свой танк</h2><p>После выбора дождись соперника. У каждого класса своя спецспособность.</p></div><div className="art-tank-grid">{TANKS.map(t => <button key={t.id} className={`art-tank-card ${me?.tankType === t.id ? 'selected' : ''}`} onClick={() => sendAction({ type: 'selectTank', payload: { tankType: t.id } })}><span className="art-tank-icon">{t.icon}</span><strong>{t.name}</strong><small>{t.text}</small></button>)}</div><div className="art-ready">{state.players.map((p, i) => <span key={i} className={p.ready ? 'ok' : ''}>{i === you ? 'Ты' : 'Соперник'}: {p.ready ? 'готов' : 'выбирает…'}</span>)}</div></div></div>;
  }

  const status = state.winner != null ? (state.winner === you ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ') : canAct ? 'ТВОЙ ХОД' : 'ХОД СОПЕРНИКА';

  return <div className="art-shell">
    <div className="art-topbar">
      <PlayerBar p={state.players[0]} active={state.turn === 0} left />
      <div className={`art-turn-pill ${canAct ? 'mine' : ''}`}>{status}<small>Ход {state.turnNumber}</small></div>
      <PlayerBar p={state.players[1]} active={state.turn === 1} />
    </div>

    <div className="art-canvas-wrap" ref={wrapRef}><canvas ref={canvasRef} /></div>

    <div className="art-controls">
      <div className="art-weapons">
        {availableWeapons.map(([id, info]) => <button key={id} disabled={!canAct} className={`art-weapon ${weapon === id ? 'active' : ''}`} onClick={() => setWeapon(id)}><span style={{ color: info.tint }}>{info.icon}</span><b>{info.name}</b><small>×{me?.ammo?.[id] || 0}</small></button>)}
        {me?.specialReady && <button className="art-weapon special" disabled={!canAct} onClick={() => sendAction({ type: 'special', payload: { angle, power } })}><span>★</span><b>Способность</b><small>готова</small></button>}
      </div>

      <div className="art-drive-panel">
        <button disabled={!canAct || me.fuel <= 0} onPointerDown={() => sendAction({ type: 'move', payload: { direction: -1 } })}>◀</button>
        <div><b>ТОПЛИВО {Math.round(me.fuel)}</b><div className="art-meter"><i style={{ width: `${clamp(me.fuel,0,100)}%` }}/></div></div>
        <button disabled={!canAct || me.fuel <= 0} onPointerDown={() => sendAction({ type: 'move', payload: { direction: 1 } })}>▶</button>
      </div>

      <label>Угол <strong>{angle}°</strong><input disabled={!canAct} type="range" min="10" max="170" value={angle} onChange={e => setAngle(+e.target.value)} /></label>
      <label>Сила <strong>{power}%</strong><input disabled={!canAct} type="range" min="20" max="100" value={power} onChange={e => setPower(+e.target.value)} /></label>
      <button className="art-fire-btn" disabled={!canAct || !(me?.ammo?.[weapon] > 0)} onClick={() => sendAction({ type: 'fire', payload: { angle, power, weapon } })}>ОГОНЬ</button>
    </div>

    {state.message && <div className="art-toast">{state.message}</div>}
    {state.winner != null && <div className="art-end"><div className="art-end-card"><div className="art-rip">🪦</div><h2>{state.winner === you ? 'Ты победил!' : 'Твой танк уничтожен'}</h2><p>На месте погибшего танка остался RIP-камень.</p><button className="art-main-btn" onClick={findMatch}>Новая битва</button></div></div>}
  </div>;
}

function PlayerBar({ p, active, left }) {
  const hp = clamp(p?.hp ?? 0, 0, p?.maxHp ?? 100);
  const max = p?.maxHp || 100;
  return <div className={`art-player ${active ? 'active' : ''} ${left ? 'left' : ''}`}><div className="art-avatar">{p?.tankType === 'fire' ? '🔥' : p?.tankType === 'frost' ? '❄️' : p?.tankType === 'twin' ? '🟣' : p?.tankType === 'heavy' ? '🛡️' : '🟢'}</div><div className="art-player-info"><div><b>{left ? 'PLAYER 1' : 'PLAYER 2'}</b><span>{Math.ceil(hp)} HP</span></div><div className="art-hp"><i style={{ width: `${hp / max * 100}%` }}/></div></div></div>;
}

function terrainY(state, x, w, h) {
  const terrain = state.terrain || [];
  if (!terrain.length) return h * .75;
  const nx = clamp(x / w, 0, .9999);
  const f = nx * (terrain.length - 1);
  const i = Math.floor(f), t = f - i;
  const v = lerp(terrain[i], terrain[Math.min(i + 1, terrain.length - 1)], t);
  return v * h;
}

function worldToScreen(x, y, w, h) { return [x * w, y * h]; }

function paint(ctx, s, w, h, anim, now) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#071a59'); sky.addColorStop(.55, '#0c3974'); sky.addColorStop(1, '#09152f');
  ctx.fillStyle = sky; ctx.fillRect(0,0,w,h);

  // moon, stars, city
  ctx.globalAlpha = .8; ctx.fillStyle='#2ec7f0'; ctx.beginPath(); ctx.arc(w*.52,h*.13,w*.03,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
  ctx.fillStyle='#1460a0';
  for(let i=0;i<18;i++){const bw=w*(.03+(i%4)*.006); const bh=h*(.08+((i*37)%9)*.018); const x=i*w/17-bw/2; ctx.fillRect(x,h*.58-bh,bw,bh);}

  // terrain
  ctx.beginPath(); ctx.moveTo(0,h);
  const steps = Math.max(120, s.terrain?.length || 120);
  for(let i=0;i<steps;i++){const x=i/(steps-1)*w; ctx.lineTo(x,terrainY(s,x,w,h));}
  ctx.lineTo(w,h); ctx.closePath();
  const ground=ctx.createLinearGradient(0,h*.5,0,h); ground.addColorStop(0,'#d65d36');ground.addColorStop(1,'#8f332d');ctx.fillStyle=ground;ctx.fill();
  ctx.strokeStyle='#f57a3a';ctx.lineWidth=3;ctx.stroke();

  // burn / frost zones
  for(const z of s.zones||[]){const [x] = worldToScreen(z.x,0,w,h); const y=terrainY(s,x,w,h); const r=z.radius*w; const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,z.type==='fire'?'rgba(255,105,0,.9)':'rgba(145,230,255,.9)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}

  // crates
  for(const c of s.crates||[]){if(c.collected)continue; const [x,yy]=worldToScreen(c.x,c.y,w,h); const y=Math.min(yy,terrainY(s,x,w,h)-18); ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(now/250+c.x*20)*.03);ctx.fillStyle='#d28f30';ctx.fillRect(-14,-14,28,28);ctx.strokeStyle='#ffe091';ctx.lineWidth=3;ctx.strokeRect(-14,-14,28,28);ctx.fillStyle='#2f1b0a';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillText('?',0,7);ctx.restore();}

  // cows
  for(const cow of s.cows||[]){if(!cow.alive) continue; const x=cow.x*w; const y=terrainY(s,x,w,h)-10;ctx.save();ctx.translate(x,y);ctx.font=`${Math.max(18,w*.022)}px serif`;ctx.textAlign='center';ctx.fillText('🐄',0,0);ctx.restore();}

  // turrets
  for(const t of s.turrets||[]){const x=t.x*w;const y=terrainY(s,x,w,h)-70;ctx.fillStyle='#9fe8ff';ctx.fillRect(x-10,y-8,20,12);ctx.strokeStyle='#cff7ff';ctx.beginPath();ctx.moveTo(x,y+4);ctx.lineTo(x,y+45);ctx.stroke();ctx.fillStyle='#64b5f6';ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.fill();}

  // tanks and RIP
  (s.players||[]).forEach((p,i)=>{const x=p.x*w; const y=terrainY(s,x,w,h); if(p.dead){ctx.font=`${Math.max(24,w*.034)}px serif`;ctx.textAlign='center';ctx.fillText('🪦',x,y-8);ctx.fillStyle='#d7e2ef';ctx.font=`bold ${Math.max(9,w*.012)}px sans-serif`;ctx.fillText('RIP',x,y-25);return;} drawTank(ctx,p,x,y,i,w);});

  // projectile animation
  const shot=s.lastShot;
  if(shot?.path?.length && shot.id===anim.shotId){const elapsed=Math.max(0,now-anim.startedAt);const duration=Math.max(420,shot.path.length*18);const t=clamp(elapsed/duration,0,1);const idx=Math.min(shot.path.length-1,Math.floor(t*(shot.path.length-1)));ctx.strokeStyle=shot.color||'#ffd54a';ctx.lineWidth=3;ctx.beginPath();for(let j=0;j<=idx;j++){const [px,py]=worldToScreen(shot.path[j].x,shot.path[j].y,w,h);j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();const pt=shot.path[idx];const [px,py]=worldToScreen(pt.x,pt.y,w,h);ctx.shadowColor=shot.color||'#ffd54a';ctx.shadowBlur=18;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;if(t>.9){const ex=shot.impact.x*w,ey=shot.impact.y*h; const rr=(shot.radius||.04)*w*(.4+(t-.9)*6);ctx.fillStyle=`rgba(255,190,40,${1-t})`;ctx.beginPath();ctx.arc(ex,ey,rr,0,Math.PI*2);ctx.fill();}}
}

function drawTank(ctx,p,x,y,i,w){ctx.save();ctx.translate(x,y-12);const dir=i===0?1:-1;const body=p.tankType==='fire'?'#ff5538':p.tankType==='frost'?'#7ad9ff':p.tankType==='twin'?'#a66cff':p.tankType==='heavy'?'#6e7c89':i===0?'#87d829':'#ff9638';ctx.fillStyle='#1f242a';ctx.fillRect(-20,-4,40,12);ctx.fillStyle=body;ctx.beginPath();ctx.roundRect(-17,-17,34,17,5);ctx.fill();ctx.fillStyle='#24313c';ctx.beginPath();ctx.arc(0,-18,9,0,Math.PI*2);ctx.fill();ctx.strokeStyle=body;ctx.lineWidth=5;const a=(p.aimAngle??45)*Math.PI/180;const local=i===0?Math.PI*2-a:Math.PI+a;ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(Math.cos(local)*28,-18+Math.sin(local)*28);ctx.stroke();if(p.tankType==='twin'){ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(Math.cos(local)*28,-14+Math.sin(local)*28);ctx.stroke();}ctx.restore();}
