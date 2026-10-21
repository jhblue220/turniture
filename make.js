/* ===========================================================================
   "Let's Make …" — drop an image or a sound (or take one live), turn it into
   a piece, and look at it from the top or in 3D.

   The analysis follows the prototype in `코딩 2`:
     a frame is { vol, depth } — loudness / saturation drives the DIAMETER,
     pitch / lightness drives the HEIGHT. Both are placed by their RANK inside
     this one recording rather than by their raw value, so a quiet take and a
     loud one both use the full range instead of bunching up at one end.

   Drawing is new. The prototype renders shaded meshes; here the piece is
   drawn flat in the page's own two colours, and each form is the same
   silhouette the item already uses on the picker page — a round-bottomed bar
   for the Side Table, a cone for the Tray.
   =========================================================================== */

const PRODUCTS = {
  'side-table': {
    name: 'Side Table',
    site: 400,                 // round site, mm
    layout: 'radial',          // golden-angle spiral out from the middle
    form: 'capsule',           // straight column, rounded at the bottom
    width: [50, 150],
    height: [200, 700],
    align: 'top',              // flat tops share a plane, round ends hang
    count: 36,
    legs: 4,                   // the outermost four run full height
    rankHeights: false
  },
  tray: {
    name: 'Tray',
    site: 260,
    layout: 'grid',            // 3 x 3
    form: 'cone',              // point down, flat disc on top
    width: [60, 130],
    height: [40, 160],
    align: 'bottom',           // every point touches the floor
    count: 9,
    rankHeights: true          // otherwise the heights bunch together
  }
};

const Make = (() => {
  const page     = document.querySelector('.page--make');
  const nameEl   = page.querySelector('[data-make-name]');
  const io       = page.querySelector('[data-step="io"]');
  const out      = page.querySelector('[data-step="out"]');
  const fileBox  = page.querySelector('.drop[data-kind="file"]');
  const liveBox  = page.querySelector('.drop[data-kind="live"]');
  const fileIn   = page.querySelector('[data-file]');
  const dropLbl  = page.querySelector('[data-drop-label]');
  const liveLbl  = page.querySelector('[data-live-label]');
  const cam      = page.querySelector('.drop__cam');
  const cv       = page.querySelector('[data-canvas]');
  const tl       = page.querySelector('[data-timeline]');
  const vbtns    = [...page.querySelectorAll('.vbtn[data-view]')];

  let prod = null, kind = 'images';     // 'images' | 'sounds'
  let shapes = [];                      // { w, h, x, y } in mm
  let view = 'top';
  let head = 0;                         // timeline position, 0..shapes.length-1
  let stream = null, recorder = null, chunks = [];

  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ── frames ─────────────────────────────────────────────────────────────── */

  /* rank of v inside a sorted list, 0..1 — ties share a rank */
  function pct(sorted, v){
    const n = sorted.length;
    if (n < 2) return 0.5;
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; sorted[m] < v ? lo = m + 1 : hi = m; }
    let lo2 = lo, hi2 = n;
    while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; sorted[m] <= v ? lo2 = m + 1 : hi2 = m; }
    return clamp(((lo + lo2 - 1) / 2) / (n - 1), 0, 1);
  }

  /* an image becomes frames by walking its pixels: saturation -> diameter,
     lightness -> height. How many frames depends on how contrasty it is. */
  function framesFromImage(img){
    const W = 100, H = 100;
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
    c.getContext('2d').drawImage(img, 0, 0, W, H);
    const d = c.getContext('2d').getImageData(0, 0, W, H).data;

    let sum = 0, sum2 = 0;
    const L = new Float32Array(W * H), S = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = d[i*4] / 255, g = d[i*4+1] / 255, b = d[i*4+2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const l = (mx + mn) / 2;
      L[i] = l;
      S[i] = (mx - mn < 1e-6) ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
      sum += l; sum2 += l * l;
    }
    const contrast = Math.sqrt(Math.max(sum2 / (W*H) - (sum / (W*H)) ** 2, 0));
    const n = Math.round(50 + Math.min(contrast / 0.3, 1) * 450);

    const frames = [];
    for (let i = 0; i < n; i++) {
      const p = Math.round(i * (W * H - 1) / Math.max(n - 1, 1));
      frames.push({ vol: S[p], depth: L[p] });
    }
    return frames;
  }

  /* a sound becomes frames in 50 ms steps: RMS -> diameter, the dominant
     pitch between 100 and 800 Hz -> height. The signal is mixed to mono and
     dropped to 8 kHz first, which is plenty for that band and makes the
     autocorrelation cheap enough to run over a whole take. */
  async function framesFromAudio(buf){
    const SR = 8000, STEP = SR * 0.05;                 // 400 samples
    const src = buf.getChannelData(0);
    const ratio = buf.sampleRate / SR;
    const n = Math.floor(src.length / ratio);
    const mono = new Float32Array(n);
    for (let i = 0; i < n; i++) mono[i] = src[Math.floor(i * ratio)];

    const loB = Math.floor(SR / 800), hiB = Math.ceil(SR / 100);   // lag bounds
    const frames = [];
    for (let s = 0; s + STEP <= mono.length; s += STEP) {
      let e = 0;
      for (let i = 0; i < STEP; i++) e += mono[s+i] * mono[s+i];
      const rms = Math.sqrt(e / STEP);
      if (rms < 0.004) continue;                        // silence
      let best = 0, bestLag = 0;
      for (let lag = loB; lag <= hiB; lag++) {
        let a = 0;
        for (let i = 0; i + lag < STEP; i++) a += mono[s+i] * mono[s+i+lag];
        if (a > best) { best = a; bestLag = lag; }
      }
      const hz = bestLag ? SR / bestLag : 0;
      frames.push({ vol: rms, depth: hz ? clamp((hz - 100) / 700, 0, 1) : 0 });
    }
    return frames;
  }

  /* keep the `cap` frames that change the most from the one before — those
     are the moments worth turning into a form */
  function pick(frames, cap){
    if (frames.length <= cap) return frames.slice();
    const dR = Math.max(...frames.map(f => f.depth)) - Math.min(...frames.map(f => f.depth)) || 1;
    const vR = Math.max(...frames.map(f => f.vol))   - Math.min(...frames.map(f => f.vol))   || 1;
    return frames
      .map((f, i) => ({ f, i, s: i === 0 ? Infinity
        : Math.abs(f.depth - frames[i-1].depth) / dR + Math.abs(f.vol - frames[i-1].vol) / vR }))
      .sort((a, b) => b.s - a.s).slice(0, cap)
      .sort((a, b) => a.i - b.i).map(o => o.f);
  }

  /* ── layout ─────────────────────────────────────────────────────────────── */

  function build(frames){
    const p = prod;
    const used = pick(frames, p.count);
    const vols = used.map(f => f.vol).sort((a, b) => a - b);
    const deps = used.map(f => f.depth).sort((a, b) => a - b);

    const list = used.map(f => ({
      w: Math.round(p.width[0] + pct(vols, f.vol) * (p.width[1] - p.width[0])),
      h: Math.round(p.height[0] + (p.rankHeights ? pct(deps, f.depth) : f.depth)
                                  * (p.height[1] - p.height[0]))
    }));

    if (p.layout === 'radial') {
      // golden-angle spiral — fills a disc evenly with no rings or spokes
      const GOLD = Math.PI * (3 - Math.sqrt(5));
      const rMax = p.site / 2 - p.width[1] / 2;
      list.forEach((s, k) => {
        const rad = rMax * Math.sqrt((k + 0.5) / list.length);
        s.x = Math.cos(k * GOLD) * rad;
        s.y = Math.sin(k * GOLD) * rad;
        s.r = rad;
      });
      if (p.legs) {                       // the outermost few run full height
        [...list].sort((a, b) => b.r - a.r).slice(0, p.legs)
                 .forEach(s => { s.h = p.height[1]; });
      }
    } else {
      const cols = Math.ceil(Math.sqrt(list.length));
      const rows = Math.ceil(list.length / cols);
      const cell = p.site / cols;
      list.forEach((s, k) => {
        s.x = ((k % cols) + 0.5 - cols / 2) * cell;
        s.y = (Math.floor(k / cols) + 0.5 - rows / 2) * cell;
      });
    }
    return list;
  }

  /* ── drawing ────────────────────────────────────────────────────────────── */

  function fit(c){                        // size the backing store, return ctx
    const w = c.clientWidth || parseFloat(c.style.width) || 1610;
    const h = c.clientHeight || parseFloat(c.style.height) || 560;
    c.width = w * 2; c.height = h * 2;
    const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, w, h);
    return { g, w, h };
  }

  /* one form, flat, drawn into a w x h box standing on (0,0) */
  function silhouette(g, form, w, h){
    g.beginPath();
    if (form === 'cone') {                       // point down
      g.moveTo(-w/2, -h); g.lineTo(w/2, -h); g.lineTo(0, 0); g.closePath();
    } else {                                     // column, rounded at the foot
      const r = Math.min(w / 2, h);
      g.moveTo(-w/2, -h); g.lineTo(w/2, -h); g.lineTo(w/2, -r);
      g.quadraticCurveTo(w/2, 0, 0, 0);
      g.quadraticCurveTo(-w/2, 0, -w/2, -r);
      g.closePath();
    }
  }

  function drawTop(){
    const { g, w, h } = fit(cv);
    if (!shapes.length) return;
    const s = Math.min(w, h) / (prod.site * 1.08);
    g.save(); g.translate(w / 2, h / 2);
    g.lineWidth = 3; g.strokeStyle = css('--bg');
    shapes.forEach((sh, i) => {
      g.beginPath();
      g.arc(sh.x * s, sh.y * s, sh.w / 2 * s, 0, Math.PI * 2);
      g.fillStyle = i === head ? css('--bg') : css('--fg');
      g.fill(); g.stroke();
    });
    g.restore();
  }

  function drawIso(){
    const { g, w, h } = fit(cv);
    if (!shapes.length) return;
    const COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
    const proj = sh => ({ px: (sh.x - sh.y) * COS, py: (sh.x + sh.y) * SIN });

    // measure, then fit
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    const top = prod.align === 'top';
    for (const sh of shapes) {
      const { px, py } = proj(sh);
      const base = top ? py + sh.h : py;             // where the form sits
      x0 = Math.min(x0, px - sh.w / 2); x1 = Math.max(x1, px + sh.w / 2);
      y0 = Math.min(y0, base - sh.h);  y1 = Math.max(y1, base);
    }
    const s = Math.min(w / (x1 - x0), h / (y1 - y0)) * 0.86;
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(s, s);
    g.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    g.lineWidth = 2 / s; g.strokeStyle = css('--bg'); g.lineJoin = 'round';

    // far shapes first, so the near ones overlap them
    shapes.map((sh, i) => ({ sh, i, d: sh.x + sh.y }))
          .sort((a, b) => a.d - b.d)
          .forEach(({ sh, i }) => {
            const { px, py } = proj(sh);
            const base = top ? py + sh.h : py;
            g.save(); g.translate(px, base);
            silhouette(g, prod.form, sh.w, sh.h);
            g.fillStyle = i === head ? css('--bg') : css('--fg');
            g.fill(); g.stroke();
            g.beginPath();                            // the flat cap on top
            g.ellipse(0, -sh.h, sh.w / 2, sh.w / 2 * SIN, 0, 0, Math.PI * 2);
            g.fill(); g.stroke();
            g.restore();
          });
    g.restore();
  }

  function drawTimeline(){
    const { g, w, h } = fit(tl);
    if (!shapes.length) return;
    const n = shapes.length, step = w / n;
    const hMax = Math.max(...shapes.map(s => s.h));
    g.fillStyle = css('--fg');
    shapes.forEach((sh, i) => {
      const bw = Math.max(2, step * (sh.w / prod.width[1]) * 0.8);
      const bh = (sh.h / hMax) * (h - 10);
      g.fillStyle = i === head ? css('--bg') : css('--fg');
      g.fillRect(i * step + (step - bw) / 2, h - bh, bw, bh);
    });
    g.strokeStyle = css('--bg'); g.lineWidth = 3;
    g.beginPath();
    g.moveTo(head * step + step / 2, 0); g.lineTo(head * step + step / 2, h);
    g.stroke();
  }

  const draw = () => { (view === 'top' ? drawTop : drawIso)(); drawTimeline(); };

  /* ── input ──────────────────────────────────────────────────────────────── */

  async function run(frames){
    if (!frames.length) { reset(); return; }
    shapes = build(frames);
    head = 0;
    io.classList.add('is-off');
    out.classList.add('is-on');
    draw();
  }

  function readImage(file){
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(img.src); run(framesFromImage(img)); };
    img.src = URL.createObjectURL(file);
  }

  async function readAudio(blob){
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    run(await framesFromAudio(buf));
    ac.close();
  }

  const handle = file => {
    if (!file) return;
    fileBox.classList.add('is-busy');
    (kind === 'images' ? readImage : readAudio)(file);
  };

  fileBox.addEventListener('click', e => { e.stopPropagation(); fileIn.click(); });
  fileIn.addEventListener('change', e => handle(e.target.files[0]));
  ['dragenter', 'dragover'].forEach(t =>
    fileBox.addEventListener(t, e => { e.preventDefault(); fileBox.classList.add('is-armed'); }));
  ['dragleave', 'drop'].forEach(t =>
    fileBox.addEventListener(t, e => { e.preventDefault(); fileBox.classList.remove('is-armed'); }));
  fileBox.addEventListener('drop', e => handle(e.dataTransfer.files[0]));

  /* the live box: one click arms the camera / recorder, the next takes it */
  liveBox.addEventListener('click', async e => {
    e.stopPropagation();
    try {
      if (kind === 'images') {
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
          cam.srcObject = stream; cam.hidden = false; await cam.play();
          liveLbl.textContent = 'Take It';
          return;
        }
        const c = Object.assign(document.createElement('canvas'),
                                { width: cam.videoWidth, height: cam.videoHeight });
        c.getContext('2d').drawImage(cam, 0, 0);
        stopLive();
        const img = new Image();
        img.onload = () => run(framesFromImage(img));
        img.src = c.toDataURL();
      } else {
        if (!recorder) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          recorder = new MediaRecorder(stream);
          recorder.ondataavailable = ev => chunks.push(ev.data);
          recorder.onstop = () => { const b = new Blob(chunks); stopLive(); readAudio(b); };
          recorder.start();
          liveLbl.textContent = 'Stop';
          liveBox.classList.add('is-armed');
          return;
        }
        recorder.stop();
      }
    } catch (err) {
      console.warn('[make] live input unavailable:', err.name);
      liveLbl.textContent = kind === 'images' ? 'No Camera' : 'No Mic';
      setTimeout(() => { liveLbl.textContent = label('Live'); }, 1600);
    }
  });

  function stopLive(){
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; recorder = null;
    cam.hidden = true; cam.srcObject = null;
    liveBox.classList.remove('is-armed');
    liveLbl.textContent = label('Live');
  }

  /* ── timeline scrubbing ─────────────────────────────────────────────────── */

  let dragging = false;
  const scrub = e => {
    if (!shapes.length) return;
    const r = tl.getBoundingClientRect();
    head = clamp(Math.floor((e.clientX - r.left) / r.width * shapes.length), 0, shapes.length - 1);
    draw();
  };
  tl.addEventListener('pointerdown', e => { dragging = true; scrub(e); });
  addEventListener('pointermove', e => dragging && scrub(e));
  addEventListener('pointerup', () => { dragging = false; });

  vbtns.forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    view = b.dataset.view;
    vbtns.forEach(o => o.classList.toggle('is-on', o === b));
    draw();
  }));
  page.querySelector('[data-again]').addEventListener('click', e => {
    e.stopPropagation(); reset();
  });

  const label = word => word + ' ' + (kind === 'images' ? 'Image' : 'Sound');

  function reset(){
    stopLive();
    shapes = []; head = 0;
    fileBox.classList.remove('is-busy', 'is-armed');
    io.classList.remove('is-off');
    out.classList.remove('is-on');
    fileIn.value = '';
  }

  /* ── entry ──────────────────────────────────────────────────────────────── */

  function open(id, tab){
    prod = PRODUCTS[id];
    if (!prod) return false;                 // only Side Table and Tray so far
    kind = tab;
    nameEl.textContent = prod.name;
    dropLbl.textContent = label('Drop');
    liveLbl.textContent = label('Live');
    fileIn.accept = kind === 'images' ? 'image/*' : 'audio/*';
    reset();
    return true;
  }

  const close = () => { stopLive(); reset(); };
  const redraw = () => { if (shapes.length) draw(); };

  return { open, close, redraw, has: id => !!PRODUCTS[id] };
})();
