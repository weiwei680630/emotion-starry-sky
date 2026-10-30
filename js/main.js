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

  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    breathBtn.disabled = true;
    status.textContent = "正在載入情緒辨識模型與鏡頭…";
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
      // 無鏡頭或拒絕權限：改用手動模式
      enterMain();
      auto = false;
      manual.querySelector('[data-mood="auto"]').remove();
      manual.querySelector('[data-mood="normal"]').classList.add("active");
      showMood("normal");
      confEl.textContent = "手動模式";
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
