// 星空特效引擎：依情緒在背景照片上疊加星光、雲、流星、雨、閃電
const Sky = (() => {
  const canvas = document.getElementById("sky");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;

  // 每種情緒對應的特效目標強度（0~1），實際值會平滑過渡
  const TARGETS = {
    normal: { thin: 1, boost: 0, dark: 0, rain: 0, storm: 0 },
    happy:  { thin: 0, boost: 1, dark: 0, rain: 0, storm: 0 },
    sad:    { thin: 0, boost: 0, dark: 1, rain: 1, storm: 0 },
    angry:  { thin: 0, boost: 0, dark: 1, rain: 0.35, storm: 1 },
  };
  const level = { thin: 1, boost: 0, dark: 0, rain: 0, storm: 0 };
  let mood = "normal";

  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------- 星星 ----------
  // 星色依真實恆星溫度：藍白、白、淡黃、淡橙，飽和度低
  const STAR_COLORS = ["205,220,255", "228,235,255", "255,255,255", "255,245,230", "255,228,200"];
  let stars = [];

  // ---------- 天空背景（程式產生：底色、銀河、星塵），整片天空緩慢旋轉 ----------
  const ROT_SPEED = (0.6 * Math.PI / 180) / 60; // 每分鐘約 0.6 度
  let D = 0;          // 背景邊長取螢幕對角線，旋轉時四角不會露出
  let skyImg = null, airglow = null;
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2; // 近似常態分布，標準差約 1

  function makeSky() {
    D = Math.ceil(Math.hypot(W, H));
    const c = document.createElement("canvas");
    c.width = c.height = D;
    const g = c.getContext("2d");

    // 底色：中央略亮的深藍
    const base = g.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
    base.addColorStop(0, "#0a1226");
    base.addColorStop(1, "#02040b");
    g.fillStyle = base;
    g.fillRect(0, 0, D, D);

    // 柔和的橢圓光斑，flat 越小越扁（沿銀河方向拉長）
    const blob = (x, y, r, color, a, flat = 1) => {
      g.save();
      g.translate(x, y);
      g.scale(1, flat);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, `rgba(${color},${a})`);
      grad.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = grad;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.restore();
    };

    // 銀河：斜穿畫面的光帶，中段較亮偏暖
    g.save();
    g.translate(D / 2, D / 2);
    g.rotate(-0.55);
    const bw = D * 0.12;
    const wave = (x) => bw * 0.12 * Math.sin(x / (D * 0.09)) + bw * 0.06 * Math.sin(x / (D * 0.031) + 1.7);
    for (let i = 0; i < 600; i++) {
      const x = rand(-D / 2, D / 2);
      const core = Math.exp(-((x / (D * 0.22)) ** 2));
      const warm = Math.random() < core * 0.7;
      blob(x, wave(x) + gauss() * bw * 0.32, rand(bw * 0.15, bw * 0.6),
        warm ? "255,215,175" : "160,185,255", 0.02 * (0.5 + core), rand(0.4, 0.8));
    }
    // 銀河中密集的微小星點
    for (let i = 0, n = (D * D) / 120; i < n; i++) {
      const x = rand(-D / 2, D / 2);
      g.fillStyle = `rgba(${STAR_COLORS[i % STAR_COLORS.length]},${rand(0.1, 0.55)})`;
      g.fillRect(x, wave(x) + gauss() * bw * 0.38, rand(0.6, 1.3), rand(0.6, 1.3));
    }
    // 暗帶（星際塵埃）：沿中線蜿蜒的細長暗紋，蓋在星點上
    for (let i = 0; i < 700; i++) {
      const x = rand(-D / 2, D / 2);
      blob(x, wave(x) + bw * 0.05 + gauss() * bw * 0.07, rand(bw * 0.05, bw * 0.16), "4,6,14", 0.09, rand(0.25, 0.45));
    }
    g.restore();

    // 全天的暗淡星塵
    for (let i = 0, n = (D * D) / 400; i < n; i++) {
      g.fillStyle = `rgba(${STAR_COLORS[i % STAR_COLORS.length]},${rand(0.06, 0.35)})`;
      g.fillRect(Math.random() * D, Math.random() * D, rand(0.5, 1.1), rand(0.5, 1.1));
    }
    skyImg = c;

    // 地平線附近的大氣輝光（不跟著旋轉）
    airglow = ctx.createLinearGradient(0, H * 0.55, 0, H);
    airglow.addColorStop(0, "rgba(30,45,80,0)");
    airglow.addColorStop(1, "rgba(45,60,100,0.35)");
  }

  // 柔和光暈貼圖，只畫一次
  const glow = document.createElement("canvas");
  glow.width = glow.height = 64;
  {
    const g = glow.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.25, "rgba(220,230,255,0.3)");
    grad.addColorStop(1, "rgba(220,230,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }

  function makeStars() {
    // 座標以畫面中心為原點，分布在整張旋轉背景上
    const n = Math.round((D * D) / 2200);
    stars = Array.from({ length: n }, () => {
      const m = Math.random() ** 3; // 暗星多、亮星少
      return {
        x: rand(-D / 2, D / 2),
        y: rand(-D / 2, D / 2),
        r: 0.5 + m * 1.3,
        base: 0.35 + m * 0.6,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
        // 閃爍：兩個不同頻率疊加，看起來不規律；幅度每顆不同
        amp: rand(0.35, 0.85),
        f1: rand(0.8, 2.2), f2: rand(3, 7),
        p1: rand(0, Math.PI * 2), p2: rand(0, Math.PI * 2),
        glint: 0, // 偶爾突然亮一下（大氣擾動造成的閃光）
        hi: false,
      };
    });
    // 開心時只增強幾顆較亮的星
    const bright = stars.filter((s) => s.r > 0.8).sort(() => Math.random() - 0.5);
    bright.slice(0, Math.floor(rand(6, 10))).forEach((s) => (s.hi = true));

    // 主星 1~2 顆：放在畫面上半部，平常就較亮，開心時特別明亮
    const count = Math.random() < 0.5 ? 1 : 2;
    let side = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < count; i++, side = -side) {
      stars.push({
        x: side * rand(W * 0.08, W * 0.35),
        y: rand(-H * 0.38, -H * 0.1),
        r: rand(1.7, 2.1),
        base: 0.9,
        color: i ? STAR_COLORS[0] : STAR_COLORS[3],
        amp: 0.15, // 主星閃爍較穩定
        f1: rand(0.6, 1.2), f2: rand(3, 5),
        p1: rand(0, Math.PI * 2), p2: rand(0, Math.PI * 2),
        glint: 0,
        hi: false,
        main: true,
      });
    }
  }

  function drawStars(t, dt) {
    const boost = level.boost;
    const dim = 1 - level.dark * 0.9;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(t * ROT_SPEED);
    ctx.drawImage(skyImg, -D / 2, -D / 2);
    const mx = W / 2 + 10, my = H / 2 + 10;
    const cos = Math.cos(t * ROT_SPEED), sin = Math.sin(t * ROT_SPEED);
    for (const s of stars) {
      if (dim <= 0.02) break;
      // 只畫轉到螢幕內的星
      const sx = s.x * cos - s.y * sin, sy = s.x * sin + s.y * cos;
      if (Math.abs(sx) > mx || Math.abs(sy) > my) continue;
      const n = 0.6 * Math.sin(t * s.f1 + s.p1) + 0.4 * Math.sin(t * s.f2 + s.p2); // -1~1
      if (Math.random() < dt * 0.04) s.glint = 1;
      else if (s.glint > 0) s.glint = Math.max(0, s.glint - dt * 3);
      let a = s.base * (1 - s.amp * (0.5 - 0.5 * n));
      a = (a + (1 - a) * 0.75 * s.glint) * dim;
      let r = s.r;
      let g = s.r > 1.1 ? 0.2 : 0; // 亮星本來就帶一點光暈
      if (s.hi && boost > 0.01) {
        a = Math.min(1, a + 0.3 * boost * dim);
        r *= 1 + 0.35 * boost;
        g += 0.25 * boost;
      }
      if (s.main) {
        a = Math.min(1, a + 0.3 * boost * dim);
        r *= 1 + 0.9 * boost;
        g = 0.35 + 1.1 * boost;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${s.color})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (g > 0) {
        const size = r * (s.main ? 16 : 8);
        ctx.globalAlpha = a * g;
        ctx.drawImage(glow, s.x - size / 2, s.y - size / 2, size, size);
      }
      // 主星開心時加上淡淡的四道星芒
      if (s.main && boost > 0.01) {
        const len = r * 12 * boost;
        ctx.globalAlpha = a * 0.6 * boost;
        ctx.lineWidth = 1;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const grad = ctx.createLinearGradient(s.x - dx * len, s.y - dy * len, s.x + dx * len, s.y + dy * len);
          grad.addColorStop(0, `rgba(${s.color},0)`);
          grad.addColorStop(0.5, `rgba(${s.color},1)`);
          grad.addColorStop(1, `rgba(${s.color},0)`);
          ctx.strokeStyle = grad;
          ctx.beginPath();
          ctx.moveTo(s.x - dx * len, s.y - dy * len);
          ctx.lineTo(s.x + dx * len, s.y + dy * len);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.fillStyle = airglow;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- 雲 ----------
  // 預先把雲畫成離屏圖，執行時只需貼圖，效能較好
  // 以一半解析度繪製（雲本來就是模糊的），貼圖時再放大，節省記憶體
  function makeCloudSprite(w, h, color, puffs) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(w / 2); c.height = Math.ceil(h / 2);
    const g = c.getContext("2d");
    g.scale(0.5, 0.5);
    for (let i = 0; i < puffs; i++) {
      const x = rand(w * 0.15, w * 0.85);
      const y = rand(h * 0.35, h * 0.65);
      const r = rand(h * 0.2, h * 0.5);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${color}, 0.55)`);
      grad.addColorStop(0.6, `rgba(${color}, 0.25)`);
      grad.addColorStop(1, `rgba(${color}, 0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  let thinClouds = [], darkClouds = [];
  function makeClouds() {
    thinClouds = Array.from({ length: 4 }, () => newThinCloud(true));
    darkClouds = Array.from({ length: Math.ceil(W / 140) + 8 }, () => {
      const w = rand(W * 0.4, W * 0.8);
      const h = w * rand(0.35, 0.5);
      return {
        img: makeCloudSprite(w, h, Math.random() < 0.5 ? "28,32,42" : "45,50,62", 14),
        x: rand(-w * 0.5, W),
        y: rand(-h * 0.5, H * 0.55),
        vx: rand(4, 12),
        w, h,
      };
    });
  }
  function newThinCloud(initial) {
    const w = rand(W * 0.35, W * 0.7);
    const h = w * rand(0.18, 0.3);
    return {
      img: makeCloudSprite(w, h, "200,215,235", 10),
      x: initial ? rand(-w, W) : -w - rand(0, W * 0.8), // 偶爾才飄進畫面
      y: rand(H * 0.05, H * 0.7),
      vx: rand(5, 14),
      alpha: rand(0.1, 0.4),
      w, h,
    };
  }

  function drawClouds(dt) {
    // 正常：薄雲，每朵透明度隨機 10~40%
    if (level.thin > 0.01) {
      thinClouds.forEach((c, i) => {
        c.x += c.vx * dt;
        if (c.x > W) thinClouds[i] = newThinCloud(false);
        ctx.globalAlpha = c.alpha * level.thin;
        ctx.drawImage(c.img, c.x, c.y, c.w, c.h);
      });
    }
    // 傷心／憤怒：烏雲密布
    if (level.dark > 0.01) {
      ctx.globalAlpha = level.dark * 0.75;
      ctx.fillStyle = level.storm > 0.5 ? "rgb(18,10,22)" : "rgb(10,14,22)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = level.dark;
      for (const c of darkClouds) {
        c.x += c.vx * dt * (1 + level.storm);
        if (c.x > W) c.x = -c.w;
        ctx.drawImage(c.img, c.x, c.y, c.w, c.h);
      }
      if (level.storm > 0.01) {
        ctx.globalAlpha = level.storm * 0.18;
        ctx.fillStyle = "rgb(90,20,50)";
        ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 流星 ----------
  let meteors = [], nextMeteor = 1;
  function updateMeteors(dt) {
    nextMeteor -= dt;
    if (nextMeteor <= 0 && level.boost > 0.6) {
      const ang = rand(18, 22) * Math.PI / 180; // 往左下，與水平約 20 度
      const speed = rand(700, 1200);
      meteors.push({
        x: rand(W * 0.4, W * 1.05), y: rand(-20, H * 0.4),
        vx: -Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        life: 0, max: rand(0.7, 1.3), len: rand(120, 260),
      });
      nextMeteor = rand(1.5, 5);
    }
    meteors = meteors.filter((m) => (m.life += dt) < m.max);
    for (const m of meteors) {
      m.x += m.vx * dt; m.y += m.vy * dt;
      const p = m.life / m.max;
      const a = Math.sin(p * Math.PI) * level.boost;
      const sp = Math.hypot(m.vx, m.vy);
      const tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
      const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.3, `rgba(170,210,255,${a * 0.6})`);
      grad.addColorStop(1, "rgba(120,160,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
      const head = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 8);
      head.addColorStop(0, `rgba(255,255,255,${a})`);
      head.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = head;
      ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- 雨 ----------
  let drops = [];
  function updateRain(dt) {
    const want = Math.round(level.rain * (W * H) / 2500);
    while (drops.length < want) drops.push(newDrop(true));
    if (drops.length > want) drops.length = want;
    if (!drops.length) return;
    ctx.strokeStyle = "rgba(170,190,220,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    drops.forEach((d, i) => {
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.y > H) drops[i] = newDrop(false);
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.vx * 0.03, d.y - d.vy * 0.03);
    });
    ctx.stroke();
  }
  function newDrop(initial) {
    return {
      x: rand(-W * 0.1, W * 1.1),
      y: initial ? rand(-H, H) : rand(-60, -10),
      vx: -rand(60, 120),
      vy: rand(700, 1000),
    };
  }

  // ---------- 閃電 ----------
  let bolt = null, flash = 0, nextBolt = 1.5;
  // 中點位移法產生鋸齒線段（固定 2^iters 段，不會無限增長）
  function jagged(x1, y1, x2, y2, iters, branch) {
    let segs = [[x1, y1, x2, y2, branch]];
    let off = Math.hypot(x2 - x1, y2 - y1) * 0.2;
    for (let k = 0; k < iters; k++) {
      const next = [];
      for (const [ax, ay, bx, by] of segs) {
        const mx = (ax + bx) / 2 + rand(-off, off);
        const my = (ay + by) / 2 + rand(-off, off) * 0.3;
        next.push([ax, ay, mx, my, branch], [mx, my, bx, by, branch]);
      }
      segs = next;
      off /= 2;
    }
    return segs;
  }

  // 主幹 64 段 + 2~4 條分岔各 16 段，總數最多約 130 段
  function makeBolt(x1, y1, x2, y2) {
    const main = jagged(x1, y1, x2, y2, 6, false);
    const segs = [...main];
    const branches = Math.floor(rand(2, 5));
    for (let i = 0; i < branches; i++) {
      const [sx, sy, ex, ey] = main[Math.floor(rand(8, main.length * 0.7))];
      const ang = Math.atan2(ey - sy, ex - sx) + rand(-0.9, 0.9);
      const len = Math.hypot(x2 - x1, y2 - y1) * rand(0.15, 0.35);
      segs.push(...jagged(sx, sy, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len, 4, true));
    }
    return segs;
  }
  function updateStorm(dt) {
    nextBolt -= dt;
    if (nextBolt <= 0 && level.storm > 0.6) {
      const x = rand(W * 0.15, W * 0.85);
      bolt = { segs: makeBolt(x, rand(-10, H * 0.15), x + rand(-W * 0.2, W * 0.2), rand(H * 0.6, H)), life: 0 };
      flash = 1;
      nextBolt = rand(2, 6);
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(220,225,255,${flash * 0.45 * level.storm})`;
      ctx.fillRect(0, 0, W, H);
      flash -= dt * 2.5;
    }
    if (bolt) {
      bolt.life += dt;
      // 閃爍兩下後消失
      const on = bolt.life < 0.12 || (bolt.life > 0.2 && bolt.life < 0.35);
      if (on) {
        ctx.lineCap = "round";
        for (const [pass, w, col] of [[0, 8, "rgba(160,140,255,0.25)"], [1, 2, "rgba(255,255,255,0.95)"]]) {
          ctx.strokeStyle = col;
          ctx.shadowColor = "rgba(180,160,255,0.9)";
          ctx.shadowBlur = pass ? 12 : 0;
          for (const isBranch of [false, true]) {
            ctx.lineWidth = isBranch ? w * 0.5 : w;
            ctx.beginPath();
            for (const s of bolt.segs) {
              if (s[4] !== isBranch) continue;
              ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]);
            }
            ctx.stroke();
          }
        }
        ctx.shadowBlur = 0;
      }
      if (bolt.life > 0.45) bolt = null;
    }
  }

  // ---------- 主迴圈 ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeSky();
    makeStars();
    makeClouds();
    drops = [];
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    // 約 1.5 秒平滑過渡到目標強度
    const target = TARGETS[mood];
    const k = 1 - Math.exp(-dt * 2.5);
    for (const key in level) level[key] += (target[key] - level[key]) * k;

    ctx.clearRect(0, 0, W, H);
    drawStars(t, dt);
    updateMeteors(dt);
    drawClouds(dt);
    updateRain(dt);
    updateStorm(dt);
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);

  return {
    setMood(m) { if (TARGETS[m]) mood = m; },
    getMood() { return mood; },
  };
})();
