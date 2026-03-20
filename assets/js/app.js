(() => {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');

  const timeEl = $('#time'), levelEl = $('#level'), scoreEl = $('#score'), bestEl = $('#best');
  const challengeBanner = $('#challengeBanner'), mobileTip = $('#mobileTip');
  const startPanel = $('#startPanel'), endPanel = $('#endPanel');
  const startBtn = $('#startBtn'), restartBtn = $('#restartBtn');
  const shareBtn = $('#shareBtn'), copyResultBtn = $('#copyResultBtn'), copyChallengeBtn = $('#copyChallengeBtn');
  const endTitle = $('#endTitle'), endDesc = $('#endDesc'), sharePreview = $('#sharePreview');
  const soundToggle = $('#soundToggle');
  const joystickWrap = $('#joystickWrap'), joystickKnob = $('#joystickKnob');

  let w=0,h=0,dpr=1,running=false,animationId=null,lastTime=0,elapsed=0,spawnTimer=0,bossTimer=0;
  let stars=[],bullets=[],particles=[],gameResult={score:0,time:0};

  const bestScore = Number(localStorage.getItem('bullet_dodge_best') || 0);
  bestEl.textContent = String(bestScore);

  const state = { soundOn:true };
  const input = { left:false,right:false,up:false,down:false,joyX:0,joyY:0 };
  const joystick = { active:false,pointerId:null,radius:46,originX:0,originY:0 };
  const mobileMode = { active:false,speedMul:1,spawnMul:1,bulletSpeedMul:1,bossCount:18,hitRadiusMul:1 };
  const plane = { x:0,y:0,radius:14,speed:290,flash:0,angle:0 };

  const audioCtx = (()=>{try{return new (window.AudioContext||window.webkitAudioContext)()}catch(_){return null}})();

  function beep(freq,duration,type='square',gainValue=0.03){
    if(!state.soundOn || !audioCtx) return;
    const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
    osc.type=type; osc.frequency.value=freq; gain.gain.value=gainValue;
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+duration);
    osc.stop(audioCtx.currentTime+duration);
  }

  function isTouchDevice(){ return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

  function recalcMode(){
    mobileMode.active = isTouchDevice() || window.innerWidth <= 720;
    if(mobileMode.active){
      mobileMode.speedMul = 1.18;
      mobileMode.spawnMul = 1.18;
      mobileMode.bulletSpeedMul = 0.88;
      mobileMode.bossCount = 12;
      mobileMode.hitRadiusMul = 0.82;
      mobileTip.hidden = false;
    } else {
      mobileMode.speedMul = 1;
      mobileMode.spawnMul = 1;
      mobileMode.bulletSpeedMul = 1;
      mobileMode.bossCount = 18;
      mobileMode.hitRadiusMul = 1;
      mobileTip.hidden = true;
    }
  }

  function showJoystick(x,y){
    joystick.originX=x; joystick.originY=y;
    joystickWrap.style.left = `${x}px`;
    joystickWrap.style.top = `${y}px`;
    joystickWrap.classList.add('is-visible');
    joystickKnob.style.transform='translate(0px,0px)';
  }

  function hideJoystick(){
    joystick.active=false; joystick.pointerId=null; input.joyX=0; input.joyY=0;
    joystickWrap.classList.remove('is-visible');
    joystickKnob.style.transform='translate(0px,0px)';
  }

  function resize(){
    dpr=Math.max(1,window.devicePixelRatio||1);
    w=window.innerWidth; h=window.innerHeight;
    canvas.width=Math.floor(w*dpr); canvas.height=Math.floor(h*dpr);
    canvas.style.width=w+'px'; canvas.style.height=h+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    recalcMode(); initStars(); if(!running) resetPlane(); render();
  }

  function initStars(){
    stars=Array.from({length:Math.max(40,Math.floor((w*h)/17000))},()=>({
      x:Math.random()*w,y:Math.random()*h,size:Math.random()*2+.5,speed:Math.random()*40+10,alpha:Math.random()*.6+.2
    }));
  }

  function resetPlane(){ plane.x=w/2; plane.y=h*(mobileMode.active?0.72:0.78); plane.flash=0; plane.angle=0; }
  function resetGame(){ elapsed=0; spawnTimer=0; bossTimer=0; bullets=[]; particles=[]; resetPlane(); hideJoystick(); updateHud(); }
  function getDifficulty(t){ return Math.min(8,1+Math.floor(t/4)); }
  function getSpawnInterval(t){ return Math.max(0.11,(0.52-t*0.012)*mobileMode.spawnMul); }

  function spawnBullet(){
    const difficulty=getDifficulty(elapsed), edge=Math.floor(Math.random()*4), margin=36;
    let x,y;
    if(edge===0){x=Math.random()*w;y=-margin}
    else if(edge===1){x=w+margin;y=Math.random()*h}
    else if(edge===2){x=Math.random()*w;y=h+margin}
    else {x=-margin;y=Math.random()*h}
    const angle=Math.atan2(plane.y-y,plane.x-x);
    const spreadBase=Math.max(0.08,0.84-difficulty*0.08);
    const spread=(Math.random()-0.5)*spreadBase;
    const speed=(120+difficulty*25+Math.random()*75)*mobileMode.bulletSpeedMul;
    const radius=Math.random()<0.14?10:6+Math.random()*3;
    bullets.push({x,y,vx:Math.cos(angle+spread)*speed,vy:Math.sin(angle+spread)*speed,radius,color:'#ff6f83'});
    if(difficulty>=4 && Math.random() < (mobileMode.active?0.14:0.22)){
      const burst=mobileMode.active?3:4+Math.floor(Math.random()*2);
      for(let i=0;i<burst;i++){
        const a=angle+(-0.4+(0.8*i)/Math.max(1,burst-1));
        bullets.push({x,y,vx:Math.cos(a)*speed*0.72,vy:Math.sin(a)*speed*0.72,radius:4.5,color:'#ff9db2'});
      }
    }
  }

  function spawnBossPattern(){
    if(elapsed<20) return;
    const centerX=Math.random()*(w*0.56)+w*0.22, centerY=-20, count=mobileMode.bossCount;
    for(let i=0;i<count;i++){
      const angle=(Math.PI*2*i)/count+elapsed*0.8;
      const speed=(120+(i%3)*18)*mobileMode.bulletSpeedMul;
      bullets.push({x:centerX,y:centerY,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed+70,radius:5.2,color:'#ffd166'});
    }
    beep(220,0.18,'sawtooth',0.04);
  }

  function spawnExplosion(x,y,color){
    for(let i=0;i<22;i++){
      const angle=Math.random()*Math.PI*2,speed=Math.random()*190+40;
      particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,size:Math.random()*3+2,life:Math.random()*0.55+0.35,maxLife:Math.random()*0.55+0.35,color});
    }
  }

  function update(dt){
    elapsed+=dt;
    if(elapsed>=30){ elapsed=30; gameResult={score:Math.floor(elapsed*10),time:elapsed}; updateHud(); endGame(true); return; }

    const keyboardX=(input.left?-1:0)+(input.right?1:0);
    const keyboardY=(input.up?-1:0)+(input.down?1:0);
    const moveX=keyboardX+input.joyX, moveY=keyboardY+input.joyY;
    const len=Math.hypot(moveX,moveY)||1;

    plane.x += (moveX/len)*plane.speed*mobileMode.speedMul*dt;
    plane.y += (moveY/len)*plane.speed*mobileMode.speedMul*dt;
    plane.x = Math.max(18,Math.min(w-18,plane.x));
    plane.y = Math.max(120,Math.min(h-26,plane.y));
    plane.flash = Math.max(0,plane.flash-dt*3.5);
    plane.angle = Math.max(-0.22,Math.min(0.22,moveX*0.12));

    spawnTimer += dt;
    while(spawnTimer >= getSpawnInterval(elapsed)){ spawnTimer -= getSpawnInterval(elapsed); spawnBullet(); if(Math.random()<0.24) beep(120+Math.random()*40,0.04,'square',0.012); }
    bossTimer += dt;
    if(bossTimer >= (mobileMode.active?3.1:2.6)){ bossTimer=0; spawnBossPattern(); }

    for(const star of stars){ star.y += star.speed*dt; if(star.y>h+4){ star.y=-4; star.x=Math.random()*w; } }

    for(let i=bullets.length-1;i>=0;i--){
      const b=bullets[i]; b.x+=b.vx*dt; b.y+=b.vy*dt;
      const dx=b.x-plane.x, dy=b.y-plane.y, hitDist=(b.radius+plane.radius-2)*mobileMode.hitRadiusMul;
      if(dx*dx+dy*dy <= hitDist*hitDist){ plane.flash=1; spawnExplosion(plane.x,plane.y,'#ff7b7b'); beep(90,0.25,'sawtooth',0.06); gameResult={score:Math.floor(elapsed*10),time:elapsed}; endGame(false); return; }
      if(b.x<-90 || b.x>w+90 || b.y<-90 || b.y>h+90) bullets.splice(i,1);
    }

    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i]; p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt; p.vx*=0.98; p.vy*=0.98;
      if(p.life<=0) particles.splice(i,1);
    }

    updateHud();
  }

  function updateHud(){ timeEl.textContent=(30-elapsed).toFixed(1); levelEl.textContent=String(getDifficulty(elapsed)); scoreEl.textContent=String(Math.floor(elapsed*10)); }

  function drawBackground(){
    const grad=ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,'#07111f'); grad.addColorStop(0.5,'#0b1730'); grad.addColorStop(1,'#040914');
    ctx.fillStyle=grad; ctx.fillRect(0,0,w,h);
    for(const star of stars){ ctx.globalAlpha=star.alpha; ctx.fillStyle='#dbe8ff'; ctx.fillRect(star.x,star.y,star.size,star.size); }
    ctx.globalAlpha=1;
    ctx.strokeStyle='rgba(255,255,255,0.04)';
    for(let y=0;y<h;y+=48){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
  }

  function drawPlane(){
    ctx.save(); ctx.translate(plane.x,plane.y); ctx.rotate(plane.angle);
    ctx.shadowBlur=22; ctx.shadowColor=plane.flash>0?'rgba(255,100,100,.95)':'rgba(90,194,255,.8)';
    ctx.fillStyle=plane.flash>0?'#ff9d9d':'#86d2ff';
    ctx.beginPath(); ctx.moveTo(0,-18); ctx.lineTo(13,16); ctx.lineTo(0,9); ctx.lineTo(-13,16); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(4,8); ctx.lineTo(0,4); ctx.lineTo(-4,8); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ffbe50';
    ctx.beginPath(); ctx.moveTo(-5,16); ctx.lineTo(0,28+Math.sin(performance.now()*0.02)*2); ctx.lineTo(5,16); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBullets(){ for(const b of bullets){ ctx.save(); ctx.shadowBlur=18; ctx.shadowColor=b.color; ctx.fillStyle=b.color; ctx.beginPath(); ctx.arc(b.x,b.y,b.radius,0,Math.PI*2); ctx.fill(); ctx.restore(); } }
  function drawParticles(){ for(const p of particles){ ctx.globalAlpha=Math.max(0,p.life/p.maxLife); ctx.fillStyle=p.color; ctx.fillRect(p.x,p.y,p.size,p.size); } ctx.globalAlpha=1; }
  function render(){ drawBackground(); drawBullets(); drawParticles(); drawPlane(); }

  function loop(now){ const dt=Math.min(0.033,(now-lastTime)/1000); lastTime=now; update(dt); render(); if(running) animationId=requestAnimationFrame(loop); }

  function startGame(){
    if(audioCtx && audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
    resetGame(); running=true; startPanel.hidden=true; endPanel.hidden=true;
    if(mobileMode.active){ mobileTip.hidden=false; setTimeout(()=>{ if(running) mobileTip.hidden=true; },2500); }
    lastTime=performance.now(); beep(520,0.07,'triangle',0.03); cancelAnimationFrame(animationId); animationId=requestAnimationFrame(loop);
  }

  function getShareCopy(){
    const score=gameResult.score, time=gameResult.time.toFixed(1);
    if(gameResult.time>=30) return `나 30초 끝까지 버텼다. 생존 점수 ${score}점.\n이거 은근 자존심 건드리는데 너는 가능하냐?\n`;
    if(gameResult.time>=20) return `나 ${time}초 버텼다. 생존 점수 ${score}점.\n20초 넘어가면 진짜 정신없다. 너도 한번 해봐.\n`;
    return `나 ${time}초에서 터졌다. 생존 점수 ${score}점.\n보기보다 훨씬 어렵다. 너는 몇 초 버티냐?\n`;
  }

  function buildUrl(params){ const url=new URL(window.location.href); Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v)); return url.toString(); }
  function buildChallengeUrl(){ return buildUrl({challenge:'1',score:String(gameResult.score||0),time:String((gameResult.time||0).toFixed(1))}); }

  async function copyText(text,successMsg){
    try{ await navigator.clipboard.writeText(text); alert(successMsg); }
    catch(_){ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); alert(successMsg); }
  }

  async function shareResult(){
    const url=buildChallengeUrl(), text=getShareCopy()+url;
    if(navigator.share){ try{ await navigator.share({title:'30초 비행기 총알 피하기',text,url}); return; }catch(_){} }
    await copyText(text,'결과 링크를 복사했어. 친구에게 바로 던지면 된다.');
  }

  async function copyChallengeOnly(){
    const text=`30초 비행기 총알 피하기 도전 링크\n상위 1% 느낌 나는 게임 하나 보낸다. 몇 초 버티는지 해봐.\n${buildUrl({challenge:'1'})}`;
    await copyText(text,'도전 링크를 복사했어.');
  }

  function setChallengeBanner(){
    const url=new URL(window.location.href), challenge=url.searchParams.get('challenge'), score=url.searchParams.get('score'), time=url.searchParams.get('time');
    if(challenge && (score||time)){ challengeBanner.hidden=false; challengeBanner.textContent=`친구 기록 ${score||0}점 · ${time||0}초. 이 기록 넘기면 바로 공유각이다.`; }
    else if(challenge){ challengeBanner.hidden=false; challengeBanner.textContent='친구가 도전장을 보냈다. 몇 초 버티는지 바로 찍어봐.'; }
    else challengeBanner.hidden=true;
  }

  function endGame(win){
    running=false; cancelAnimationFrame(animationId); hideJoystick();
    const currentBest=Number(localStorage.getItem('bullet_dodge_best')||0);
    if(gameResult.score>currentBest){ localStorage.setItem('bullet_dodge_best',String(gameResult.score)); bestEl.textContent=String(gameResult.score); }
    if(win){ endTitle.textContent='30초 생존 성공'; endDesc.textContent=`끝까지 살아남았다.\n생존 점수 ${gameResult.score}점.\n이건 바로 공유해서 친구 반응 보는 기록이다.`; }
    else if(gameResult.time>=20){ endTitle.textContent='거의 다 왔다'; endDesc.textContent=`${gameResult.time.toFixed(1)}초 버텼다.\n여기서부터는 진짜 탄막 지옥이다.\n한 판 더 하면 30초 찍을 수 있다.`; }
    else { endTitle.textContent='격추됨'; endDesc.textContent=`${gameResult.time.toFixed(1)}초 버텼다.\n초반은 쉬워 보여도 금방 정신없어진다.\n다시 눌러서 기록 갱신해봐.`; }
    sharePreview.textContent=getShareCopy()+buildChallengeUrl(); endPanel.hidden=false; render();
  }

  function setKey(code,value){ if(code==='ArrowLeft'||code==='KeyA') input.left=value; if(code==='ArrowRight'||code==='KeyD') input.right=value; if(code==='ArrowUp'||code==='KeyW') input.up=value; if(code==='ArrowDown'||code==='KeyS') input.down=value; }

  function handleJoystickMove(clientX,clientY){
    const dx=clientX-joystick.originX, dy=clientY-joystick.originY, dist=Math.hypot(dx,dy), clamped=Math.min(dist,joystick.radius), angle=Math.atan2(dy,dx);
    const knobX=dist?Math.cos(angle)*clamped:0, knobY=dist?Math.sin(angle)*clamped:0;
    input.joyX=knobX/joystick.radius; input.joyY=knobY/joystick.radius;
    joystickKnob.style.transform=`translate(${knobX}px, ${knobY}px)`;
  }

  function blockedTopArea(y){ return y < 150; }

  function onPointerDown(e){
    if(!running || !mobileMode.active || joystick.active) return;
    if(e.pointerType && e.pointerType !== 'touch') return;
    if(blockedTopArea(e.clientY)) return;
    joystick.active=true; joystick.pointerId=e.pointerId;
    showJoystick(e.clientX,e.clientY); handleJoystickMove(e.clientX,e.clientY);
    e.preventDefault();
  }

  function onPointerMove(e){
    if(!joystick.active || e.pointerId !== joystick.pointerId) return;
    handleJoystickMove(e.clientX,e.clientY);
    e.preventDefault();
  }

  function onPointerUp(e){
    if(!joystick.active || e.pointerId !== joystick.pointerId) return;
    hideJoystick();
    e.preventDefault();
  }

  window.addEventListener('keydown',(e)=>{ if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space'].includes(e.code)) e.preventDefault(); setKey(e.code,true); if(!running && e.code==='Space') startGame(); });
  window.addEventListener('keyup',(e)=>setKey(e.code,false));
  window.addEventListener('resize',resize);

  document.addEventListener('pointerdown',onPointerDown,{passive:false});
  document.addEventListener('pointermove',onPointerMove,{passive:false});
  document.addEventListener('pointerup',onPointerUp,{passive:false});
  document.addEventListener('pointercancel',onPointerUp,{passive:false});

  startBtn.addEventListener('click',startGame);
  restartBtn.addEventListener('click',startGame);
  shareBtn.addEventListener('click',shareResult);
  copyResultBtn.addEventListener('click',()=>copyText(getShareCopy()+buildChallengeUrl(),'결과 링크를 복사했어.'));
  copyChallengeBtn.addEventListener('click',copyChallengeOnly);
  soundToggle.addEventListener('click',()=>{ state.soundOn=!state.soundOn; soundToggle.textContent=state.soundOn?'사운드 ON':'사운드 OFF'; });

  resize(); updateHud(); setChallengeBanner(); render();
})();