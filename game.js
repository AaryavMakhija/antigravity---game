/**
 * ROCKET DASH — Full Game Engine
 * HTML5 Canvas | Vanilla JS | 3 Levels
 * Level 1: Asteroid Belt | Level 2: Planetary Drift | Level 3: Nebula Chaos
 */
'use strict';

// ============================================================
//  CONSTANTS
// ============================================================
const CW = 900;   // Logical canvas width
const CH = 650;   // Logical canvas height

const LEVEL_CONFIG = [
  null,
  { // Level 1 – Asteroid Belt
    name: 'ASTEROID BELT',
    goalDist: 1200, baseSpeed: 130, maxSpeed: 260, speedRamp: 0.018,
    asteroidRate: 0.022, asteroidTypes: ['asteroid','asteroid'],
    planetRate: 0, windForce: 0,
    bg0: '#01051a', bg1: '#04102e', tint: 'rgba(0,30,100,0.07)', stars: 200,
  },
  { // Level 2 – Planetary Drift
    name: 'PLANETARY DRIFT',
    goalDist: 1800, baseSpeed: 170, maxSpeed: 340, speedRamp: 0.025,
    asteroidRate: 0.018, asteroidTypes: ['asteroid','asteroid2'],
    planetRate: 0.0042, windForce: 0,
    bg0: '#06010e', bg1: '#140320', tint: 'rgba(80,0,110,0.07)', stars: 260,
  },
  { // Level 3 – Nebula Chaos
    name: 'NEBULA CHAOS',
    goalDist: 2500, baseSpeed: 210, maxSpeed: 450, speedRamp: 0.034,
    asteroidRate: 0.031, asteroidTypes: ['asteroid','asteroid2'],
    planetRate: 0.007, windForce: 16,
    bg0: '#040010', bg1: '#09001e', tint: 'rgba(110,0,60,0.09)', stars: 300,
  },
];

// ============================================================
//  UTILITIES
// ============================================================
const rnd  = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist  = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// ============================================================
//  AUDIO ENGINE
// ============================================================
const Audio = (() => {
  let ac = null;
  let thrOsc = null, thrGain = null;

  const init = () => {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    document.addEventListener('click',   resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });
  };
  const resume = () => { if (ac && ac.state === 'suspended') ac.resume(); };

  const tone = (freq, type, dur, vol, delay = 0) => {
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = type; o.frequency.value = freq;
    const t = ac.currentTime + delay;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.01);
  };

  const startThruster = () => {
    if (!ac || thrOsc) return;
    thrOsc  = ac.createOscillator();
    thrGain = ac.createGain();
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 180;
    thrOsc.connect(f); f.connect(thrGain); thrGain.connect(ac.destination);
    thrOsc.type = 'sawtooth'; thrOsc.frequency.value = 52;
    thrGain.gain.setValueAtTime(0, ac.currentTime);
    thrGain.gain.linearRampToValueAtTime(0.04, ac.currentTime + 0.4);
    thrOsc.start();
  };

  const stopThruster = () => {
    if (!thrOsc) return;
    try { thrGain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.3); thrOsc.stop(ac.currentTime + 0.35); } catch (e) {}
    thrOsc = null; thrGain = null;
  };

  const hit      = () => { tone(80,'sawtooth',0.3,0.2); tone(300,'square',0.12,0.12); tone(140,'sine',0.45,0.1); };
  const boom     = () => { tone(55,'sawtooth',0.9,0.3); tone(35,'square',1.1,0.2,0.1); tone(18,'sine',1.3,0.15,0.25); };
  const levelWin = () => { [523,659,784,1047].forEach((f,i) => tone(f,'sine',0.4,0.22,i*0.15)); };
  const victory  = () => { const m=[523,523,659,523,784,740],t=[0,.2,.4,.65,.85,1.1]; m.forEach((f,i) => tone(f,'sine',0.4,0.26,t[i])); };
  const warn     = () => { tone(220,'square',0.12,0.09); tone(220,'square',0.12,0.09,0.2); };

  return { init, resume, startThruster, stopThruster, hit, boom, levelWin, victory, warn };
})();

// ============================================================
//  PARTICLE SYSTEM
// ============================================================
class Particle {
  constructor(x,y,vx,vy,r,color,life,grav=0){
    Object.assign(this,{x,y,vx,vy,r,color,life,maxLife:life,grav,alpha:1});
  }
  update(dt){
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this.vy+=this.grav*dt;
    this.life-=dt;
    this.alpha=Math.max(0,this.life/this.maxLife);
    this.r*=0.978;
  }
  draw(ctx){
    if(this.r<0.3) return;
    ctx.save();
    ctx.globalAlpha=this.alpha;
    ctx.shadowColor=this.color; ctx.shadowBlur=this.r*2.5;
    ctx.fillStyle=this.color;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  dead(){ return this.life<=0||this.r<0.25; }
}

class Particles {
  constructor(){ this.list=[]; }

  exhaust(x,y,angle){
    for(let i=0;i<4;i++){
      const spd=rnd(70,150), a=angle+Math.PI+rnd(-0.5,0.5);
      const c=['#ff6b35','#ff9500','#ffcc00','#ff4400'][Math.floor(Math.random()*4)];
      this.list.push(new Particle(x+rnd(-3,3),y+rnd(-3,3),Math.cos(a)*spd,Math.sin(a)*spd,rnd(2,5.5),c,rnd(0.18,0.45)));
    }
  }

  shieldHit(x,y){
    for(let i=0;i<22;i++){
      const a=Math.random()*Math.PI*2, spd=rnd(80,220);
      const c=i%2===0?'#00d4ff':'#ffffff';
      this.list.push(new Particle(x,y,Math.cos(a)*spd,Math.sin(a)*spd,rnd(2,6),c,rnd(0.3,0.8)));
    }
  }

  explosion(x,y){
    for(let i=0;i<70;i++){
      const a=Math.random()*Math.PI*2, spd=rnd(50,300);
      const c=['#ff6b35','#ff3366','#ff9500','#fff','#ffcc00','#ff4400'][Math.floor(Math.random()*6)];
      this.list.push(new Particle(x+rnd(-12,12),y+rnd(-12,12),Math.cos(a)*spd,Math.sin(a)*spd,rnd(3,11),c,rnd(0.5,1.3),35));
    }
  }

  wind(cw,ch,dir){
    const y=Math.random()*ch;
    const x=dir>0?0:cw;
    this.list.push(new Particle(x,y,dir*rnd(40,100),rnd(-15,15),rnd(1,2.5),'rgba(140,190,255,0.35)',rnd(1.5,3)));
  }

  update(dt){ this.list=this.list.filter(p=>!p.dead()); this.list.forEach(p=>p.update(dt)); }
  draw(ctx){ this.list.forEach(p=>p.draw(ctx)); }
  clear(){ this.list=[]; }
}

// ============================================================
//  STAR FIELD
// ============================================================
class Stars {
  constructor(count){
    this.s=Array.from({length:count},()=>({
      x:Math.random()*CW, y:Math.random()*CH,
      r:Math.random()*2.1, bright:Math.random(),
      ts:rnd(0.4,2.2), to:Math.random()*Math.PI*2,
      p:rnd(0.1,0.55),
    }));
    this.t=0; this.scroll=0;
  }
  update(dt,speed){ this.t+=dt; this.scroll=(this.scroll+speed*0.4*dt)%CH; }
  draw(ctx){
    this.s.forEach(s=>{
      const tw=0.5+0.5*Math.sin(this.t*s.ts+s.to);
      const a=clamp(0.3+0.7*s.bright*tw,0,1);
      const y=(s.y+this.scroll*s.p)%CH;
      ctx.save(); ctx.globalAlpha=a;
      ctx.fillStyle='#fff'; ctx.shadowColor='#88ccff'; ctx.shadowBlur=s.r*3;
      ctx.beginPath(); ctx.arc(s.x,y,s.r,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
  }
}

// ============================================================
//  ROCKET (Player)
// ============================================================
class Rocket {
  constructor(img){ this.img=img; this.reset(); }

  reset(){
    this.x=CW/2; this.y=CH*0.72;
    this.vx=0; this.vy=0;
    this.angle=-Math.PI/2;
    this.w=54; this.h=78;
    this.shields=3; this.inv=0; this.sFlash=0;
    this.dead=false;
  }

  update(dt,inp,wind,ptcl){
    if(this.dead) return;
    const acc=720, fric=0.87, maxV=400;
    if(inp.left)  this.vx-=acc*dt;
    if(inp.right) this.vx+=acc*dt;
    if(inp.up)    this.vy-=acc*dt;
    if(inp.down)  this.vy+=acc*dt;
    if(inp.mx.on){
      this.vx+=(inp.mx.x-this.x)*5*dt;
      this.vy+=(inp.mx.y-this.y)*5*dt;
    }
    this.vx+=wind*dt;
    this.vx*=Math.pow(fric,dt*60); this.vy*=Math.pow(fric,dt*60);
    this.vx=clamp(this.vx,-maxV,maxV); this.vy=clamp(this.vy,-maxV,maxV);
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    const m=this.w/2;
    this.x=clamp(this.x,m,CW-m); this.y=clamp(this.y,m,CH-m);
    const ta=-Math.PI/2+(this.vx/maxV)*0.38;
    this.angle+=(ta-this.angle)*0.13;
    if(this.inv>0) this.inv-=dt;
    if(this.sFlash>0) this.sFlash-=dt;
    // Exhaust
    const ex=this.x-Math.cos(this.angle)*(this.h/2-5);
    const ey=this.y-Math.sin(this.angle)*(this.h/2-5);
    ptcl.exhaust(ex,ey,this.angle);
  }

  draw(ctx){
    if(this.dead) return;
    if(this.inv>0&&Math.floor(this.inv*10)%2===0) return;
    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.rotate(this.angle+Math.PI/2);
    if(this.sFlash>0){ ctx.shadowColor='#00d4ff'; ctx.shadowBlur=32*(this.sFlash/0.45); }
    if(this.img&&this.img.complete&&this.img.naturalWidth>0){
      ctx.drawImage(this.img,-this.w/2,-this.h/2,this.w,this.h);
    } else {
      // Vector fallback rocket
      ctx.fillStyle='#c0c8e8';
      ctx.beginPath();
      ctx.moveTo(0,-this.h/2); ctx.lineTo(this.w*0.25,this.h*0.2);
      ctx.lineTo(0,this.h*0.08); ctx.lineTo(-this.w*0.25,this.h*0.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#00d4ff'; ctx.shadowColor='#00d4ff'; ctx.shadowBlur=14;
      ctx.beginPath(); ctx.ellipse(0,this.h*0.22,9,5,0,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  getRadius(){ return this.w*0.37; }

  takeDamage(){
    if(this.inv>0||this.dead) return false;
    this.shields--;
    this.inv=1.8; this.sFlash=0.45;
    if(this.shields<=0) this.dead=true;
    return true;
  }
}

// ============================================================
//  ASTEROID
// ============================================================
class Asteroid {
  constructor(x,y,r,imgKey,speed){
    this.x=x; this.y=y; this.r=r; this.imgKey=imgKey;
    this.vy=speed*rnd(0.75,1.4); this.vx=rnd(-65,65);
    this.ang=rnd(0,Math.PI*2); this.rot=rnd(-1.3,1.3);
    this.wb=rnd(0,Math.PI*2); this.ws=rnd(1,2.5); this.wa=rnd(0.5,1.5);
    this.alive=true;
  }
  update(dt,speed){
    this.wb+=this.ws*dt;
    this.x+=(this.vx+Math.sin(this.wb)*this.wa*22)*dt;
    this.y+=this.vy*dt;
    this.ang+=this.rot*dt;
    this.vy=Math.min(this.vy+speed*0.08*dt, speed*2.2);
    if(this.x-this.r<0){this.x=this.r;this.vx=Math.abs(this.vx);}
    if(this.x+this.r>CW){this.x=CW-this.r;this.vx=-Math.abs(this.vx);}
  }
  draw(ctx,imgs){
    const img=imgs[this.imgKey];
    ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.ang);
    if(img&&img.complete&&img.naturalWidth>0){
      ctx.drawImage(img,-this.r,-this.r,this.r*2,this.r*2);
    } else {
      const g=ctx.createRadialGradient(-this.r*.3,-this.r*.3,0,0,0,this.r);
      g.addColorStop(0,'#8a7060'); g.addColorStop(1,'#3a2a1a');
      ctx.fillStyle=g; ctx.shadowColor='#604030'; ctx.shadowBlur=6;
      ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  offscreen(){ return this.y-this.r>CH+20; }
}

// ============================================================
//  PLANET
// ============================================================
class Planet {
  constructor(x,y,r,imgKey,speed){
    this.x=x; this.y=y; this.r=r; this.imgKey=imgKey;
    this.vy=speed*rnd(0.38,0.72); this.vx=rnd(-28,28);
    this.ang=0; this.rot=rnd(-0.18,0.18);
    this.glowT=0; this.glowD=1;
    this.glowC=imgKey==='planet_mars'?'255,80,20':'200,110,30';
  }
  update(dt,speed){
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this.ang+=this.rot*dt;
    this.vy=Math.min(this.vy+speed*0.04*dt,speed*1.8);
    if(this.x-this.r<0||this.x+this.r>CW) this.vx*=-1;
    this.glowT+=0.014*this.glowD;
    if(this.glowT>=1||this.glowT<=0) this.glowD*=-1;
  }
  draw(ctx,imgs){
    ctx.save(); ctx.translate(this.x,this.y);
    // Glow halo
    const hr=this.r*1.55;
    const grd=ctx.createRadialGradient(0,0,this.r*.9,0,0,hr);
    grd.addColorStop(0,`rgba(${this.glowC},${0.14+this.glowT*0.11})`);
    grd.addColorStop(1,'transparent');
    ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(0,0,hr,0,Math.PI*2); ctx.fill();
    ctx.rotate(this.ang);
    const img=imgs[this.imgKey];
    if(img&&img.complete&&img.naturalWidth>0){
      ctx.drawImage(img,-this.r,-this.r,this.r*2,this.r*2);
    } else {
      const g=ctx.createRadialGradient(-this.r*.3,-this.r*.3,0,0,0,this.r);
      g.addColorStop(0,'#d04010'); g.addColorStop(1,'#5a0800');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }
  offscreen(){ return this.y-this.r>CH+20; }
}

// ============================================================
//  MAIN GAME ENGINE
// ============================================================
(function() {

  // State machine
  const S = { LOADING:0, MENU:1, PLAYING:2, PAUSED:3, LCLEAR:4, GAMEOVER:5, VICTORY:6 };
  let state = S.LOADING;
  let level = 1, score = 0, totalScore = 0, levelTime = 0;
  let levelStars = [0, 0, 0];
  let raf = null, lastT = 0;

  // Canvas
  let canvas, ctx;

  // Assets
  const imgs = {};
  const ASSET_KEYS = ['rocket','asteroid_1','asteroid_2','planet_mars','planet_jupiter','space_bg'];
  let loaded = 0;

  // Game objects
  let rocket, ptcl, stars, obstacles = [];

  // Level runtime
  let dist = 0, speed = 0, lvlTime = 0;
  let windDir = 0, windChT = 0, windPT = 0;
  let shake = {x:0,y:0,int:0,dur:0};

  // Input
  const inp = {
    left:false, right:false, up:false, down:false,
    mx:{ on:false, x:0, y:0 },
  };

  // DOM
  const $  = id => document.getElementById(id);
  const sc = {};  // screens cache

  // ============================================================
  //  INIT
  // ============================================================
  function init(){
    canvas = $('gameCanvas');
    ctx    = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    ['loading-screen','main-menu','how-to-screen','level-select','hud',
     'pause-screen','level-clear-screen','game-over-screen','victory-screen'
    ].forEach(id => sc[id] = $(id));

    // Input listeners
    window.addEventListener('keydown', e => key(e.key, true));
    window.addEventListener('keyup',   e => key(e.key, false));
    canvas.addEventListener('mousemove',  onMM);
    canvas.addEventListener('mouseenter', ()=>{ inp.mx.on=true; });
    canvas.addEventListener('mouseleave', ()=>{ inp.mx.on=false; });
    canvas.addEventListener('touchmove',  onTM, {passive:false});
    canvas.addEventListener('touchstart', ()=>{ inp.mx.on=true; });
    canvas.addEventListener('touchend',   ()=>{ inp.mx.on=false; });

    Audio.init();
    loadAssets();
  }

  function resize(){
    const dpr = window.devicePixelRatio||1;
    const cont = $('game-container');
    const W = cont.clientWidth, H = cont.clientHeight;
    const s = Math.min(W/CW, H/CH);
    canvas.width  = Math.round(CW*dpr);
    canvas.height = Math.round(CH*dpr);
    canvas.style.width  = Math.round(CW*s)+'px';
    canvas.style.height = Math.round(CH*s)+'px';
    canvas.style.left   = Math.round((W-CW*s)/2)+'px';
    canvas.style.top    = Math.round((H-CH*s)/2)+'px';
    // Reset transform
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  // ============================================================
  //  ASSET LOADING
  // ============================================================
  function loadAssets(){
    ASSET_KEYS.forEach(k => {
      const img = new Image();
      img.src = `assets/${k}.png`;
      img.onload = img.onerror = () => { if(++loaded>=ASSET_KEYS.length) onReady(); };
      imgs[k] = img;
    });
    imgs['asteroid']  = imgs['asteroid_1'];
    imgs['asteroid2'] = imgs['asteroid_2'];
  }

  function onReady(){
    rocket = new Rocket(imgs['rocket']);
    ptcl   = new Particles();
    stars  = new Stars(220);
    setTimeout(() => {
      showMain();
      lastT = performance.now();
      if(!raf) raf = requestAnimationFrame(loop);
    }, 500);
  }

  // ============================================================
  //  INPUT
  // ============================================================
  function key(k, down){
    if((k==='Escape'||k==='p'||k==='P')&&down&&(state===S.PLAYING||state===S.PAUSED)){
      Game.togglePause(); return;
    }
    const map = {ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',
                 ArrowUp:'up',w:'up',W:'up',ArrowDown:'down',s:'down',S:'down'};
    if(map[k]){ inp[map[k]]=down; if(down) inp.mx.on=false; }
  }

  function onMM(e){
    const r=canvas.getBoundingClientRect();
    inp.mx.x=(e.clientX-r.left)*(CW/r.width);
    inp.mx.y=(e.clientY-r.top)*(CH/r.height);
    inp.mx.on=true;
    inp.left=inp.right=inp.up=inp.down=false;
  }

  function onTM(e){
    e.preventDefault();
    const r=canvas.getBoundingClientRect(), t=e.touches[0];
    inp.mx.x=(t.clientX-r.left)*(CW/r.width);
    inp.mx.y=(t.clientY-r.top)*(CH/r.height);
    inp.mx.on=true;
  }

  // ============================================================
  //  SCREEN MANAGEMENT
  // ============================================================
  function showOnly(id){
    Object.values(sc).forEach(s=>s.classList.add('hidden'));
    if(sc[id]) sc[id].classList.remove('hidden');
  }

  function showMain(){
    state=S.MENU; Audio.stopThruster();
    showOnly('main-menu'); sc['hud'].classList.add('hidden');
    $('game-container').classList.remove('danger-warning');
    updateStarCards();
  }

  function showLevelSelect(){
    state=S.MENU; Audio.stopThruster();
    showOnly('level-select'); sc['hud'].classList.add('hidden');
    updateStarCards();
  }

  function showHowTo(){ showOnly('how-to-screen'); }

  function updateStarCards(){
    const c = n => '★'.repeat(n)+'☆'.repeat(3-n);
    for(let i=1;i<=3;i++){ const el=$(`ls-stars-${i}`); if(el) el.textContent=c(levelStars[i-1]); }
  }

  // ============================================================
  //  LEVEL START
  // ============================================================
  function startLevel(lvl){
    level=lvl; const cfg=LEVEL_CONFIG[lvl];
    state=S.PLAYING; score=0; dist=0; lvlTime=0;
    windDir=0; windChT=0; windPT=0;
    speed=cfg.baseSpeed; obstacles=[];
    ptcl.clear(); stars=new Stars(cfg.stars);
    rocket.reset();
    showOnly('hud'); sc['hud'].classList.remove('hidden');
    $('hud-level-badge').textContent=`LEVEL ${lvl}`;
    $('game-container').classList.remove('danger-warning');
    updateHUD();
    Audio.startThruster();
  }

  // ============================================================
  //  UPDATE
  // ============================================================
  function update(dt){
    if(state!==S.PLAYING) return;
    const cfg=LEVEL_CONFIG[level];
    lvlTime+=dt;

    // Speed ramp
    speed=Math.min(cfg.baseSpeed + lvlTime*cfg.speedRamp*cfg.baseSpeed, cfg.maxSpeed);

    // Distance (pixels → meters mapping)
    dist+=speed*dt*0.55;
    score+=dt*12*(speed/cfg.baseSpeed);

    stars.update(dt,speed);

    // Spawn
    if(cfg.asteroidRate>0&&Math.random()<cfg.asteroidRate){
      const types=cfg.asteroidTypes;
      const ik=types[Math.floor(Math.random()*types.length)];
      const r=rnd(18,50);
      obstacles.push(new Asteroid(rnd(r,CW-r),-r-8,r,ik,speed));
    }
    if(cfg.planetRate>0&&Math.random()<cfg.planetRate){
      const r=rnd(55,100);
      const ik=Math.random()<0.55?'planet_mars':'planet_jupiter';
      obstacles.push(new Planet(rnd(r,CW-r),-r-8,r,ik,speed));
    }

    // Update obstacles
    obstacles.forEach(o=>o.update(dt,speed));
    obstacles=obstacles.filter(o=>!o.offscreen());

    // Wind
    if(cfg.windForce>0){
      windChT-=dt;
      if(windChT<=0){ windDir=rnd(-1,1)>0?1:-1; windChT=rnd(3,8); }
      windPT-=dt;
      if(windPT<=0){ ptcl.wind(CW,CH,windDir); windPT=0.06; }
    }
    const currentWind = cfg.windForce * windDir;

    // Rocket
    rocket.update(dt,inp,currentWind*dt,ptcl);

    // Collisions
    if(!rocket.dead){
      const rr=rocket.getRadius();
      for(const o of obstacles){
        if(dist2d(rocket.x,rocket.y,o.x,o.y)<rr+o.r*0.82){
          if(rocket.takeDamage()){
            Audio.hit(); shake.int=9; shake.dur=0.38;
            ptcl.shieldHit(rocket.x,rocket.y);
            flash('red'); updateHUD();
            if(rocket.dead){
              ptcl.explosion(rocket.x,rocket.y);
              Audio.stopThruster(); Audio.boom();
              shake.int=20; shake.dur=0.75;
              setTimeout(()=>doGameOver(),950);
            } else { Audio.warn(); }
          }
          break;
        }
      }
    }

    // Particles
    ptcl.update(dt);

    // Screen shake
    if(shake.dur>0){ shake.dur-=dt; shake.x=rnd(-1,1)*shake.int; shake.y=rnd(-1,1)*shake.int; shake.int*=0.88; }
    else { shake.x=0; shake.y=0; }

    // HUD
    updateHUD();

    // Level clear
    if(dist>=cfg.goalDist&&!rocket.dead) doLevelClear();
  }

  function dist2d(ax,ay,bx,by){ return Math.hypot(ax-bx,ay-by); }

  // ============================================================
  //  RENDER
  // ============================================================
  function render(){
    ctx.save();
    ctx.translate(shake.x, shake.y);

    const cfg=LEVEL_CONFIG[level]||LEVEL_CONFIG[1];

    // Background gradient
    const bg=ctx.createLinearGradient(0,0,0,CH);
    bg.addColorStop(0,cfg.bg0); bg.addColorStop(1,cfg.bg1);
    ctx.fillStyle=bg; ctx.fillRect(0,0,CW,CH);

    // Scrolling nebula image
    const bgImg=imgs['space_bg'];
    if(bgImg&&bgImg.complete&&bgImg.naturalWidth>0){
      ctx.save(); ctx.globalAlpha=0.32;
      const sc2=(dist*0.18)%CH;
      ctx.drawImage(bgImg,0,sc2-CH,CW,CH);
      ctx.drawImage(bgImg,0,sc2,CW,CH);
      ctx.restore();
    }

    // Level tint
    ctx.fillStyle=cfg.tint; ctx.fillRect(0,0,CW,CH);

    // Stars
    stars.draw(ctx);

    // Speed lines
    if(state===S.PLAYING){
      const cfg2=LEVEL_CONFIG[level];
      const ratio=clamp((speed-cfg2.baseSpeed)/(cfg2.maxSpeed-cfg2.baseSpeed),0,1);
      if(ratio>0.08){
        ctx.save(); ctx.globalAlpha=ratio*0.07; ctx.strokeStyle='#88aaee'; ctx.lineWidth=1;
        for(let i=0;i<10;i++){
          const lx=Math.random()*CW, ll=rnd(25,90)*ratio;
          ctx.beginPath(); ctx.moveTo(lx,0); ctx.lineTo(lx,ll); ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Obstacles
    obstacles.forEach(o=>o.draw(ctx,imgs));

    // Particles
    ptcl.draw(ctx);

    // Rocket
    rocket.draw(ctx);

    ctx.restore();
  }

  // ============================================================
  //  GAME LOOP
  // ============================================================
  function loop(now){
    raf=requestAnimationFrame(loop);
    let dt=(now-lastT)/1000;
    lastT=now;
    dt=Math.min(dt,0.05);
    update(dt);
    render();
  }

  // ============================================================
  //  HUD
  // ============================================================
  function updateHUD(){
    const cfg=LEVEL_CONFIG[level];
    $('hud-score').textContent=Math.floor(score).toLocaleString();
    $('hud-speed').textContent=(speed/cfg.baseSpeed).toFixed(1)+'x';
    const d=Math.min(dist,cfg.goalDist);
    $('hud-dist-text').textContent=`${Math.floor(d)}m / ${cfg.goalDist}m`;
    $('progress-fill').style.width=`${(d/cfg.goalDist)*100}%`;
    ['pip-1','pip-2','pip-3'].forEach((id,i)=>{
      const el=$(id); if(el) el.classList.toggle('active',i<rocket.shields);
    });
    if(rocket.shields===1) $('game-container').classList.add('danger-warning');
    else $('game-container').classList.remove('danger-warning');
  }

  // ============================================================
  //  FLASH / SHAKE
  // ============================================================
  function flash(type){
    const el=$('flash-overlay');
    el.className=type==='red'?'flash-red':'flash-blue';
    el.style.opacity='1';
    setTimeout(()=>{ el.style.opacity='0'; el.className=''; },160);
  }

  // ============================================================
  //  END STATES
  // ============================================================
  function doGameOver(){
    if(state===S.GAMEOVER) return;
    state=S.GAMEOVER;
    $('game-container').classList.remove('danger-warning');
    $('go-score').textContent=Math.floor(score).toLocaleString();
    $('go-dist').textContent=Math.floor(dist)+'m';
    $('go-time').textContent=Math.floor(lvlTime)+'s';
    showOnly('game-over-screen'); sc['hud'].classList.add('hidden');
  }

  function doLevelClear(){
    if(state===S.LCLEAR) return;
    state=S.LCLEAR;
    $('game-container').classList.remove('danger-warning');
    Audio.stopThruster(); Audio.levelWin();
    const cfg=LEVEL_CONFIG[level];
    // Star calculation
    const timePar=cfg.goalDist/(cfg.baseSpeed*1.7); // expected seconds
    let st=rocket.shields;
    if(lvlTime<timePar&&st<3) st=Math.min(3,st+1);
    st=clamp(st,1,3);
    levelStars[level-1]=Math.max(levelStars[level-1],st);
    score+=st*500+rocket.shields*300;
    totalScore+=score;

    $('lc-title').textContent=level===3?'MISSION COMPLETE!':'LEVEL CLEAR!';
    $('lc-stars').textContent='★'.repeat(st)+'☆'.repeat(3-st);
    $('lc-score').textContent=Math.floor(score).toLocaleString();
    $('lc-time').textContent=Math.floor(lvlTime)+'s';
    $('lc-shields').textContent=rocket.shields;
    $('btn-next-level').textContent=level>=3?'🏆 See Results':'Next Level →';

    flash('blue');
    showOnly('level-clear-screen'); sc['hud'].classList.add('hidden');
  }

  function doVictory(){
    state=S.VICTORY; Audio.victory();
    const totalSt=levelStars.reduce((a,b)=>a+b,0);
    $('vict-score').textContent=totalScore.toLocaleString();
    $('vict-stars').textContent=`${totalSt} / 9`;
    showOnly('victory-screen'); sc['hud'].classList.add('hidden');
  }

  // ============================================================
  //  PUBLIC API — called from HTML onclick
  // ============================================================
  window.Game = {
    showMainMenu:   showMain,
    showLevelSelect:showLevelSelect,
    showHowTo:      showHowTo,
    startLevel:     startLevel,
    restartLevel:   ()=>startLevel(level),
    nextLevel:      ()=>{ if(level<3) startLevel(level+1); else doVictory(); },
    togglePause:    ()=>{
      if(state===S.PLAYING){
        state=S.PAUSED; Audio.stopThruster();
        sc['pause-screen'].classList.remove('hidden');
        $('btn-pause').textContent='▶';
      } else if(state===S.PAUSED){
        state=S.PLAYING; Audio.startThruster();
        sc['pause-screen'].classList.add('hidden');
        $('btn-pause').textContent='⏸';
        lastT=performance.now();
      }
    },
  };

  // Auto-start
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
