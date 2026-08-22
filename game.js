/* 🍎 Fruit Catcher — vanilla JS HTML5 game
 * Dependency-free, Canvas + requestAnimationFrame, no frameworks/CDN.
 */
(function () {
  "use strict";

  // ---- DOM ----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const ambient = document.getElementById("ambient");
  const actx = ambient.getContext("2d");

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const comboEl = document.getElementById("combo");
  const livesEl = document.getElementById("lives");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const startBtn = document.getElementById("start-btn");
  const overlayHint = document.getElementById("overlay-hint");

  const BEST_KEY = "fruitCatcherBest";

  // ---- Palette ----
  const COLOR = {
    accent: "#5ef2a0",
    accent2: "#ffd56b",
    accent3: "#ff7d9c",
    danger: "#ff4d6d",
    life: "#ff6b8b",
    slow: "#7fd8ff",
    golden: "#ffd56b",
  };

  const FRUIT_COLORS = [
    "#ff5d5d", // apple red
    "#ff9f43", // orange
    "#7be36b", // lime
    "#b06bff", // grape
    "#ff7d9c", // berry
    "#ffd56b", // lemon
  ];

  // ---- Logical canvas size (CSS px) ----
  let W = 0;
  let H = 0;
  let dpr = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const arect = ambient.getBoundingClientRect();
    ambient.width = Math.round(arect.width * dpr);
    ambient.height = Math.round(arect.height * dpr);
    actx.setTransform(dpr, 0, 0, dpr, 0, 0);
    aw = arect.width;
    ah = arect.height;

    layoutBasket();
    initAmbient();
  }

  // ---- Game state ----
  const STATE = { MENU: "menu", PLAYING: "playing", PAUSED: "paused", OVER: "over" };
  let state = STATE.MENU;

  let best = loadBest();
  let score = 0;
  let combo = 0;
  let lives = 3;
  let gameTime = 0; // seconds elapsed while playing
  let spawnTimer = 0;
  let slowTimer = 0; // seconds of slow-motion remaining
  let flash = 0; // screen flash 0..1 (decays)
  let shake = 0; // screen shake magnitude (px)

  let basket = null;
  let items = [];
  let particles = [];
  let floaters = []; // floating score texts

  // Input
  const keys = Object.create(null);
  let pointerActive = false;
  let pointerX = 0;

  // Ambient orchard
  let aw = 0;
  let ah = 0;
  let fireflies = [];
  let leaves = [];

  function loadBest() {
    try {
      const v = parseInt(localStorage.getItem(BEST_KEY) || "0", 10);
      return Number.isFinite(v) && v > 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(v) {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch (e) {
      /* ignore */
    }
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }

  function speedMult() {
    return Math.min(3, 1 + gameTime * 0.025);
  }

  function layoutBasket() {
    const w = Math.max(72, W * 0.24);
    const h = Math.max(46, W * 0.16);
    const y = H - h - H * 0.04;
    if (!basket) {
      basket = { x: W / 2, w: w, h: h, y: y };
    } else {
      basket.w = w;
      basket.h = h;
      basket.y = y;
      basket.x = Math.max(w / 2, Math.min(W - w / 2, basket.x));
    }
  }

  function resetGame() {
    score = 0;
    combo = 0;
    lives = 3;
    gameTime = 0;
    spawnTimer = 0.6;
    slowTimer = 0;
    flash = 0;
    shake = 0;
    items = [];
    particles = [];
    floaters = [];
    layoutBasket();
    basket.x = W / 2;
    updateHUD();
  }

  function startGame() {
    resetGame();
    state = STATE.PLAYING;
    hideOverlay();
  }

  function pauseGame() {
    if (state !== STATE.PLAYING) return;
    state = STATE.PAUSED;
    showOverlay("⏸️ Paused", "Take a breath. The orchard will wait for you.", "Resume", "Space to resume");
  }

  function resumeGame() {
    if (state !== STATE.PAUSED) return;
    state = STATE.PLAYING;
    hideOverlay();
  }

  function gameOver() {
    state = STATE.OVER;
    let isBest = false;
    if (score > best) {
      best = Math.floor(score);
      saveBest(best);
      isBest = true;
    }
    updateHUD();
    const msg = isBest
      ? "🏆 New best! You filled the basket like a pro."
      : "The bombs got you this time. Try again!";
    showOverlay(
      "💥 Game Over",
      msg + "\n\nScore: " + Math.floor(score) + "   ·   Best: " + best,
      "Play Again",
      "Space / Enter to retry"
    );
  }

  // ---- Spawning ----
  function spawnEntity() {
    const x = rand(W * 0.08, W * 0.92);
    const r = rand(W * 0.032, W * 0.05);
    const bombChance = Math.min(0.34, 0.07 + gameTime * 0.006);
    const roll = Math.random();
    let type;
    if (roll < bombChance) type = "bomb";
    else if (roll < bombChance + 0.1) type = Math.random() < 0.45 ? "life" : "slow";
    else if (Math.random() < 0.14) type = "golden";
    else type = "fruit";

    const baseSpeed = H * 0.3 * speedMult();
    items.push({
      type: type,
      x: x,
      y: -r - 4,
      py: -r - 4,
      r: r,
      vx: rand(-W * 0.03, W * 0.03),
      vy: baseSpeed * rand(0.9, 1.15),
      rot: rand(0, Math.PI * 2),
      spin: rand(-2, 2),
      color: type === "fruit" ? pick(FRUIT_COLORS) : null,
      wob: rand(0, Math.PI * 2),
    });
  }

  // ---- Catch / effects ----
  function breakCombo() {
    if (combo !== 0) {
      combo = 0;
      updateHUD();
    }
  }

  function catchItem(it) {
    if (it.type === "bomb") {
      lives -= 1;
      combo = 0;
      flash = Math.max(flash, 0.7);
      shake = 16;
      spawnParticles(it.x, it.y, COLOR.danger, 20);
      addFloater(it.x, basket.y, "-1 ♥", COLOR.danger);
      if (lives <= 0) {
        updateHUD();
        gameOver();
        return;
      }
    } else if (it.type === "fruit") {
      combo += 1;
      const pts = Math.round(10 * (1 + Math.min(combo - 1, 20) * 0.1));
      score += pts;
      spawnParticles(it.x, it.y, it.color || COLOR.accent3, 12);
      addFloater(it.x, basket.y, "+" + pts, it.color || COLOR.accent3);
    } else if (it.type === "golden") {
      combo += 1;
      const pts = Math.round(35 * (1 + Math.min(combo - 1, 20) * 0.1));
      score += pts;
      spawnParticles(it.x, it.y, COLOR.golden, 24);
      flash = Math.max(flash, 0.3);
      addFloater(it.x, basket.y, "+" + pts + " ★", COLOR.golden);
    } else if (it.type === "life") {
      lives = Math.min(5, lives + 1);
      spawnParticles(it.x, it.y, COLOR.life, 16);
      flash = Math.max(flash, 0.3);
      addFloater(it.x, basket.y, "+1 ♥", COLOR.life);
    } else if (it.type === "slow") {
      slowTimer = Math.min(6, slowTimer + 5);
      spawnParticles(it.x, it.y, COLOR.slow, 16);
      flash = Math.max(flash, 0.3);
      addFloater(it.x, basket.y, "SLOW", COLOR.slow);
    }
    updateHUD();
  }

  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(40, 220);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: rand(0.4, 0.9),
        max: 0.9,
        r: rand(2, 5),
        color: color,
      });
    }
  }

  function addFloater(x, y, text, color) {
    floaters.push({ x: x, y: y, text: text, color: color, life: 1.0 });
  }

  // ---- Update ----
  function update(dt) {
    gameTime += dt;

    const slowFactor = slowTimer > 0 ? 0.45 : 1;
    const worldDt = dt * slowFactor;

    if (slowTimer > 0) slowTimer = Math.max(0, slowTimer - dt);
    if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
    if (shake > 0) shake = Math.max(0, shake - dt * 45);

    moveBasket(dt);

    // Spawn
    spawnTimer -= worldDt;
    if (spawnTimer <= 0) {
      spawnEntity();
      const interval = Math.max(0.45, 0.95 - gameTime * 0.012) * rand(0.8, 1.2);
      spawnTimer = interval;
    }

    const catchLine = basket.y + basket.h * 0.42;
    const left = basket.x - basket.w / 2;
    const right = basket.x + basket.w / 2;

    // Move items
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.py = it.y;
      it.y += it.vy * worldDt;
      it.x += it.vx * worldDt + Math.sin((gameTime + it.wob)) * W * 0.004 * worldDt;
      it.rot += it.spin * worldDt;

      // bounce off side walls
      if (it.x < it.r) {
        it.x = it.r;
        it.vx = Math.abs(it.vx);
      } else if (it.x > W - it.r) {
        it.x = W - it.r;
        it.vx = -Math.abs(it.vx);
      }

      // caught?
      if (
        it.py < catchLine &&
        it.y >= catchLine &&
        it.x > left &&
        it.x < right
      ) {
        catchItem(it);
        items.splice(i, 1);
        continue;
      }

      // fell past bottom
      if (it.y - it.r > H) {
        if (it.type === "fruit" || it.type === "golden") breakCombo();
        items.splice(i, 1);
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * worldDt;
      p.y += p.vy * worldDt;
      p.vy += 480 * worldDt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Floaters
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y -= 28 * dt;
      f.life -= dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  function moveBasket(dt) {
    const speed = W * 1.6;
    let dir = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) dir -= 1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) dir += 1;

    if (dir !== 0) {
      basket.x += dir * speed * dt;
      pointerActive = false; // keyboard wins
    } else if (pointerActive) {
      const tx = pointerX - basket.x;
      const step = speed * dt;
      if (Math.abs(tx) <= step) basket.x = pointerX;
      else basket.x += Math.sign(tx) * step;
    }

    basket.x = Math.max(basket.w / 2, Math.min(W - basket.w / 2, basket.x));
  }

  // ---- Rendering ----
  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (shake > 0) {
      ctx.translate(rand(-shake, shake), rand(-shake, shake));
    }

    // soft vignette so the CSS gradient shows through
    const g = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.1, W / 2, H * 0.5, H * 0.85);
    g.addColorStop(0, "rgba(6,18,12,0.08)");
    g.addColorStop(1, "rgba(3,8,5,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // slow-motion tint
    if (slowTimer > 0) {
      ctx.fillStyle = "rgba(127,216,255,0.07)";
      ctx.fillRect(0, 0, W, H);
    }

    // items
    for (const it of items) {
      if (it.type === "fruit") drawFruit(it);
      else if (it.type === "golden") drawGolden(it);
      else if (it.type === "bomb") drawBomb(it);
      else if (it.type === "life") drawLife(it);
      else if (it.type === "slow") drawSlow(it);
    }

    // basket
    drawBasket();

    // particles
    for (const p of particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // floaters
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "700 " + Math.round(W * 0.05) + "px system-ui, sans-serif";
    for (const f of floaters) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 12;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();

    // flash
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + (flash * 0.25).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  function glow(x, y, r, color, blur) {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFruit(it) {
    glow(it.x, it.y, 20, hexA(it.color, 0.5), 16);
    ctx.save();
    ctx.shadowColor = it.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // highlight
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(it.x - it.r * 0.32, it.y - it.r * 0.32, it.r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    // leaf
    ctx.save();
    ctx.translate(it.x, it.y - it.r);
    ctx.rotate(Math.sin(it.rot) * 0.5);
    ctx.fillStyle = COLOR.accent;
    ctx.beginPath();
    ctx.ellipse(it.r * 0.34, 0, it.r * 0.3, it.r * 0.15, Math.PI * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGolden(it) {
    glow(it.x, it.y, it.r * 2.4, hexA(COLOR.golden, 0.6), 18);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.rot);
    ctx.fillStyle = COLOR.golden;
    ctx.shadowColor = COLOR.golden;
    ctx.shadowBlur = 18;
    pathStar(0, 0, it.r, it.r * 0.45, 5);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(it.x - it.r * 0.2, it.y - it.r * 0.2, it.r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBomb(it) {
    glow(it.x, it.y, it.r * 2.2, hexA(COLOR.danger, 0.5), 16);
    const g = ctx.createRadialGradient(
      it.x - it.r * 0.3,
      it.y - it.r * 0.3,
      1,
      it.x,
      it.y,
      it.r
    );
    g.addColorStop(0, "#5a2230");
    g.addColorStop(1, "#180810");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
    ctx.fill();
    // highlight
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.arc(it.x - it.r * 0.3, it.y - it.r * 0.3, it.r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    // fuse
    ctx.strokeStyle = "#caa37a";
    ctx.lineWidth = Math.max(1.5, it.r * 0.12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(it.x, it.y - it.r);
    ctx.quadraticCurveTo(it.x + it.r * 0.5, it.y - it.r * 1.4, it.x + it.r * 0.3, it.y - it.r * 1.7);
    ctx.stroke();
    // spark
    const sx = it.x + it.r * 0.3;
    const sy = it.y - it.r * 1.7;
    glow(sx, sy, it.r * 0.6, "rgba(255,213,107,0.9)", 12);
    ctx.fillStyle = "#fff2b0";
    ctx.beginPath();
    ctx.arc(sx, sy, it.r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLife(it) {
    glow(it.x, it.y, it.r * 2.2, hexA(COLOR.life, 0.55), 16);
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.fillStyle = COLOR.life;
    ctx.shadowColor = COLOR.life;
    ctx.shadowBlur = 16;
    pathHeart(0, 0, it.r);
    ctx.fill();
    ctx.restore();
  }

  function drawSlow(it) {
    glow(it.x, it.y, it.r * 2.2, hexA(COLOR.slow, 0.55), 16);
    ctx.save();
    ctx.translate(it.x, it.y);
    // ring
    ctx.strokeStyle = COLOR.slow;
    ctx.lineWidth = Math.max(2, it.r * 0.16);
    ctx.shadowColor = COLOR.slow;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, it.r * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    // hands
    const a = it.rot;
    ctx.strokeStyle = COLOR.slow;
    ctx.lineWidth = Math.max(2, it.r * 0.12);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-Math.PI / 2) * it.r * 0.5, Math.sin(-Math.PI / 2) * it.r * 0.5);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * it.r * 0.7, Math.sin(a) * it.r * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  function drawBasket() {
    const x = basket.x;
    const y = basket.y;
    const w = basket.w;
    const h = basket.h;
    const topW = w;
    const botW = w * 0.74;

    ctx.save();
    // glow
    glow(x, y + h * 0.4, w * 0.7, "rgba(94,242,160,0.32)", 24);

    // body
    const grd = ctx.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, "#3aa872");
    grd.addColorStop(1, "#15583a");
    ctx.fillStyle = grd;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(x - topW / 2, y);
    ctx.lineTo(x + topW / 2, y);
    ctx.lineTo(x + botW / 2, y + h);
    ctx.lineTo(x - botW / 2, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // weave lines
    ctx.strokeStyle = "rgba(255,240,210,0.22)";
    ctx.lineWidth = 1.4;
    for (let i = 1; i < 4; i++) {
      const yy = y + h * (i / 4);
      const tw = topW + (botW - topW) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(x - tw / 2, yy);
      ctx.lineTo(x + tw / 2, yy);
      ctx.stroke();
    }
    // vertical weave
    ctx.strokeStyle = "rgba(255,240,210,0.14)";
    for (let i = 1; i < 4; i++) {
      const xx = x - topW / 2 + (topW * i) / 4;
      ctx.beginPath();
      ctx.moveTo(xx, y);
      const bx = x - botW / 2 + (botW * i) / 4;
      ctx.lineTo(bx, y + h);
      ctx.stroke();
    }

    // rim
    ctx.strokeStyle = COLOR.accent2;
    ctx.lineWidth = Math.max(3, w * 0.04);
    ctx.shadowColor = COLOR.accent2;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.ellipse(x, y, topW / 2, h * 0.13, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // shape paths (drawn at origin, caller translates)
  function pathStar(cx, cy, outer, inner, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function pathHeart(cx, cy, r) {
    ctx.beginPath();
    const top = cy - r * 0.35;
    ctx.moveTo(cx, cy + r * 0.7);
    ctx.bezierCurveTo(cx - r, cy - r * 0.2, cx - r * 0.5, top - r * 0.6, cx, top);
    ctx.bezierCurveTo(cx + r * 0.5, top - r * 0.6, cx + r, cy - r * 0.2, cx, cy + r * 0.7);
    ctx.closePath();
  }

  // convert "#rrggbb" + alpha -> "rgba(...)"
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  // ---- Ambient orchard background ----
  function initAmbient() {
    fireflies = [];
    leaves = [];
    const fn = Math.round((aw * ah) / 26000);
    for (let i = 0; i < fn; i++) {
      fireflies.push({
        x: Math.random() * aw,
        y: Math.random() * ah,
        r: rand(1.2, 3),
        vx: rand(-10, 10),
        vy: rand(-8, 8),
        phase: rand(0, Math.PI * 2),
        color: Math.random() < 0.5 ? "rgba(94,242,160,0.9)" : "rgba(255,213,107,0.9)",
      });
    }
    const ln = Math.round((aw * ah) / 60000);
    for (let i = 0; i < ln; i++) {
      leaves.push({
        x: Math.random() * aw,
        y: Math.random() * ah,
        r: rand(4, 8),
        vy: rand(12, 30),
        vx: rand(-8, 8),
        rot: rand(0, Math.PI * 2),
        spin: rand(-1, 1),
        color: pick(["rgba(94,242,160,0.5)", "rgba(255,213,107,0.45)", "rgba(255,125,156,0.4)"]),
      });
    }
  }

  function updateAmbient(dt) {
    actx.clearRect(0, 0, aw, ah);

    // fireflies
    for (const f of fireflies) {
      f.phase += dt * 2;
      f.x += (f.vx + Math.sin(f.phase) * 8) * dt;
      f.y += (f.vy + Math.cos(f.phase) * 8) * dt;
      if (f.x < -10) f.x = aw + 10;
      if (f.x > aw + 10) f.x = -10;
      if (f.y < -10) f.y = ah + 10;
      if (f.y > ah + 10) f.y = -10;
      const a = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(f.phase));
      actx.save();
      actx.globalCompositeOperation = "lighter";
      actx.fillStyle = f.color;
      actx.globalAlpha = a;
      actx.shadowColor = f.color;
      actx.shadowBlur = 10;
      actx.beginPath();
      actx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      actx.fill();
      actx.restore();
    }

    // drifting leaves
    for (const l of leaves) {
      l.y += l.vy * dt;
      l.x += (l.vx + Math.sin(l.y * 0.02) * 8) * dt;
      l.rot += l.spin * dt;
      if (l.y > ah + 12) {
        l.y = -12;
        l.x = Math.random() * aw;
      }
      actx.save();
      actx.translate(l.x, l.y);
      actx.rotate(l.rot);
      actx.fillStyle = l.color;
      actx.beginPath();
      actx.ellipse(0, 0, l.r, l.r * 0.5, 0, 0, Math.PI * 2);
      actx.fill();
      actx.restore();
    }
  }

  // ---- HUD ----
  function updateHUD() {
    scoreEl.textContent = Math.floor(score);
    bestEl.textContent = best;
    comboEl.textContent = "x" + Math.max(1, combo);
    livesEl.textContent = lives > 0 ? "❤".repeat(lives) : "—";
  }

  // ---- Overlay ----
  function showOverlay(title, text, btn, hint) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startBtn.textContent = btn;
    overlayHint.textContent = hint;
    overlay.classList.remove("hidden");
  }
  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  // ---- Main loop ----
  let last = 0;
  function frame(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05; // clamp to avoid tunneling on tab switch
    if (dt < 0) dt = 0;

    updateAmbient(dt); // background animates in every state

    if (state === STATE.PLAYING) {
      update(dt);
      draw();
    } else {
      draw(); // freeze frame / menu preview
    }
    requestAnimationFrame(frame);
  }

  // ---- Input ----
  function primaryAction() {
    if (state === STATE.MENU || state === STATE.OVER) startGame();
    else if (state === STATE.PAUSED) resumeGame();
    else if (state === STATE.PLAYING) pauseGame();
  }

  startBtn.addEventListener("click", primaryAction);

  window.addEventListener(
    "keydown",
    function (e) {
      const k = e.key;
      if (k === " " || k === "Spacebar" || k === "Enter") {
        e.preventDefault();
        primaryAction();
        return;
      }
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
        e.preventDefault();
      }
      keys[k] = true;
    },
    { passive: false }
  );

  window.addEventListener("keyup", function (e) {
    keys[e.key] = false;
  });

  // Pointer (mouse + touch)
  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    return {
      x: ((pt.clientX - rect.left) / rect.width) * W,
      y: ((pt.clientY - rect.top) / rect.height) * H,
    };
  }

  canvas.addEventListener("pointerdown", function (e) {
    if (state === STATE.PLAYING) {
      const p = pointerPos(e);
      pointerActive = true;
      pointerX = p.x;
    }
  });
  canvas.addEventListener("pointermove", function (e) {
    if (state === STATE.PLAYING && pointerActive) {
      const p = pointerPos(e);
      pointerX = p.x;
    }
  });
  window.addEventListener("pointerup", function () {
    pointerActive = false;
  });

  window.addEventListener("resize", function () {
    resize();
  });

  window.addEventListener("blur", function () {
    if (state === STATE.PLAYING) pauseGame();
    for (const k in keys) keys[k] = false;
  });

  // ---- Boot ----
  function boot() {
    resize();
    layoutBasket();
    updateHUD();
    showOverlay(
      "🍎 Fruit Catcher",
      "Move your basket to catch the falling fruit and build combos.\nDodge the bombs — three hits and it's game over. Grab power-ups for an edge. How high can you score?",
      "Start Game",
      "Move: Arrow keys / A · D · Space to pause · drag on touch"
    );
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
