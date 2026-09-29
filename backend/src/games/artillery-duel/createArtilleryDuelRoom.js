const TICK_MS = 40;
const TERRAIN_N = 220;
const WORLD_H = 1;
const GRAVITY = 0.72;

const WEAPONS = {
  shell:   { ammo: 7, damage: 24, radius: .055, speed: .48, crater: .048, color: '#ffd54a' },
  heavy:   { ammo: 3, damage: 38, radius: .070, speed: .42, crater: .070, color: '#ff7849' },
  cluster: { ammo: 2, damage: 14, radius: .036, speed: .46, crater: .032, color: '#ffbb33', cluster: true },
  drill:   { ammo: 2, damage: 26, radius: .035, speed: .56, crater: .085, color: '#8ee8ff', drill: true },
  bouncer: { ammo: 2, damage: 29, radius: .050, speed: .50, crater: .045, color: '#d59bff', bounce: true },
  nuke:    { ammo: 0, damage: 62, radius: .125, speed: .38, crater: .125, color: '#b9ff4a', nuke: true },
};

const TANKS = {
  standard: { maxHp: 100, special: 'airstrike' },
  twin:     { maxHp: 94, special: 'turretMine' },
  fire:     { maxHp: 92, special: 'fireball' },
  frost:    { maxHp: 96, special: 'iceBomb' },
  heavy:    { maxHp: 118, special: 'quake' },
};

const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand = (a,b)=>a+Math.random()*(b-a);

function normalizeArgs(args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && args[0].io) {
    const x = args[0];
    return { io:x.io, roomId:x.roomId || x.id, playerSocketIds:x.playerSocketIds || x.players || [] };
  }
  return { io:args[0], roomId:args[1], playerSocketIds:args[2] || [] };
}
function socketIdOf(v){ return typeof v === 'string' ? v : v?.id; }

export function createArtilleryDuelRoom(...rawArgs) {
  const { io, roomId, playerSocketIds: rawPlayers } = normalizeArgs(rawArgs);
  const playerSocketIds = rawPlayers.map(socketIdOf).filter(Boolean).slice(0,2);
  if (!io || !roomId || playerSocketIds.length < 2) throw new Error('artillery-duel: io, roomId and two players are required');

  let timer = null;
  let destroyed = false;
  let shotCounter = 0;
  const state = makeInitialState();

  function makeInitialState(){
    const terrain = makeTerrain();
    return {
      phase:'select', turn:0, turnNumber:1, actionCount:0, terrain,
      players:[makePlayer(.11), makePlayer(.89)],
      crates:[], cows:makeCows(terrain), zones:[], turrets:[],
      winner:null, message:'Выберите танк', lastShot:null,
    };
  }

  function makePlayer(x){ return { x, hp:100, maxHp:100, tankType:null, ready:false, fuel:100, aimAngle:45, ammo:baseAmmo(), specialReady:true, dead:false, frozenTurns:0 }; }
  function baseAmmo(){ return Object.fromEntries(Object.entries(WEAPONS).map(([k,v])=>[k,v.ammo])); }

  function makeTerrain(){
    const out=[];
    const p1=rand(0,Math.PI*2),p2=rand(0,Math.PI*2),p3=rand(0,Math.PI*2);
    for(let i=0;i<TERRAIN_N;i++){const x=i/(TERRAIN_N-1); let y=.68 + Math.sin(x*7+p1)*.065 + Math.sin(x*15+p2)*.034 + Math.sin(x*28+p3)*.017; y += Math.exp(-Math.pow((x-.5)/.13,2))*.045; out.push(clamp(y,.53,.82));}
    smooth(out,3); return out;
  }
  function smooth(a,rounds=1){for(let r=0;r<rounds;r++){const b=[...a];for(let i=1;i<a.length-1;i++)a[i]=(b[i-1]+b[i]*2+b[i+1])/4;}}
  function groundY(x){const f=clamp(x,0,.9999)*(state.terrain.length-1),i=Math.floor(f),t=f-i;return state.terrain[i]*(1-t)+state.terrain[Math.min(i+1,state.terrain.length-1)]*t;}
  function makeCows(){ return [0.27,0.49,0.7].map((x,i)=>({id:`cow-${i}`,x:x+rand(-.025,.025),alive:true})); }

  function viewFor(i){ return { ...state, you:i, players:state.players.map(p=>({...p,ammo:{...p.ammo}})), terrain:[...state.terrain], crates:state.crates.map(c=>({...c})), cows:state.cows.map(c=>({...c})), zones:state.zones.map(z=>({...z})), turrets:state.turrets.map(t=>({...t})) }; }
  function emitState(){ playerSocketIds.forEach((id,i)=>io.to(id).emit('game:state', viewFor(i))); }
  function error(id,msg){ io.to(id).emit('game:error', msg); }
  function idxOf(id){ return playerSocketIds.indexOf(id); }

  function handleAction(socketId, action){
    if (destroyed || state.winner != null) return;
    const i=idxOf(socketId); if(i<0) return;
    const type=action?.type, p=state.players[i];

    if(state.phase==='select'){
      if(type!=='selectTank') return;
      const tankType=action.payload?.tankType;
      if(!TANKS[tankType]) return error(socketId,'Неизвестный танк');
      p.tankType=tankType; p.ready=true; p.maxHp=TANKS[tankType].maxHp; p.hp=p.maxHp;
      if(state.players.every(x=>x.ready)){state.phase='battle';state.message='Битва началась!';state.turn=Math.random()<.5?0:1;prepareTurn(state.turn);}
      emitState(); return;
    }

    if(i!==state.turn) return error(socketId,'Сейчас ход соперника');
    if(type==='move') return move(i, action.payload?.direction);
    if(type==='fire') return fire(i, action.payload||{});
    if(type==='special') return special(i, action.payload||{});
  }

  function prepareTurn(i){
    const p=state.players[i];
    p.fuel = p.frozenTurns>0 ? 48 : 100;
    if(p.frozenTurns>0) p.frozenTurns--;
    settlePlayer(i);
    state.zones = state.zones.map(z=>({...z,turns:z.turns-1})).filter(z=>z.turns>0);
    state.turrets = state.turrets.map(t=>({...t,shots:t.shots-1})).filter(t=>t.shots>0);
    if(allStandardAmmoEmpty(p)) emergencyRefill(i);
  }

  function allStandardAmmoEmpty(p){return ['shell','heavy','cluster','drill','bouncer'].every(k=>(p.ammo[k]||0)<=0);}
  function emergencyRefill(i){const p=state.players[i];const fresh=baseAmmo(); for(const k of ['shell','heavy','cluster','drill','bouncer']) p.ammo[k]=fresh[k]; state.crates.push({id:`em-${Date.now()}`,x:p.x,y:Math.max(.05,groundY(p.x)-.30),falling:false,collected:true,emergency:true});state.message='Аварийный ящик восстановил обычные снаряды';}

  function move(i,dir){
    dir=Math.sign(Number(dir)||0); if(!dir) return;
    const p=state.players[i]; if(p.fuel<=0)return;
    const step=.012, nx=clamp(p.x+step*dir,.035,.965); const slope=Math.abs(groundY(nx)-groundY(p.x))/step;
    if(slope>1.35) return error(playerSocketIds[i],'Склон слишком крутой');
    const cost=7+slope*9; if(p.fuel<cost)return;
    p.x=nx;p.fuel=clamp(p.fuel-cost,0,100);collectCrates(i);applyGroundHazards(i);emitState();
  }

  function collectCrates(i){
    const p=state.players[i];
    for(const c of state.crates){if(c.collected)continue;if(Math.abs(c.x-p.x)<.035){c.collected=true;p.ammo.nuke=(p.ammo.nuke||0)+1;state.message='Подобран редкий ящик: +1 ядерный удар ☢';}}
  }
  function applyGroundHazards(i){
    const p=state.players[i]; for(const z of state.zones){if(Math.abs(z.x-p.x)<z.radius){if(z.type==='fire')p.hp-=5;if(z.type==='frost')p.frozenTurns=Math.max(p.frozenTurns,1);}}
    checkDeath(i);
  }

  function fire(i,{angle=45,power=60,weapon='shell'}){
    const p=state.players[i]; if(!WEAPONS[weapon] || (p.ammo[weapon]||0)<=0)return error(playerSocketIds[i],'Этот снаряд закончился');
    angle=clamp(+angle||45,10,170);power=clamp(+power||60,20,100);p.aimAngle=angle;p.ammo[weapon]--; const cfg=WEAPONS[weapon];
    const impacts = cfg.cluster ? clusterShot(i,angle,power,cfg) : [simulate(i,angle,power,cfg)];
    state.lastShot={id:`shot-${++shotCounter}-${Date.now()}`,path:impacts[0].path,impact:impacts[0].impact,radius:cfg.radius,color:cfg.color,weapon};
    for(const result of impacts) explode(result.impact.x,result.impact.y,cfg,i,weapon);
    finishAttack(i);
  }

  function simulate(i,angle,power,cfg,angleOffset=0,powerMul=1){
    const p=state.players[i], dir=i===0?1:-1; const a=(angle+angleOffset)*Math.PI/180; let x=p.x+dir*.025; let y=groundY(p.x)-.035; const v=cfg.speed*(power/100)*powerMul; let vx=Math.cos(a)*v*dir, vy=-Math.sin(a)*v; const path=[]; let bounced=false;
    for(let k=0;k<260;k++){path.push({x,y});x+=vx*TICK_MS/1000;y+=vy*TICK_MS/1000;vy+=GRAVITY*TICK_MS/1000;if(x<=.005||x>=.995){if(cfg.bounce&&!bounced){vx*=-.78;bounced=true;x=clamp(x,.006,.994);}else break;} if(y>groundY(x)){if(cfg.bounce&&!bounced){y=groundY(x)-.006;vy=-Math.abs(vy)*.62;vx*=.78;bounced=true;continue;}break;}if(y>1.05)break;}
    return {path,impact:{x:clamp(x,.005,.995),y:clamp(Math.min(y,groundY(x)),0,WORLD_H)}};
  }

  function clusterShot(i,a,p,cfg){return [-8,0,8].map((off,j)=>simulate(i,a,p,cfg,off,1-j*.04));}

  function explode(x,y,cfg,owner,weapon){
    crater(x,cfg.crater);
    state.players.forEach((p,idx)=>{if(p.dead)return; const dx=Math.abs(p.x-x),dy=Math.abs((groundY(p.x)-.02)-y); const d=Math.hypot(dx,dy*.7); if(d<cfg.radius*1.6){const fall=1-clamp(d/(cfg.radius*1.6),0,1);let dmg=cfg.damage*fall;if(idx===owner)dmg*=.65;if(p.tankType==='heavy')dmg*=.84;p.hp-=dmg;checkDeath(idx);}});
    for(const cow of state.cows){if(cow.alive&&Math.abs(cow.x-x)<cfg.radius*1.3){cow.alive=false;crater(cow.x,.035);state.message='Корова попала под взрыв 💥🐄';}}
    if(weapon==='nuke') state.message='ЯДЕРНЫЙ УДАР ☢';
    settleAll();
  }

  function crater(x,r){
    for(let i=0;i<state.terrain.length;i++){const tx=i/(state.terrain.length-1),d=Math.abs(tx-x);if(d<r){const q=1-d/r;state.terrain[i]=clamp(state.terrain[i]+q*q*r*.62,.45,.94);}}
    smooth(state.terrain,1);
  }
  function settlePlayer(i){state.players[i].x=clamp(state.players[i].x,.02,.98);}
  function settleAll(){state.players.forEach((_,i)=>settlePlayer(i));}

  function special(i,{angle=45,power=65}){
    const p=state.players[i]; if(!p.specialReady)return error(playerSocketIds[i],'Способность уже использована');p.specialReady=false;
    const kind=TANKS[p.tankType].special;
    if(kind==='airstrike') airstrike(i);
    else if(kind==='turretMine') turretMine(i,angle,power);
    else if(kind==='fireball') fireball(i,angle,power);
    else if(kind==='iceBomb') iceBomb(i,angle,power);
    else quake(i);
    finishAttack(i);
  }

  function airstrike(i){const enemy=state.players[1-i];const x=clamp(enemy.x+rand(-.025,.025),.05,.95);const cfg={damage:44,radius:.075,crater:.07,color:'#fff176'};const path=[];for(let y=.05;y<groundY(x);y+=.025)path.push({x,y});state.lastShot={id:`sp-${++shotCounter}`,path,impact:{x,y:groundY(x)},radius:cfg.radius,color:cfg.color,weapon:'airstrike'};explode(x,groundY(x),cfg,i,'airstrike');state.message='Авиаудар!';}
  function turretMine(i,a,pw){const cfg={...WEAPONS.shell,speed:.43,damage:0,crater:.025,radius:.03,color:'#b68cff'};const r=simulate(i,a,pw,cfg);state.lastShot={id:`sp-${++shotCounter}`,path:r.path,impact:r.impact,radius:.03,color:cfg.color,weapon:'turret'};state.turrets.push({id:`tur-${Date.now()}`,x:r.impact.x,owner:i,shots:3});const enemy=state.players[1-i];if(Math.abs(enemy.x-r.impact.x)<.22){enemy.hp-=24;checkDeath(1-i);}crater(r.impact.x,.025);state.message='Над миной появилась турель и дала очередь!';}
  function fireball(i,a,pw){const cfg={...WEAPONS.heavy,damage:30,radius:.065,crater:.045,color:'#ff4d21',speed:.44};const r=simulate(i,a,pw,cfg);state.lastShot={id:`sp-${++shotCounter}`,path:r.path,impact:r.impact,radius:cfg.radius,color:cfg.color,weapon:'fireball'};explode(r.impact.x,r.impact.y,cfg,i,'fireball');state.zones.push({type:'fire',x:r.impact.x,radius:.07,turns:3});state.message='Земля горит ещё 3 хода';}
  function iceBomb(i,a,pw){const cfg={...WEAPONS.shell,damage:22,radius:.07,crater:.025,color:'#8ee8ff',speed:.47};const r=simulate(i,a,pw,cfg);state.lastShot={id:`sp-${++shotCounter}`,path:r.path,impact:r.impact,radius:cfg.radius,color:cfg.color,weapon:'ice'};explode(r.impact.x,r.impact.y,cfg,i,'ice');state.zones.push({type:'frost',x:r.impact.x,radius:.085,turns:3});const e=state.players[1-i];if(Math.abs(e.x-r.impact.x)<.1)e.frozenTurns=Math.max(e.frozenTurns,2);state.message='Ледяной взрыв: топливо врага уменьшено';}
  function quake(i){const p=state.players[i];for(let dx=-.12;dx<=.12;dx+=.018)crater(clamp(p.x+dx,.03,.97),.025);const e=state.players[1-i];if(Math.abs(e.x-p.x)<.24){e.hp-=28;checkDeath(1-i);}state.lastShot={id:`sp-${++shotCounter}`,path:[{x:p.x,y:groundY(p.x)-.02}],impact:{x:p.x,y:groundY(p.x)},radius:.13,color:'#ff9b55',weapon:'quake'};state.message='Сейсмо-заряд расколол землю';}

  function finishAttack(i){
    state.actionCount++;
    if(state.winner!=null){emitState();return;}
    if(state.actionCount%3===0)dropCrate();
    state.turn=1-i; state.turnNumber++; prepareTurn(state.turn); runTurrets(); applyGroundHazards(state.turn); emitState();
  }
  function dropCrate(){let x=rand(.16,.84);for(let tries=0;tries<8;tries++){if(state.crates.every(c=>c.collected||Math.abs(c.x-x)>.08))break;x=rand(.16,.84);}state.crates.push({id:`crate-${Date.now()}`,x,y:Math.max(.05,groundY(x)-.28),falling:false,collected:false});state.message='С неба упал редкий ящик ☢';}
  function runTurrets(){for(const t of state.turrets){const enemy=state.players[1-t.owner];if(!enemy.dead&&Math.abs(enemy.x-t.x)<.22){enemy.hp-=7;checkDeath(1-t.owner);}}}
  function checkDeath(i){const p=state.players[i];if(p.hp<=0&&!p.dead){p.hp=0;p.dead=true;state.winner=1-i;state.message='БУМ! На месте танка падает RIP-камень 🪦';crater(p.x,.08);}}

  function handleDisconnect(socketId){const i=idxOf(socketId);if(i>=0&&state.winner==null){state.winner=1-i;state.players[i].dead=true;state.message='Соперник отключился';emitState();}}
  function destroy(){destroyed=true;if(timer)clearInterval(timer);timer=null;}

  emitState();
  return { playerSocketIds, emitState, handleAction, handleDisconnect, destroy };
}
