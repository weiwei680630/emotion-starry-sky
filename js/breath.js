// 呼吸引導：呼吸星空瓶。黑暗中一瓶裝著夜空的玻璃瓶，像呼吸燈一樣隨吸吐明暗；
// 每完成一次呼吸，右上角的星星進度條點亮一顆
const Breath = (() => {
  // 各節奏的階段：[名稱, 秒數]
  const PATTERNS = {
    calm: [["吸氣", 4], ["吐氣", 6]],
    box: [["吸氣", 4], ["停住", 4], ["吐氣", 4], ["停住", 4]],
    relax: [["吸氣", 4], ["停住", 7], ["吐氣", 8]],
  };
  const ROUNDS = 10;  // 點亮 10 顆星即完成
  const PREP = 3;     // 開始前倒數秒數
  const STAR_COLORS = ["200,220,255", "225,235,255", "255,255,255", "255,236,205"];
  const NEBULA_COLORS = ["70,120,255", "120,95,235", "60,165,225", "150,125,255"];

  const screen = document.getElementById("breath-screen");
  const canvas = document.getElementById("jar");
  const ctx = canvas.getContext("2d");
  const phaseEl = document.getElementById("breath-phase");
  const countEl = document.getElementById("breath-count");
  const lineEl = document.querySelector("#breath-line span");
  const barEl = document.getElementById("star-bar");
  const toggleBtn = document.getElementById("breath-toggle");
  const patternBox = document.getElementById("breath-patterns");

  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = (p) => 0.5 - 0.5 * Math.cos(Math.PI * p);

  // 瓶子先畫在 layer 上，再複製一份到 mirror 做桌面倒影
  const layer = document.createElement("canvas");
  const lctx = layer.getContext("2d");
  const mirror = document.createElement("canvas");
  const mctx = mirror.getContext("2d");
  let nebula = null;

  let pattern = PATTERNS.calm;
  let state = "idle"; // idle | prep | breathing | done
  let paused = false;
  let phaseIdx = 0, phaseT = 0, round = 0;
  let glow = 0;  // 呼吸燈亮度 0~1，吸氣變亮、吐氣變暗
  let stars = [], motes = [], sparks = [], dust = [], pores = [];
  let w = 0, h = 0, dpr = 1, raf = 0, last = 0;

  // 星星光暈貼圖
  const glowImg = document.createElement("canvas");
  glowImg.width = glowImg.height = 64;
  {
    const g = glowImg.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.3, "rgba(190,215,255,0.25)");
    grad.addColorStop(1, "rgba(190,215,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }

  // ---------- 素材 ----------
  // 瓶內星空、上升光點、瓶外浮塵、軟木塞紋理；座標都用比例表示，畫布縮放時不用重建
  function makeParticles() {
    stars = Array.from({ length: 170 }, () => {
      const big = Math.random() < 0.08;
      return {
        sx: rand(-0.5, 0.5), sy: rand(0, 1),
        r: big ? rand(1.1, 1.7) : rand(0.35, 0.9), big,
        base: rand(0.35, 1), f: rand(0.6, 2.4), ph: rand(0, Math.PI * 2),
        color: STAR_COLORS[Math.floor(rand(0, 3))],
      };
    });
    motes = Array.from({ length: 26 }, () => ({ sx: rand(-0.42, 0.42), sy: rand(0, 1), r: rand(0.5, 1.1), sp: rand(0.6, 1.4) }));
    dust = Array.from({ length: 60 }, () => ({
      x: Math.random(), y: Math.random(), r: rand(0.4, 1.2),
      vx: rand(-0.004, 0.004), vy: rand(-0.006, 0.002), ph: rand(0, Math.PI * 2),
    }));
    pores = Array.from({ length: 22 }, () => {
      const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * 0.85;
      return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: rand(0.4, 1.1) };
    });
  }

  // 瓶內星雲：一次畫好，之後只做緩慢漂移
  function makeNebula(g) {
    const nw = g.bodyW * 1.3, nh = (g.bottom - g.rimY) * 1.1;
    nebula = document.createElement("canvas");
    nebula.width = Math.ceil(nw * dpr);
    nebula.height = Math.ceil(nh * dpr);
    const c = nebula.getContext("2d");
    c.scale(dpr, dpr);
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 46; i++) {
      // 沿斜帶分布，像瓶裡裝了一小段銀河
      const t = Math.random();
      const x = nw * (0.15 + 0.7 * t) + rand(-1, 1) * nw * 0.12;
      const y = nh * (0.85 - 0.6 * t) + rand(-1, 1) * nh * 0.12;
      const r = rand(0.12, 0.36) * g.bodyW;
      const col = NEBULA_COLORS[Math.floor(rand(0, NEBULA_COLORS.length))];
      const grad = c.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${col},${rand(0.05, 0.11)})`);
      grad.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = grad;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }

  // ---------- 幾何 ----------
  function geom() {
    const bodyW = Math.min(w * 0.38, h * 0.345);
    const cx = w / 2;
    const g = { cx, bodyW, L: cx - bodyW / 2, R: cx + bodyW / 2 };
    g.neckW = bodyW * 0.46;
    g.corkTop = h * 0.09;
    g.rimY = g.corkTop + bodyW * 0.13;
    g.rimRy = g.neckW * 0.14;
    g.neckBottom = g.rimY + bodyW * 0.17;
    g.shoulder = g.neckBottom + bodyW * 0.26;
    g.bottom = h * 0.68;
    g.ry = bodyW * 0.12;      // 瓶底透視橢圓
    g.bulge = bodyW * 0.035;  // 瓶身微微鼓起
    g.baseTop = g.bottom - bodyW * 0.07;
    g.midY = (g.shoulder + g.bottom) / 2;
    return g;
  }

  function jarPath(g) {
    const p = new Path2D();
    const nl = g.cx - g.neckW / 2, nr = g.cx + g.neckW / 2;
    const k = g.shoulder - g.neckBottom, b = g.bottom - g.ry - g.shoulder;
    p.moveTo(nl, g.rimY);
    p.lineTo(nl, g.neckBottom);
    p.bezierCurveTo(nl, g.neckBottom + k * 0.5, g.L, g.neckBottom + k * 0.3, g.L, g.shoulder);
    p.bezierCurveTo(g.L - g.bulge, g.shoulder + b * 0.35, g.L - g.bulge, g.shoulder + b * 0.75, g.L, g.bottom - g.ry);
    p.ellipse(g.cx, g.bottom - g.ry, g.bodyW / 2, g.ry, 0, Math.PI, 0, true);
    p.bezierCurveTo(g.R + g.bulge, g.shoulder + b * 0.75, g.R + g.bulge, g.shoulder + b * 0.35, g.R, g.shoulder);
    p.bezierCurveTo(g.R, g.neckBottom + k * 0.3, nr, g.neckBottom + k * 0.5, nr, g.neckBottom);
    p.lineTo(nr, g.rimY);
    p.ellipse(g.cx, g.rimY, g.neckW / 2, g.rimRy, 0, 0, Math.PI, false);
    p.closePath();
    return p;
  }

  // ---------- 繪製 ----------
  function drawStar(c, x, y, r, a, color, spikes) {
    const size = r * 8;
    c.globalAlpha = a * 0.6;
    c.drawImage(glowImg, x - size / 2, y - size / 2, size, size);
    c.globalAlpha = a;
    c.fillStyle = `rgb(${color})`;
    c.beginPath();
    if (spikes) {
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 - Math.PI / 2;
        const rr = i % 2 ? r * 0.4 : r * 1.8;
        c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
    } else {
      c.arc(x, y, r, 0, Math.PI * 2);
    }
    c.fill();
  }

  // 沿弧線的柔和反光（兩端淡出）
  function streak(c, pts, width, alpha) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = pts;
    const grad = c.createLinearGradient(0, y0, 0, y3);
    grad.addColorStop(0, "rgba(235,245,255,0)");
    grad.addColorStop(0.2, `rgba(235,245,255,${alpha})`);
    grad.addColorStop(0.7, `rgba(235,245,255,${alpha})`);
    grad.addColorStop(1, "rgba(235,245,255,0)");
    c.strokeStyle = grad;
    c.lineWidth = width;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(x0, y0);
    c.bezierCurveTo(x1, y1, x2, y2, x3, y3);
    c.stroke();
  }

  function renderJar(g, t, light) {
    const c = lctx;
    c.clearRect(0, 0, w, h);
    const path = jarPath(g);
    const innerTop = g.rimY, innerH = g.baseTop - innerTop;

    // ---- 瓶內：夜空 ----
    c.save();
    c.clip(path);
    const bg = c.createRadialGradient(g.cx, g.midY, 0, g.cx, g.midY, g.bodyW * 0.8);
    bg.addColorStop(0, `rgba(${16 + 20 * light},${32 + 40 * light},${80 + 70 * light},0.92)`);
    bg.addColorStop(1, "rgba(3,7,20,0.95)");
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    c.globalCompositeOperation = "lighter";
    // 星雲緩慢漂移
    const drift = Math.sin(t * 0.07) * g.bodyW * 0.04;
    c.globalAlpha = 0.25 + 0.75 * light;
    c.drawImage(nebula, g.cx - g.bodyW * 0.65 + drift, g.rimY - innerH * 0.02, g.bodyW * 1.3, (g.bottom - g.rimY) * 1.1);

    for (const s of stars) {
      const x = g.cx + s.sx * g.bodyW;
      const y = g.baseTop - s.sy * innerH;
      const tw = 0.65 + 0.35 * Math.sin(t * s.f + s.ph);
      const a = s.base * tw * (0.15 + 0.85 * light);
      if (s.big) drawStar(c, x, y, s.r, a, s.color, true);
      else {
        c.globalAlpha = a;
        c.fillStyle = `rgb(${s.color})`;
        c.fillRect(x - s.r, y - s.r, s.r * 2, s.r * 2);
      }
    }
    // 緩緩上升的光點，吸氣時升得快
    for (const m of motes) {
      const a = Math.sin(Math.PI * m.sy) * (0.2 + 0.6 * light);
      drawStar(c, g.cx + m.sx * g.bodyW, g.baseTop - m.sy * innerH, m.r, a, "200,225,255", false);
    }
    // 完成一輪時升起的亮點
    for (const s of sparks) {
      const a = Math.sin(Math.PI * Math.min(1, s.life / s.max));
      drawStar(c, g.cx + s.sx * g.bodyW, g.baseTop - s.sy * innerH, s.r, a, "235,242,255", true);
    }

    // 玻璃邊緣：內側壓暗（厚度感），再加上被內部光照亮的邊緣光
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.lineWidth = g.bodyW * 0.16;
    c.strokeStyle = "rgba(2,5,15,0.5)";
    c.stroke(path);
    c.globalCompositeOperation = "lighter";
    c.lineWidth = g.bodyW * 0.035;
    c.strokeStyle = `rgba(110,170,255,${0.06 + 0.26 * light})`;
    c.stroke(path);

    // 厚玻璃瓶底
    c.fillStyle = `rgba(100,155,255,${0.05 + 0.16 * light})`;
    c.beginPath();
    c.ellipse(g.cx, g.bottom - g.ry, g.bodyW / 2, g.ry, 0, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = "rgba(200,225,255,0.18)";
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(g.cx, g.baseTop - g.ry, g.bodyW * 0.47, g.ry * 0.9, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();

    // ---- 玻璃表面 ----
    c.globalAlpha = 1;
    c.strokeStyle = "rgba(190,215,255,0.3)";
    c.lineWidth = 1.1;
    c.stroke(path);

    // 瓶口（後半圈）
    const lipRx = g.neckW / 2 + g.bodyW * 0.03, lipRy = g.rimRy + g.bodyW * 0.012;
    c.fillStyle = "rgba(200,225,255,0.07)";
    c.beginPath();
    c.ellipse(g.cx, g.rimY, lipRx, lipRy, 0, 0, Math.PI * 2);
    c.ellipse(g.cx, g.rimY, g.neckW / 2 - 1, g.rimRy - 1, 0, 0, Math.PI * 2, true);
    c.fill();
    c.strokeStyle = "rgba(210,230,255,0.3)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(g.cx, g.rimY, lipRx, lipRy, 0, Math.PI, Math.PI * 2);
    c.stroke();

    drawCork(c, g, light);

    // 瓶口（前半圈，蓋在軟木塞前面）
    c.strokeStyle = "rgba(215,235,255,0.55)";
    c.lineWidth = 1.4;
    c.beginPath();
    c.ellipse(g.cx, g.rimY, lipRx, lipRy, 0, 0, Math.PI);
    c.stroke();
    c.strokeStyle = "rgba(215,235,255,0.22)";
    c.beginPath();
    c.ellipse(g.cx, g.rimY + 2, g.neckW / 2 - 1, g.rimRy - 1, 0, 0.1 * Math.PI, 0.9 * Math.PI);
    c.stroke();

    drawTwine(c, g);

    // 反光：順著瓶身弧線
    const b = g.bottom - g.ry - g.shoulder;
    const hx = g.L + g.bodyW * 0.09;
    streak(c, [hx + 2, g.shoulder + g.bodyW * 0.03, hx - g.bulge, g.shoulder + b * 0.35, hx - g.bulge, g.shoulder + b * 0.7, hx + 2, g.bottom - g.ry - g.bodyW * 0.06], g.bodyW * 0.045, 0.26);
    const hx2 = hx + g.bodyW * 0.07;
    streak(c, [hx2, g.shoulder + g.bodyW * 0.05, hx2 - g.bulge * 0.6, g.shoulder + b * 0.2, hx2 - g.bulge * 0.6, g.shoulder + b * 0.35, hx2, g.shoulder + b * 0.48], 1.2, 0.4);
    const rx = g.R - g.bodyW * 0.075;
    streak(c, [rx, g.shoulder + b * 0.15, rx + g.bulge, g.shoulder + b * 0.4, rx + g.bulge, g.shoulder + b * 0.7, rx, g.bottom - g.ry - g.bodyW * 0.1], g.bodyW * 0.016, 0.13);
    const nx = g.cx - g.neckW * 0.3;
    streak(c, [nx, g.rimY + g.rimRy + 3, nx, g.rimY + g.bodyW * 0.1, nx, g.neckBottom, nx - 2, g.neckBottom + g.bodyW * 0.04], 1.5, 0.3);

    // 瓶肩高光：沿著瓶肩弧度的細長亮點
    c.save();
    c.translate(g.L + g.bodyW * 0.15, g.shoulder - g.bodyW * 0.05);
    c.rotate(-0.75);
    c.scale(1, 0.28);
    const spot = c.createRadialGradient(0, 0, 0, 0, 0, g.bodyW * 0.06);
    spot.addColorStop(0, "rgba(245,250,255,0.6)");
    spot.addColorStop(1, "rgba(245,250,255,0)");
    c.fillStyle = spot;
    c.beginPath();
    c.arc(0, 0, g.bodyW * 0.06, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // 瓶底邊緣聚光
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = `rgba(130,190,255,${0.15 + 0.5 * light})`;
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(g.cx, g.bottom - g.ry, g.bodyW / 2 - 1, g.ry - 1, 0, Math.PI * 0.12, Math.PI * 0.88);
    c.stroke();
    c.globalCompositeOperation = "source-over";
  }

  function drawCork(c, g, light) {
    const topW = g.neckW * 1.02, botW = g.neckW * 0.9;
    const top = g.corkTop, bot = g.rimY + g.bodyW * 0.075;
    const cry = topW * 0.14;
    const side = new Path2D();
    side.moveTo(g.cx - topW / 2, top);
    side.lineTo(g.cx - botW / 2, bot);
    side.ellipse(g.cx, bot, botW / 2, cry * 0.9, 0, Math.PI, 0, true);
    side.lineTo(g.cx + topW / 2, top);
    side.closePath();

    const wood = c.createLinearGradient(g.cx - topW / 2, 0, g.cx + topW / 2, 0);
    wood.addColorStop(0, "#3a281b");
    wood.addColorStop(0.22, "#8c6844");
    wood.addColorStop(0.4, "#ad8760");
    wood.addColorStop(0.75, "#6e5034");
    wood.addColorStop(1, "#2e2015");
    c.fillStyle = wood;
    c.fill(side);

    c.save();
    c.clip(side);
    // 塞進瓶頸的部分隔著玻璃，顏色較冷較暗；下緣被瓶內藍光照到
    c.fillStyle = "rgba(15,30,70,0.4)";
    c.fillRect(0, g.rimY, w, bot - g.rimY + cry);
    const blue = c.createLinearGradient(0, bot + cry, 0, g.rimY - g.bodyW * 0.02);
    blue.addColorStop(0, `rgba(80,140,255,${0.15 + 0.35 * light})`);
    blue.addColorStop(1, "rgba(80,140,255,0)");
    c.fillStyle = blue;
    c.fillRect(0, top, w, bot - top + cry);
    c.restore();

    // 塞子頂面與氣孔紋理
    const topGrad = c.createRadialGradient(g.cx - topW * 0.15, top - cry * 0.3, 0, g.cx, top, topW * 0.6);
    topGrad.addColorStop(0, "#c9a67e");
    topGrad.addColorStop(1, "#8a6847");
    c.fillStyle = topGrad;
    c.beginPath();
    c.ellipse(g.cx, top, topW / 2, cry, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(70,48,30,0.55)";
    for (const p of pores) {
      c.beginPath();
      c.ellipse(g.cx + p.x * topW / 2, top + p.y * cry, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  // 繞在瓶頸的麻繩與繩結
  function drawTwine(c, g) {
    const y1 = g.rimY + g.bodyW * 0.06, y2 = y1 + g.bodyW * 0.028;
    c.strokeStyle = "rgba(190,158,118,0.9)";
    c.lineWidth = 1.6;
    for (const y of [y1, y2]) {
      c.beginPath();
      c.ellipse(g.cx, y, g.neckW / 2 + 1, g.rimRy * 0.9, 0, 0.04 * Math.PI, 0.96 * Math.PI);
      c.stroke();
    }
    const kx = g.cx + g.neckW * 0.36, ky = (y1 + y2) / 2 + g.rimRy * 0.7;
    c.fillStyle = "rgba(190,158,118,0.95)";
    c.beginPath();
    c.ellipse(kx, ky, 2.6, 2, 0, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(kx, ky);
    c.quadraticCurveTo(kx + g.bodyW * 0.03, ky + g.bodyW * 0.06, kx + g.bodyW * 0.015, ky + g.bodyW * 0.12);
    c.moveTo(kx, ky);
    c.quadraticCurveTo(kx + g.bodyW * 0.07, ky + g.bodyW * 0.04, kx + g.bodyW * 0.07, ky + g.bodyW * 0.1);
    c.stroke();
  }

  function draw(t) {
    const g = geom();
    // 呼吸燈：亮度歸零時整個瓶子連同光暈、倒影、浮塵全暗
    const light = glow;
    const vis = Math.min(1, light * 1.6);
    renderJar(g, t, light);

    ctx.clearRect(0, 0, w, h);

    // 藍色呼吸光暈
    const halo = ctx.createRadialGradient(g.cx, g.midY, 0, g.cx, g.midY, Math.min(w, h) * 0.5);
    halo.addColorStop(0, `rgba(60,120,255,${0.26 * light})`);
    halo.addColorStop(0.4, `rgba(40,90,230,${0.09 * light})`);
    halo.addColorStop(1, "rgba(30,70,200,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // 桌面上的光池
    ctx.save();
    ctx.translate(g.cx, g.bottom);
    ctx.scale(1, 0.16);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, g.bodyW * 1.3);
    pool.addColorStop(0, `rgba(80,140,255,${0.38 * light})`);
    pool.addColorStop(1, "rgba(80,140,255,0)");
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, g.bodyW * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 桌面倒影：複製瓶子、由下往上淡出後上下翻轉
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, mirror.width, mirror.height);
    mctx.drawImage(layer, 0, 0);
    mctx.globalCompositeOperation = "destination-in";
    const fade = mctx.createLinearGradient(0, g.bottom * dpr, 0, (g.bottom - g.bodyW * 0.7) * dpr);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    mctx.fillStyle = fade;
    mctx.fillRect(0, 0, mirror.width, mirror.height);
    mctx.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.globalAlpha = 0.2 * vis;
    ctx.translate(0, g.bottom * 2);
    ctx.scale(1, -1);
    ctx.drawImage(mirror, 0, 0, w, h);
    ctx.restore();

    ctx.globalAlpha = vis;
    ctx.drawImage(layer, 0, 0, w, h);
    ctx.globalAlpha = 1;

    // 被藍光照到的浮塵，離瓶子越近越亮
    ctx.fillStyle = "rgb(190,215,255)";
    const reach = Math.min(w, h) * 0.5;
    for (const d of dust) {
      const x = d.x * w, y = d.y * h;
      const dist = Math.hypot(x - g.cx, y - g.midY);
      const a = light * 0.55 * Math.max(0, 1 - dist / reach) * (0.6 + 0.4 * Math.sin(t * 0.8 + d.ph));
      if (a < 0.01) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 星星進度條 ----------
  function buildBar() {
    barEl.innerHTML = "";
    for (let i = 0; i < ROUNDS; i++) {
      const s = document.createElement("span");
      s.className = "bar-star";
      s.appendChild(document.createElement("i"));
      barEl.appendChild(s);
    }
  }
  function setBar(n) {
    [...barEl.children].forEach((s, i) => s.classList.toggle("on", i < n));
    barEl.setAttribute("aria-label", `已點亮 ${n} / ${ROUNDS} 顆星`);
  }

  // ---------- 呼吸流程 ----------
  let shownPhase = "", shownCount = "";
  function show(phase, count, soft = false) {
    if (phase !== shownPhase) {
      phaseEl.textContent = shownPhase = phase;
      phaseEl.classList.toggle("soft", soft);
      phaseEl.classList.remove("swap");
      void phaseEl.offsetWidth; // 重新觸發淡入
      phaseEl.classList.add("swap");
    }
    if (count !== shownCount) countEl.textContent = shownCount = count;
  }

  function update(dt, t) {
    for (const m of motes) {
      m.sy += dt * m.sp * (0.015 + 0.05 * glow);
      if (m.sy > 1) { m.sy = 0; m.sx = rand(-0.42, 0.42); }
    }
    sparks = sparks.filter((s) => (s.life += dt) < s.max);
    for (const s of sparks) s.sy += dt * s.v;
    for (const d of dust) {
      d.x = (d.x + d.vx * dt + 1) % 1;
      d.y = (d.y + d.vy * dt + 1) % 1;
    }

    if (paused) return;
    // 未開始或完成後：像待機的呼吸燈一樣緩慢明暗
    if (state === "idle" || state === "done") {
      glow += (0.3 + 0.2 * Math.sin(t * 0.8) - glow) * Math.min(1, dt * 2);
      return;
    }
    phaseT += dt;
    if (state === "prep") {
      glow += (0 - glow) * Math.min(1, dt * 2); // 準備時先暗下來
      if (phaseT < PREP) return show("準備", String(Math.ceil(PREP - phaseT)));
      state = "breathing";
      phaseIdx = 0;
      phaseT = 0;
    }

    let [name, sec] = pattern[phaseIdx];
    if (phaseT >= sec) {
      phaseT -= sec;
      if (++phaseIdx >= pattern.length) {
        phaseIdx = 0;
        completeRound();
        if (round >= ROUNDS) return finish();
      }
      [name, sec] = pattern[phaseIdx];
    }
    const p = Math.min(1, phaseT / sec);
    if (name === "吸氣") glow = ease(p);
    else if (name === "吐氣") glow = 1 - ease(p);
    lineEl.style.transform = `scaleX(${glow.toFixed(3)})`;
    show(name, String(Math.ceil(sec - phaseT)));
  }

  function completeRound() {
    round++;
    setBar(round);
    for (let i = 0; i < 9; i++) {
      sparks.push({ sx: rand(-0.35, 0.35), sy: rand(0.02, 0.3), v: rand(0.12, 0.3), r: rand(1, 1.8), life: 0, max: rand(1.2, 2) });
    }
  }

  function setRunning(on) {
    screen.classList.toggle("running", on);
  }

  function finish() {
    state = "done";
    setRunning(false);
    show("星空瓶裝滿了", "做得很好，慢慢回到現在");
    toggleBtn.textContent = "再來一次";
  }

  function reset() {
    state = "idle";
    paused = false;
    phaseIdx = 0; phaseT = 0; round = 0;
    sparks = [];
    setBar(0);
    setRunning(false);
    lineEl.style.transform = "scaleX(0)";
    show("選一個節奏，準備好就開始", "", true);
    toggleBtn.textContent = "開始";
  }

  toggleBtn.addEventListener("click", () => {
    if (state === "idle" || state === "done") {
      if (state === "done") reset();
      state = "prep";
      phaseT = 0;
      setRunning(true);
      toggleBtn.textContent = "暫停";
    } else {
      paused = !paused;
      toggleBtn.textContent = paused ? "繼續" : "暫停";
      if (paused) show("暫停中", "", true);
    }
  });

  patternBox.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    patternBox.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    pattern = PATTERNS[btn.dataset.pattern];
    reset();
  });

  // ---------- 開關 ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width; h = rect.height;
    for (const c of [canvas, layer, mirror]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeNebula(geom());
  }

  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    update(dt, now / 1000);
    draw(now / 1000);
    raf = requestAnimationFrame(loop);
  }

  function open() {
    makeParticles();
    buildBar();
    reset();
    glow = 0.3;
    resize();
    window.addEventListener("resize", resize);
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function close() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    reset();
  }

  return { open, close };
})();
