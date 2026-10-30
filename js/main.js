// 開始頁流程、情緒符號面板、手動切換
(() => {
  const EMOJI = {
    normal: ["😐", "正常"],
    happy: ["😄", "開心"],
    sad: ["😢", "傷心"],
    angry: ["😠", "憤怒"],
    none: ["🔍", "尋找中"],
  };

  const startScreen = document.getElementById("start-screen");
  const startBtn = document.getElementById("start-btn");
  const status = document.getElementById("status");
  const hud = document.getElementById("hud");
  const emojiEl = document.getElementById("mood-emoji");
  const labelEl = document.getElementById("mood-label");
  const confEl = document.getElementById("mood-conf");
  const manual = document.getElementById("manual");

  let auto = true;
  let shown = null;

  function showMood(key, confidence) {
    const [emoji, label] = EMOJI[key];
    if (key !== shown) {
      emojiEl.textContent = emoji;
      labelEl.textContent = label;
      emojiEl.classList.remove("pop");
      void emojiEl.offsetWidth; // 重新觸發動畫
      emojiEl.classList.add("pop");
      shown = key;
    }
    confEl.textContent = confidence ? `${Math.round(confidence * 100)}%` : "";
  }

  function enterMain() {
    startScreen.classList.add("fade");
    hud.classList.remove("hidden");
  }

  // 呼吸星空瓶：不需要鏡頭，返回時回到開始頁
  const breathBtn = document.getElementById("breath-btn");
  const breathScreen = document.getElementById("breath-screen");
  breathBtn.addEventListener("click", () => {
    startScreen.classList.add("fade");
    breathScreen.classList.remove("hidden");
    Sky.setMood("normal");
    Breath.open();
  });
  document.getElementById("breath-back").addEventListener("click", () => {
    Breath.close();
    breathScreen.classList.add("hidden");
    startScreen.classList.remove("fade");
  });

  // LINE、Facebook、Instagram 等 App 內建瀏覽器通常無法使用鏡頭
  const IN_APP = /Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent);

  // 鏡頭無法使用的原因，顯示在開始頁讓使用者知道怎麼處理
  function cameraError(e) {
    if (IN_APP) return "App 內建瀏覽器無法使用鏡頭，請點右上角選單，改用 Safari 或 Chrome 開啟";
    switch (e && e.name) {
      case "NoMediaDevices": return "這個瀏覽器無法使用鏡頭，請改用 Safari 或 Chrome 開啟";
      case "NotAllowedError":
      case "SecurityError": return "鏡頭權限被拒絕，請到瀏覽器或手機設定允許此網站使用相機，再重新整理";
      case "NotFoundError":
      case "OverconstrainedError": return "找不到可用的鏡頭";
      case "NotReadableError": return "鏡頭正被其他 App 使用，請關閉後再試";
      default: return `載入失敗（${(e && (e.message || e.name)) || "未知錯誤"}），請檢查網路後再試`;
    }
  }

  function manualMode() {
    enterMain();
    auto = false;
    manual.querySelector('[data-mood="auto"]')?.remove();
    manual.querySelector('[data-mood="normal"]').classList.add("active");
    showMood("normal");
    confEl.textContent = "手動模式";
  }

  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    breathBtn.disabled = true;
    status.textContent = "正在開啟鏡頭與載入模型…";
    try {
      await Emotion.init(document.getElementById("cam"));
      enterMain();
      Emotion.start(({ mood, scores }) => {
        if (!auto) return;
        if (mood) Sky.setMood(mood);
        showMood(mood || "none", mood && scores[mood]);
      });
    } catch (e) {
      console.error(e);
      // 留在開始頁說明原因，可重試或改用手動模式
      startBtn.disabled = false;
      breathBtn.disabled = false;
      status.innerHTML = "";
      const msg = document.createElement("span");
      msg.textContent = cameraError(e);
      const link = document.createElement("button");
      link.className = "link-btn";
      link.textContent = "不用鏡頭，手動切換天空";
      link.addEventListener("click", manualMode);
      status.append(msg, document.createElement("br"), link);
    }
  });

  manual.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    manual.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    const m = btn.dataset.mood;
    auto = m === "auto";
    if (!auto) {
      Sky.setMood(m);
      showMood(m);
    }
  });
})();
