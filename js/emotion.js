// 情緒辨識：@vladmandic/face-api（TinyFaceDetector + faceExpressionNet），底層 TensorFlow.js，全部在瀏覽器本機執行
const Emotion = (() => {
  const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/";

  const INTERVAL = 120;  // 每 120 ms 偵測一次
  const ALPHA = 0.35;    // EMA 新樣本權重
  const HOLD_MS = 900;   // 新情緒需連續領先 900 ms 才切換，避免閃爍

  let video, options, onChange;
  let smoothed = null;
  let current = null, candidate = null, candidateSince = 0;
  let timer = 0, running = false;

  async function init(videoEl) {
    video = videoEl;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw Object.assign(new Error("no getUserMedia"), { name: "NoMediaDevices" });
    }
    // 先開鏡頭：權限詢問立刻跳出，失敗原因也比較明確
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    // 手機（尤其 iPhone 低耗電模式）不會自動播放，要明確呼叫 play()
    await video.play().catch(() => {});
    if (video.readyState < 2) await new Promise((r) => (video.onloadeddata = r));

    // WebGL 加速；部分手機不支援時退回 CPU（較慢但能用）
    const ok = await faceapi.tf.setBackend("webgl").catch(() => false);
    if (!ok) await faceapi.tf.setBackend("cpu");
    await faceapi.tf.ready();
    // 返回後再次進入時，模型已載入就不必重載
    if (!faceapi.nets.faceExpressionNet.isLoaded) await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
  }

  // 7 種表情合併成 4 種情緒，並正規化成總和為 1
  // 模型容易把傷心、憤怒判成 neutral，所以這兩種額外加權
  function scoreMoods(e) {
    const raw = {
      normal: e.neutral,
      happy: e.happy + e.surprised * 0.4,
      sad: (e.sad + e.fearful * 0.6) * 2.0,
      angry: (e.angry + e.disgusted) * 1.6,
    };
    const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
    for (const k in raw) raw[k] /= sum;
    return raw;
  }

  async function tick() {
    const result = await faceapi.detectSingleFace(video, options).withFaceExpressions();
    if (!result) {
      smoothed = null;
      onChange({ mood: null, scores: null, face: null });
      return;
    }

    const scores = scoreMoods(result.expressions);
    if (!smoothed) smoothed = scores;
    else for (const k in smoothed) smoothed[k] = smoothed[k] * (1 - ALPHA) + scores[k] * ALPHA;

    const [top] = Object.entries(smoothed).sort((a, b) => b[1] - a[1])[0];
    const now = performance.now();
    if (current === null || top === current) {
      current = top; candidate = null;
    } else if (top !== candidate) {
      candidate = top; candidateSince = now;
    } else if (now - candidateSince >= HOLD_MS) {
      current = top; candidate = null;
    }
    onChange({ mood: current, scores: { ...smoothed }, face: result.detection });
  }

  function start(cb) {
    onChange = cb;
    running = true;
    const loop = async () => {
      try { await tick(); } catch (e) { console.warn(e); }
      if (running) timer = setTimeout(loop, INTERVAL);
    };
    loop();
  }

  // 停止偵測並關閉鏡頭
  function stop() {
    running = false;
    clearTimeout(timer);
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    smoothed = null;
    current = null;
    candidate = null;
  }

  return { init, start, stop };
})();
