// 情緒辨識：@vladmandic/face-api（TinyFaceDetector + faceExpressionNet），底層 TensorFlow.js，全部在瀏覽器本機執行
const Emotion = (() => {
  const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/";

  const INTERVAL = 120;  // 每 120 ms 偵測一次
  const ALPHA = 0.35;    // EMA 新樣本權重
  const HOLD_MS = 900;   // 新情緒需連續領先 900 ms 才切換，避免閃爍

  let video, options, onChange;
  let smoothed = null;
  let current = null, candidate = null, candidateSince = 0;

  async function init(videoEl) {
    video = videoEl;
    await faceapi.tf.setBackend("webgl"); // WebGL 加速
    await faceapi.tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise((r) => (video.onloadeddata = r));
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
    const loop = async () => {
      try { await tick(); } catch (e) { console.warn(e); }
      setTimeout(loop, INTERVAL);
    };
    loop();
  }

  return { init, start };
})();
