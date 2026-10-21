/* ===========================================================================
   Turns the camera or the microphone into N numbers between 0 and 1, one per
   element of whichever shape is being hovered.

   camera — the frame is sampled into a small grid and each vertical band is
            compared with the previous frame. Standing still reads low, moving
            in front of the lens reads high.
   mic    — the spectrum is split into N bands, low frequencies on the left.

   Both auto-gain against a decaying peak, so the shapes react the same in a
   dark room or a quiet one. If permission is refused, or there is no device,
   `read` falls back to a slow idle sway and the page carries on as before.
   =========================================================================== */

const Sense = (() => {
  const GRID = { w: 48, h: 36 };     // the camera is sampled this small
  const EASE = 0.25;                 // smoothing per frame
  const DECAY = 0.995;               // how fast the auto-gain peak falls back

  let mode = null;                   // 'camera' | 'mic' | null
  let pending = null;
  let stream = null;
  let failed = false;

  let video, ctx, prev;              // camera
  let analyser, freq;                // mic

  let smooth = [];
  let peak = 0.02;

  async function use(which){
    if (mode === which || pending === which) return mode === which;
    pending = which;
    stop();
    try {
      if (which === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' }, audio: false
        });
        video = Object.assign(document.createElement('video'),
          { muted: true, playsInline: true, autoplay: true });
        video.srcObject = stream;
        await video.play();
        const cv = document.createElement('canvas');
        cv.width = GRID.w; cv.height = GRID.h;
        ctx = cv.getContext('2d', { willReadFrequently: true });
        prev = null;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state === 'suspended') await ac.resume();
        analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        ac.createMediaStreamSource(stream).connect(analyser);
        freq = new Uint8Array(analyser.frequencyBinCount);
      }
      mode = which; failed = false; peak = 0.02; smooth = [];
      return true;
    } catch (err) {
      // denied, dismissed, or no device — the shapes just sway instead
      console.warn(`[sense] ${which} unavailable:`, err.name);
      mode = null; failed = true;
      return false;
    } finally {
      pending = null;
    }
  }

  function stop(){
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; video = null; ctx = null; prev = null; analyser = null;
    mode = null;
  }

  /* motion energy per vertical band, mirrored so moving right moves the
     right-hand elements */
  function fromCamera(n){
    if (!video || video.readyState < 2) return null;
    ctx.drawImage(video, 0, 0, GRID.w, GRID.h);
    const now = ctx.getImageData(0, 0, GRID.w, GRID.h).data;
    const out = new Array(n).fill(0);
    if (prev) {
      const counts = new Array(n).fill(0);
      for (let y = 0; y < GRID.h; y++) {
        for (let x = 0; x < GRID.w; x++) {
          const i = (y * GRID.w + x) * 4;
          const lum  = (now[i] * 0.3 + now[i + 1] * 0.59 + now[i + 2] * 0.11);
          const was  = (prev[i] * 0.3 + prev[i + 1] * 0.59 + prev[i + 2] * 0.11);
          const b = Math.min(n - 1, Math.floor((1 - x / GRID.w) * n));   // mirrored
          out[b] += Math.abs(lum - was);
          counts[b]++;
        }
      }
      for (let b = 0; b < n; b++) out[b] = out[b] / (counts[b] * 255);
    }
    prev = now;
    return out;
  }

  function fromMic(n){
    if (!analyser) return null;
    analyser.getByteFrequencyData(freq);
    const top = Math.floor(freq.length * 0.45);     // most of the energy lives low
    const out = new Array(n).fill(0);
    for (let b = 0; b < n; b++) {
      const from = Math.floor((b / n) * top), to = Math.floor(((b + 1) / n) * top);
      let sum = 0;
      for (let i = from; i < to; i++) sum += freq[i];
      out[b] = sum / ((to - from) * 255);
    }
    return out;
  }

  function idle(n){
    const t = performance.now() / 1000;
    return Array.from({ length: n },
      (_, i) => 0.5 + 0.22 * Math.sin(t * 1.15 + i * 1.1));
  }

  /* n values in 0..1, smoothed and auto-gained. 0.5 is "nothing happening". */
  function read(n){
    if (smooth.length !== n) smooth = new Array(n).fill(0.5);

    let raw = mode === 'camera' ? fromCamera(n)
            : mode === 'mic'    ? fromMic(n)
            : null;

    if (!raw) {
      const sway = idle(n);
      smooth = smooth.map((s, i) => s + (sway[i] - s) * EASE);
      return smooth;
    }

    peak = Math.max(peak * DECAY, ...raw, 0.015);
    for (let i = 0; i < n; i++) {
      const v = Math.min(1, raw[i] / peak);
      smooth[i] += (v - smooth[i]) * EASE;
    }
    return smooth;
  }

  const active = () => mode !== null;

  return { use, stop, read, active, get failed(){ return failed; } };
})();
