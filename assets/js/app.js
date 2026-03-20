(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const timeEl = document.getElementById('time');
  const levelEl = document.getElementById('level');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const challengeBanner = document.getElementById('challengeBanner');

  const startPanel = document.getElementById('startPanel');
  const endPanel = document.getElementById('endPanel');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const shareBtn = document.getElementById('shareBtn');
  const copyResultBtn = document.getElementById('copyResultBtn');
  const copyChallengeBtn = document.getElementById('copyChallengeBtn');
  const endTitle = document.getElementById('endTitle');
  const endDesc = document.getElementById('endDesc');
  const sharePreview = document.getElementById('sharePreview');
  const soundToggle = document.getElementById('soundToggle');

  const joystickWrap = document.getElementById('joystickWrap');
  const joystickBase = document.getElementById('joystickBase');
  const joystickKnob = document.getElementById('joystickKnob');

  let w = 0;
  let h = 0;
  let dpr = 1;
  let running = false;
  let animationId = null;
  let lastTime = 0;
  let elapsed = 0;
  let spawnTimer = 0;
  let bossTimer = 0;
  let stars = [];
  let bullets = [];
  let particles = [];
  let gameResult = { score: 0, time: 0 };

  const bestScore = Number(localStorage.getItem('bullet_dodge_best') || 0);
  bestEl.textContent = String(bestScore);

  const state = {
    soundOn: true
  };

  const input = {
    left: false,
    right: false,
    up: false,
    down: false,
    joyX: 0,
    joyY: 0
  };

  const joystick = {
    active: false,
    touchId: null,
    radius: 42,
    knobX: 0,
    knobY: 0,
    centerX: 0,
    centerY: 0
  };

  const plane = {
    x: 0,
    y: 0,
    radius: 14,
    speed: 290,
    flash: 0,
    angle: 0
  };

  const audioCtx = (() => {
    try { return new (window.AudioContext || window.webkitAudioContext)(); }
    catch (_) { return null; }
  })();

  function beep(freq, duration, type = 'square', gainValue = 0.03) {
    if (!state.soundOn || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  }

  function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  function updateJoystickCenter() {
    const rect = joystickBase.getBoundingClientRect();
    joystick.centerX = rect.left + rect.width / 2;
    joystick.centerY = rect.top + rect.height / 2;
    resetJoystickKnob();
  }

  function resetJoystickKnob() {
    joystick.active = false;
    joystick.touchId = null;
    input.joyX = 0;
    input.joyY = 0;
    joystickKnob.style.transform = 'translate(0px, 0px)';
  }

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initStars();
    if (!running) resetPlane();
    requestAnimationFrame(() => {
      if (isTouchDevice()) updateJoystickCenter();
      render();
    });
  }

  function initStars() {
    stars = Array.from({ length: Math.max(40, Math.floor((w * h) / 17000)) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 40 + 10,
      alpha: Math.random() * 0.6 + 0.2
    }));
  }

  function resetPlane() {
    plane.x = w / 2;
    plane.y = h * 0.78;
    plane.flash = 0;
    plane.angle = 0;
  }

  function resetGame() {
    elapsed = 0;
    spawnTimer = 0;
    bossTimer = 0;
    bullets = [];
    particles = [];
    resetPlane();
    resetJoystickKnob();
    updateHud();
  }

  function getDifficulty(t) {
    return Math.min(8, 1 + Math.floor(t / 4));
  }

  function getSpawnInterval(t) {
    return Math.max(0.11, 0.52 - t * 0.012);
  }

  function spawnBullet() {
    const difficulty = getDifficulty(elapsed);
    const edge = Math.floor(Math.random() * 4);
    const margin = 36;
    let x, y;

    if (edge === 0) { x = Math.random() * w; y = -margin; }
    else if (edge === 1) { x = w + margin; y = Math.random() * h; }
    else if (edge === 2) { x = Math.random() * w; y = h + margin; }
    else { x = -margin; y = Math.random() * h; }

    const angle = Math.atan2(plane.y - y, plane.x - x);
    const spreadBase = Math.max(0.08, 0.84 - difficulty * 0.08);
    const spread = (Math.random() - 0.5) * spreadBase;
    const speed = 120 + difficulty * 25 + Math.random() * 75;
    const radius = Math.random() < 0.14 ? 10 : 6 + Math.random() * 3;

    bullets.push({
      x, y,
      vx: Math.cos(angle + spread) * speed,
      vy: Math.sin(angle + spread) * speed,
      radius,
      color: '#ff6f83'
    });

    if (difficulty >= 4 && Math.random() < 0.22) {
      const burst = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < burst; i++) {
        const a = angle + (-0.45 + (0.9 * i) / Math.max(1, burst - 1));
        bullets.push({
          x, y,
          vx: Math.cos(a) * speed * 0.75,
          vy: Math.sin(a) * speed * 0.75,
          radius: 4.5,
          color: '#ff9db2'
        });
      }
    }
  }

  function spawnBossPattern() {
    if (elapsed < 20) return;
    const centerX = Math.random() * (w * 0.6) + w * 0.2;
    const centerY = -20;
    const count = 18;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + elapsed * 0.8;
      const speed = 120 + (i % 3) * 18;
      bullets.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 70,
        radius: 5.5,
        color: '#ffd166'
      });
    }
    beep(220, 0.18, 'sawtooth', 0.04);
  }

  function spawnExplosion(x, y, color) {
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 190 + 40;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 2,
        life: Math.random() * 0.55 + 0.35,
        maxLife: Math.random() * 0.55 + 0.35,
        color
      });
    }
  }

  function update(dt) {
    elapsed += dt;
    if (elapsed >= 30) {
      elapsed = 30;
      gameResult = { score: Math.floor(elapsed * 10), time: elapsed };
      updateHud();
      endGame(true);
      return;
    }

    const keyboardX = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const keyboardY = (input.up ? -1 : 0) + (input.down ? 1 : 0);
    const moveX = keyboardX + input.joyX;
    const moveY = keyboardY + input.joyY;
    const len = Math.hypot(moveX, moveY) || 1;

    plane.x += (moveX / len) * plane.speed * dt;
    plane.y += (moveY / len) * plane.speed * dt;
    plane.x = Math.max(22, Math.min(w - 22, plane.x));
    plane.y = Math.max(72, Math.min(h - 22, plane.y));
    plane.flash = Math.max(0, plane.flash - dt * 3.5);
    plane.angle = Math.max(-0.22, Math.min(0.22, moveX * 0.12));

    spawnTimer += dt;
    while (spawnTimer >= getSpawnInterval(elapsed)) {
      spawnTimer -= getSpawnInterval(elapsed);
      spawnBullet();
      if (Math.random() < 0.28) beep(120 + Math.random() * 40, 0.04, 'square', 0.012);
    }

    bossTimer += dt;
    if (bossTimer >= 2.6) {
      bossTimer = 0;
      spawnBossPattern();
    }

    for (const star of stars) {
      star.y += star.speed * dt;
      if (star.y > h + 4) {
        star.y = -4;
        star.x = Math.random() * w;
      }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      const dx = b.x - plane.x;
      const dy = b.y - plane.y;
      const hitDist = b.radius + plane.radius - 2;

      if (dx * dx + dy * dy <= hitDist * hitDist) {
        plane.flash = 1;
        spawnExplosion(plane.x, plane.y, '#ff7b7b');
        beep(90, 0.25, 'sawtooth', 0.06);
        gameResult = { score: Math.floor(elapsed * 10), time: elapsed };
        endGame(false);
        return;
      }

      if (b.x < -90 || b.x > w + 90 || b.y < -90 || b.y > h + 90) {
        bullets.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      if (p.life <= 0) particles.splice(i, 1);
    }

    updateHud();
  }

  function updateHud() {
    timeEl.textContent = (30 - elapsed).toFixed(1);
    levelEl.textContent = String(getDifficulty(elapsed));
    scoreEl.textContent = String(Math.floor(elapsed * 10));
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#07111f');
    grad.addColorStop(0.5, '#0b1730');
    grad.addColorStop(1, '#040914');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    for (const star of stars) {
      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = '#dbe8ff';
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let y = 0; y < h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  function drawPlane() {
    ctx.save();
    ctx.translate(plane.x, plane.y);
    ctx.rotate(plane.angle);
    ctx.shadowBlur = 22;
    ctx.shadowColor = plane.flash > 0 ? 'rgba(255,100,100,0.95)' : 'rgba(90, 194, 255, 0.8)';

    ctx.fillStyle = plane.flash > 0 ? '#ff9d9d' : '#86d2ff';
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(13, 16);
    ctx.lineTo(0, 9);
    ctx.lineTo(-13, 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(4, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-4, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffbe50';
    ctx.beginPath();
    ctx.moveTo(-5, 16);
    ctx.lineTo(0, 28 + Math.sin(performance.now() * 0.02) * 2);
    ctx.lineTo(5, 16);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawBullets() {
    for (const b of bullets) {
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = b.color;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    drawBackground();
    drawBullets();
    drawParticles();
    drawPlane();
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    render();
    if (running) animationId = requestAnimationFrame(loop);
  }

  function startGame() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    resetGame();
    running = true;
    startPanel.hidden = true;
    endPanel.hidden = true;
    lastTime = performance.now();
    beep(520, 0.07, 'triangle', 0.03);
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
  }

  function resultText() {
    const score = gameResult.score;
    const time = gameResult.time.toFixed(1);
    return `나는 30초 비행기 총알 피하기에서 ${score}점을 기록했어.\n${time}초 버텼는데 너는 이길 수 있어?\n`;
  }

  function buildUrl(params) {
    const url = new URL(window.location.href);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  }

  function buildChallengeUrl() {
    return buildUrl({
      challenge: '1',
      score: String(gameResult.score || 0),
      time: String((gameResult.time || 0).toFixed(1))
    });
  }

  async function copyText(text, successMsg) {
    try {
      await navigator.clipboard.writeText(text);
      alert(successMsg);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      alert(successMsg);
    }
  }

  async function shareResult() {
    const url = buildChallengeUrl();
    const text = resultText() + url;
    if (navigator.share) {
      try {
        await navigator.share({
          title: '30초 비행기 총알 피하기',
          text,
          url
        });
        return;
      } catch (_) {}
    }
    await copyText(text, '결과 링크를 복사했어. 친구에게 바로 보내면 된다.');
  }

  async function copyChallengeOnly() {
    const text = `30초 비행기 총알 피하기 도전 링크\n${buildUrl({ challenge: '1' })}`;
    await copyText(text, '도전 링크를 복사했어.');
  }

  function setChallengeBanner() {
    const url = new URL(window.location.href);
    const challenge = url.searchParams.get('challenge');
    const score = url.searchParams.get('score');
    const time = url.searchParams.get('time');

    if (challenge && (score || time)) {
      challengeBanner.hidden = false;
      challengeBanner.textContent = `친구 기록: ${score || 0}점 / ${time || 0}초. 너는 이길 수 있어?`;
    } else if (challenge) {
      challengeBanner.hidden = false;
      challengeBanner.textContent = '친구가 도전 링크를 보냈다. 30초를 버텨서 이겨봐.';
    } else {
      challengeBanner.hidden = true;
    }
  }

  function endGame(win) {
    running = false;
    cancelAnimationFrame(animationId);
    resetJoystickKnob();

    const currentBest = Number(localStorage.getItem('bullet_dodge_best') || 0);
    if (gameResult.score > currentBest) {
      localStorage.setItem('bullet_dodge_best', String(gameResult.score));
      bestEl.textContent = String(gameResult.score);
    }

    endTitle.textContent = win ? '생존 성공' : '격추됨';
    endDesc.textContent = win
      ? `30초 생존 성공.\n점수 ${gameResult.score}점.\n이제 친구에게 공유해서 기록 경쟁을 걸어봐.`
      : `${gameResult.time.toFixed(1)}초 버텼다.\n점수 ${gameResult.score}점.\n다시 하거나 친구에게 도전 링크를 보낼 수 있어.`;

    sharePreview.textContent = resultText() + buildChallengeUrl();
    endPanel.hidden = false;
    render();
  }

  function setKey(code, value) {
    if (code === 'ArrowLeft' || code === 'KeyA') input.left = value;
    if (code === 'ArrowRight' || code === 'KeyD') input.right = value;
    if (code === 'ArrowUp' || code === 'KeyW') input.up = value;
    if (code === 'ArrowDown' || code === 'KeyS') input.down = value;
  }

  function handleJoystickMove(clientX, clientY) {
    const dx = clientX - joystick.centerX;
    const dy = clientY - joystick.centerY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, joystick.radius);
    const angle = Math.atan2(dy, dx);
    const knobX = dist ? Math.cos(angle) * clamped : 0;
    const knobY = dist ? Math.sin(angle) * clamped : 0;

    input.joyX = knobX / joystick.radius;
    input.joyY = knobY / joystick.radius;
    joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
  }

  function onTouchStart(e) {
    if (!running) return;
    if (!isTouchDevice()) return;
    if (joystick.active) return;

    const rect = joystickWrap.getBoundingClientRect();

    for (const touch of e.changedTouches) {
      const inside =
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom;

      if (inside) {
        joystick.active = true;
        joystick.touchId = touch.identifier;
        handleJoystickMove(touch.clientX, touch.clientY);
        e.preventDefault();
        break;
      }
    }
  }

  function onTouchMove(e) {
    if (!joystick.active) return;
    for (const touch of e.touches) {
      if (touch.identifier === joystick.touchId) {
        handleJoystickMove(touch.clientX, touch.clientY);
        e.preventDefault();
        break;
      }
    }
  }

  function onTouchEnd(e) {
    if (!joystick.active) return;
    for (const touch of e.changedTouches) {
      if (touch.identifier === joystick.touchId) {
        resetJoystickKnob();
        break;
      }
    }
  }

  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space'].includes(e.code)) {
      e.preventDefault();
    }
    setKey(e.code, true);
    if (!running && e.code === 'Space') startGame();
  });

  window.addEventListener('keyup', (e) => {
    setKey(e.code, false);
  });

  window.addEventListener('resize', resize);

  document.addEventListener('touchstart', onTouchStart, { passive: false });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: false });
  document.addEventListener('touchcancel', onTouchEnd, { passive: false });

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);
  shareBtn.addEventListener('click', shareResult);
  copyResultBtn.addEventListener('click', () => copyText(resultText() + buildChallengeUrl(), '결과 링크를 복사했어.'));
  copyChallengeBtn.addEventListener('click', copyChallengeOnly);

  soundToggle.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    soundToggle.textContent = state.soundOn ? '사운드 ON' : '사운드 OFF';
  });

  resize();
  updateHud();
  setChallengeBanner();
  render();
})();