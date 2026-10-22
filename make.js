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
    name: 'Side Table', count: 22,
    site: { w: 400, d: 400 }, layout: 'radial',
    form: 'capsule', foot: 'circle',
    width: [50, 150], height: [200, 700],
    hang: true,                // flat tops share a plane, round ends hang free
    legs: 4,                   // one per quadrant, so the table actually stands
    packFactor: 0.85,          // cell = mean diameter x this
    maxOverlap: 0.2            // neighbours bite at most 20% of the thinner one
  },
  tray: {
    name: 'Tray', count: 9,
    site: { w: 260, d: 260 }, layout: 'grid',
    form: 'cone', foot: 'circle',
    width: [60, 130], height: [40, 160],
    rankHeights: true,         // otherwise the heights bunch together
    fillSite: true,            // the nine fill the site, so the cell is 86.7mm
    connectStrays: true        // then anything left floating is fattened until it bites
  },
  'wall-shelves': {
    name: 'Wall Shelves', count: 7,
    site: { w: 700, d: 150 }, layout: 'row',
    form: 'dome', foot: 'half',
    width: [100, 300],         // the half sticks out by its radius — 150 max
    height: [60, 240],
    wall: true, centreZ: true  // sits on a wall, centred about its own middle
  },
  stool: {
    name: 'Stool', count: 16,
    site: { w: 380, d: 380 }, layout: 'grid', cols: 4,
    form: 'box', foot: 'square',
    width: [55, 95], height: [150, 450],
    hang: true,                // tops share one plane — that plane is the seat
    legs: 4                    // so the four corners are what reach the floor
  },
  pendant: {
    name: 'Pendant', count: 5,
    site: { w: 500, d: 500 }, layout: 'row',
    form: 'shade', foot: 'circle',
    width: [60, 140], height: [80, 250],
    pack: 0.22,                // shoulders overlap, so all five read separately
    hang: true, flex: 60       // hangs from a ceiling on a flex
  },
  shelves: {
    name: 'Shelves', count: 6,
    site: { w: 500, d: 300, h: 1000 }, layout: 'stack', cols: 2, rows: 3,
    form: 'ring', foot: 'circle',
    width: [250, 400],         // outer diameter — never small enough to look flimsy
    height: [100, 300],        // how deep it runs back
    pack: 0.12,                // cubbies bite into each other
    wall: true
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
  const src      = page.querySelector('[data-src]');
  const playBtn  = page.querySelector('[data-play]');
  const modeBtn  = page.querySelector('[data-mode]');
  const cartBtn  = page.querySelector('[data-cart]');

  let prod = null, kind = 'images';     // 'images' | 'sounds'
  let shapes = [];                      // the forms, in mm
  let view = 'iso';
  let head = -1;                        // which form is being pointed out
  let photo = null;                     // the picture it came from, if any
  let playing = false, playFrom = 0, frame = null;
  let stream = null, recorder = null, chunks = [];

  const STEP = 620;                     // ms each form is held while playing

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
      // `at` is how far down the picture this frame was read, 0..1
      frames.push({ vol: S[p], depth: L[p], at: Math.floor(p / W) / (H - 1) });
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
      frames.push({ vol: rms, depth: hz ? clamp((hz - 100) / 700, 0, 1) : 0,
                    at: s / mono.length });
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

  /* ── the prototype's placement rules (코딩 2) ───────────────────────────
     Three steps decide how much neighbours bite into each other. Without them
     a spiral collapses into a knot and a grid leaves pieces floating. */

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /* Side Table: no pair may sink deeper into its neighbour than `ratio` of the
     thinner one's diameter. Pushing only the pairs that are too deep, a little
     at a time, leaves the rest where the spiral put them — scaling the whole
     layout instead would double the piece because of one bad pair. */
  function spreadToMaxOverlap(list, ratio){
    const want = (p, q) => p.w / 2 + q.w / 2 - ratio * Math.min(p.w, q.w);
    for (let pass = 0; pass < 300; pass++) {
      let worst = 0;
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const p = list[i], q = list[j], need = want(p, q);
          let dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
          if (d >= need - 1e-4) continue;
          if (d < 1e-6) { dx = 1; dy = 0; d = 1e-6; }
          const push = (need - d) / 2, ux = dx / d, uy = dy / d;
          p.x -= ux * push; p.y -= uy * push;
          q.x += ux * push; q.y += uy * push;
          worst = Math.max(worst, need - d);
        }
      if (worst < 0.05) break;
    }
    const mx = list.reduce((a, s) => a + s.x, 0) / list.length;
    const my = list.reduce((a, s) => a + s.y, 0) / list.length;
    list.forEach(s => { s.x -= mx; s.y -= my; });   // put the middle back
  }

  /* Tray: the grid never moves — pulling a corner inwards turns a square into
     a cross. Instead the thin ones are fattened until every neighbouring pair
     overlaps by at least BITE. Neighbours are the pairs within 1.3x the
     closest spacing, which on a grid is the side-by-side pairs and not the
     diagonals. Worst-offending pair first, and the thinner one pays. */
  const BITE = 3, NEAR = 1.3;
  function connectStrays(list, max){
    const pairs = [];
    let minD = Infinity;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) minD = Math.min(minD, dist(list[i], list[j]));
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (dist(list[i], list[j]) <= minD * NEAR) pairs.push([i, j]);

    for (let guard = 0; guard < 4 * list.length * list.length; guard++) {
      let worst = null;
      for (const [i, j] of pairs) {
        const need = BITE - (list[i].w / 2 + list[j].w / 2 - dist(list[i], list[j]));
        if (need > 0 && (!worst || need > worst.need)) worst = { i, j, need };
      }
      if (!worst) break;
      const { i, j, need } = worst;
      const thin = list[i].w <= list[j].w ? i : j, other = thin === i ? j : i;
      const was = [list[thin].w, list[other].w];
      list[thin].w = Math.min(max, list[thin].w + 2 * need);
      const got = (list[thin].w - was[0]) / 2;
      if (got < need - 1e-6) list[other].w = Math.min(max, list[other].w + 2 * (need - got));
      if (list[thin].w === was[0] && list[other].w === was[1]) break;   // both maxed out
    }
  }

  /* Side Table: the four that reach the floor have to be spread around, not
     bunched on one side, or the table tips. One per quadrant, the outermost. */
  function legsByQuadrant(list, k, maxH){
    const far = new Array(k).fill(-1), pick = new Array(k).fill(-1);
    list.forEach((s, i) => {
      const r = Math.hypot(s.x, s.y);
      const q = Math.floor(((Math.atan2(s.y, s.x) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * k);
      if (r > far[q]) { far[q] = r; pick[q] = i; }
    });
    pick.forEach(i => { if (i >= 0) list[i].h = maxH; });
  }

  /* Cells filled from the middle outwards, so a short take never leaves a
     hole in the centre. */
  function spiralOrder(cols, rows){
    const cells = [];
    let l = 0, r = cols - 1, t = 0, b = rows - 1;
    while (l <= r && t <= b) {
      for (let x = l; x <= r; x++) cells.push([x, t]);
      for (let y = t + 1; y <= b; y++) cells.push([r, y]);
      if (t < b) for (let x = r - 1; x >= l; x--) cells.push([x, b]);
      if (l < r) for (let y = b - 1; y > t; y--) cells.push([l, y]);
      l++; r--; t++; b--;
    }
    return cells.reverse();
  }

  /* Every piece ends up as a list of forms with the same five numbers:
       x, y  — where it stands on the floor (or along the wall), mm
       z     — the bottom of the silhouette, mm, up from the floor plane
       w, hv — the silhouette's width and height, mm
     The renderers only ever read those, so a floor piece and a wall piece
     draw through exactly the same code. */
  function build(frames){
    const p = prod;
    const used = pick(frames, p.count);
    const vols = used.map(f => f.vol).sort((a, b) => a - b);
    const deps = used.map(f => f.depth).sort((a, b) => a - b);

    const list = used.map(f => ({
      at: f.at ?? 0,
      w: Math.round(p.width[0] + pct(vols, f.vol) * (p.width[1] - p.width[0])),
      h: Math.round(p.height[0] + (p.rankHeights ? pct(deps, f.depth) : f.depth)
                                  * (p.height[1] - p.height[0]))
    }));

    if (p.layout === 'radial') {
      /* The cell comes from the diameters this take actually produced, not
         from the range — a quiet take makes a smaller table rather than a
         sparse one. The disc is then sized so the density stays put. */
      const mean = list.reduce((a, s) => a + s.w, 0) / list.length;
      const cell = mean * (p.packFactor || 0.85);
      const rSite = p.site.w / 2 - cell / 2;
      const capacity = Math.max(7, Math.round(Math.PI * rSite * rSite / (cell * cell)));
      const rMax = rSite * Math.sqrt(Math.min(1, list.length / capacity));
      const GOLD = Math.PI * (3 - Math.sqrt(5));     // no rings, no spokes
      list.forEach((s, k) => {
        const rad = rMax * Math.sqrt((k + 0.5) / list.length);
        s.x = Math.cos(k * GOLD) * rad;
        s.y = Math.sin(k * GOLD) * rad;
      });
      if (p.legs) legsByQuadrant(list, p.legs, p.height[1]);
      if (p.maxOverlap) spreadToMaxOverlap(list, p.maxOverlap);
    } else if (p.layout === 'grid') {
      const cell = p.fillSite
        ? Math.sqrt(p.site.w * p.site.d / list.length)
        : p.site.w / p.cols;
      const cols = p.cols || Math.max(1, Math.round(p.site.w / cell));
      const rows = Math.max(1, Math.ceil(list.length / cols));
      const cells = spiralOrder(cols, rows);
      list.forEach((s, k) => {
        const [c, r] = cells[k % cells.length];
        s.col = c; s.row = r;
        s.x = (c + 0.5 - cols / 2) * (p.site.w / cols);
        s.y = (r + 0.5 - rows / 2) * (p.site.d / rows);
      });
      if (p.connectStrays) connectStrays(list, p.width[1]);
      if (p.legs) {                    // the four corners become the legs
        const corner = s => (s.col === 0 || s.col === cols - 1) &&
                            (s.row === 0 || s.row === rows - 1);
        list.filter(corner).slice(0, p.legs).forEach(s => { s.h = p.height[1]; });
      }
    } else if (p.layout === 'row') {
      if (p.pack) {
        /* lay them shoulder to shoulder and let each pair bite into the other,
           so nothing floats off on its own */
        let acc = 0;
        list.forEach((s, k) => {
          if (k) acc += (list[k - 1].w + s.w) / 2 * (1 - p.pack);
          s.x = acc;
        });
        const mid = (list[0].x + list[list.length - 1].x) / 2;
        list.forEach(s => { s.x -= mid; s.y = 0; });
      } else {
        const step = p.site.w / list.length;
        list.forEach((s, k) => {
          s.x = (k + 0.5) * step - p.site.w / 2;
          // a half form sticks out by its own radius, so the fat ones come forward
          s.y = p.wall ? -s.w / 4 : 0;
        });
      }
    } else {                            // 'stack' — a wall unit, 2 across, 3 up
      /* Rows and columns are packed to whatever is actually in them rather
         than to a fixed grid, so the cubbies sit against each other and the
         unit ends up only as tall as its contents. */
      const colW = [], rowH = [];
      list.forEach((s, k) => {
        s.col = k % p.cols; s.row = Math.floor(k / p.cols);
        colW[s.col] = Math.max(colW[s.col] || 0, s.w);
        rowH[s.row] = Math.max(rowH[s.row] || 0, s.w);
      });
      const k = 1 - (p.pack || 0);          // how far neighbours bite in
      const xs = []; let acc = -colW.reduce((a, b) => a + b, 0) * k / 2;
      colW.forEach((v, i) => { xs[i] = acc + v / 2; acc += v * k; });
      const zs = []; acc = 0;
      rowH.forEach((v, i) => { zs[i] = acc + v / 2; acc += v * k; });
      list.forEach(s => {
        s.x = xs[s.col];
        s.y = 0;                        // the open face is flush with the front
        s.depth = s.h;                  // and the cubby runs back by this much
        s.zRow = zs[s.row];
      });
    }

    // the silhouette each form actually draws
    list.forEach(s => {
      if (p.layout === 'stack') { s.hv = s.w; s.z = s.zRow - s.w / 2; }
      else if (p.centreZ)       { s.hv = s.h; s.z = -s.h / 2; }
      else if (p.hang)          { s.hv = s.h + (p.flex || 0); s.z = -s.hv; }
      else                      { s.hv = s.h; s.z = 0; }
    });
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

  /* One form, flat, drawn into a w x h box whose bottom edge sits on (0,0).
     These are the same silhouettes the picker page already uses. */
  function silhouette(g, form, w, h, p, flex){
    const hw = w / 2;
    g.beginPath();
    if (form === 'cone') {                           // Tray — point down
      g.moveTo(-hw, -h); g.lineTo(hw, -h); g.lineTo(0, 0);
    } else if (form === 'box') {                     // Stool
      g.rect(-hw, -h, w, h);
    } else if (form === 'dome') {                    // Wall Shelves
      g.moveTo(-hw, -h); g.lineTo(hw, -h); g.lineTo(hw * 0.88, -h * 0.58);
      g.quadraticCurveTo(hw * 0.84, 0, 0, 0);
      g.quadraticCurveTo(-hw * 0.84, 0, -hw * 0.88, -h * 0.58);
    } else if (form === 'shade') {                   // Pendant — cone on a flex
      const t = Math.max(1.5, w * 0.02);
      g.rect(-t / 2, -h, t, flex);
      g.moveTo(0, -h + flex); g.lineTo(hw, 0); g.lineTo(-hw, 0);
    } else {                                         // Side Table — round foot
      const r = Math.min(hw, h);
      g.moveTo(-hw, -h); g.lineTo(hw, -h); g.lineTo(hw, -r);
      g.quadraticCurveTo(hw, 0, 0, 0);
      g.quadraticCurveTo(-hw, 0, -hw, -r);
    }
    g.closePath();
  }

  /* The face you see on top of a form in the 3D view. Each one is different:
     a column shows a disc, a box a skewed square, a wall shelf the flat half
     disc you would put something on, a shade its open mouth underneath. */
  function cap(g, form, w, hv, SIN){
    const r = w / 2;
    if (form === 'capsule' || form === 'cone') {
      g.beginPath(); g.ellipse(0, -hv, r, r * SIN, 0, 0, Math.PI * 2);
    } else if (form === 'box') {
      const dx = r * 0.55, dy = r * SIN;
      g.beginPath();
      g.moveTo(-r, -hv); g.lineTo(-r + dx, -hv - dy);
      g.lineTo(r + dx, -hv - dy); g.lineTo(r, -hv); g.closePath();
    } else if (form === 'dome') {
      g.beginPath(); g.ellipse(0, -hv, r, r * SIN, 0, Math.PI, 0); g.closePath();
    } else if (form === 'shade') {
      g.beginPath(); g.ellipse(0, 0, r, r * SIN, 0, 0, Math.PI * 2);
    } else {
      return false;                                   // a ring needs none
    }
    return true;
  }

  /* the footprint, seen from straight above */
  function footprint(g, foot, w){
    const r = w / 2;
    g.beginPath();
    if (foot === 'square')    g.rect(-r, -r, w, w);
    else if (foot === 'half') g.arc(0, 0, r, 0, Math.PI);   // flat edge on the wall
    else                      g.arc(0, 0, r, 0, Math.PI * 2);
    g.closePath();
  }

  /* the piece fills about 40% of the panel at its nominal size, and stays
     there however it is turned */
  const SHARE = 0.92;                   // of the panel, at the product's full size
  function fixedScale(){
    const p = prod;
    const nominal = Math.max(p.site.w, p.site.d, p.height[1]);
    return SHARE * (cv.clientHeight || 709) / nominal;
  }

  function drawTop(){
    const { g, w, h } = fit(cv);
    if (!shapes.length) return;
    const s = fixedScale();
    g.save(); g.translate(w / 2, h / 2); g.scale(s, s);
    g.lineWidth = 3 / s; g.strokeStyle = css('--bg'); g.lineJoin = 'round';
    // biggest first, so a small one in front of a big one still reads
    shapes.map((sh, i) => ({ sh, i })).sort((a, b) => b.sh.w - a.sh.w)
          .forEach(({ sh, i }) => {
            g.save(); g.translate(sh.x, prod.wall ? 0 : sh.y);
            footprint(g, prod.foot, sh.w);
            g.globalAlpha = i === head ? 0.4 : 1;
            g.fillStyle = css('--fg');
            g.fill(); g.stroke(); g.globalAlpha = 1; g.restore();
          });
    g.restore();
  }

  /* How the piece is turned. Dragging across the canvas spins it; dragging up
     and down tilts between looking at it almost level and looking down on it.
     A piece that lives on a wall starts nearly face on, the way you would meet
     it in a room; one on the floor starts at a three-quarter view. */
  let yaw = 0, pitch = 0;
  const START = { floor: [0.61, 0.56], wall: [0.24, 0.24] };
  const resetAngles = () => { [yaw, pitch] = START[prod.wall ? 'wall' : 'floor']; };

  function drawIso(){
    const { g, w, h } = fit(cv);
    if (!shapes.length) return;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const sp = Math.sin(pitch), kz = Math.cos(pitch);   // kz squashes heights

    // turn the piece about its upright axis, then tip it towards the viewer
    const at = sh => {
      const xr =  sh.x * cy + sh.y * sy;
      const yr = -sh.x * sy + sh.y * cy;
      return { px: xr, py: -yr * sp - sh.z * kz, depth: yr };
    };

    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const sh of shapes) {
      const { px, py } = at(sh);
      const back = sh.depth || 0;
      x0 = Math.min(x0, px - sh.w / 2);
      x1 = Math.max(x1, px + sh.w / 2 + back * sy);
      y0 = Math.min(y0, py - sh.hv * kz - back * cy * sp);
      y1 = Math.max(y1, py + sh.w / 2 * sp);
    }
    /* One fixed scale per product — never a fit to the current contents.
       Fitting made the piece jump in size every time it turned, or when one
       form happened to come out tall. */
    const s = fixedScale();
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(s, s);
    g.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    g.lineWidth = 2 / s; g.strokeStyle = css('--bg'); g.lineJoin = 'round';

    // furthest away first, so the near ones paint over them
    shapes.map((sh, i) => ({ sh, i, d: at(sh).depth }))
          .sort((a, b) => b.d - a.d)
          .forEach(({ sh, i }) => {
            const { px, py } = at(sh);
            g.save(); g.translate(px, py);
            g.globalAlpha = i === head ? 0.4 : 1;      // the one being pointed out
            g.fillStyle = css('--fg');
            if (prod.form === 'ring') { tube(g, sh, i, sy, cy * sp); g.restore(); return; }
            silhouette(g, prod.form, sh.w, sh.hv * kz, prod, (prod.flex || 0) * kz);
            g.fill('evenodd'); g.stroke();
            if (cap(g, prod.form, sh.w, sh.hv * kz, sp)) { g.fill(); g.stroke(); }
            g.globalAlpha = 1;
            g.restore();
          });
    g.restore();
  }

  /* A Shelves cubby: a tube running back into the wall, with its mouth cut out
     at the front. The body is painted as three plain fills — the front disc,
     the back disc and the band between them — rather than one path, so there
     is no winding rule to get wrong where they overlap. */
  function tube(g, sh, i, dirX, dirY){
    const r = sh.w / 2, bx = sh.depth * dirX, by = -sh.depth * dirY;
    const ang = Math.atan2(by, bx);
    const nx = -Math.sin(ang) * r, ny = Math.cos(ang) * r;
    const cy = -r;                                   // front centre

    g.beginPath();                                   // the band
    g.moveTo(nx, cy + ny);
    g.lineTo(bx + nx, cy + by + ny);
    g.lineTo(bx - nx, cy + by - ny);
    g.lineTo(-nx, cy - ny);
    g.closePath(); g.fill();
    g.beginPath(); g.arc(bx, cy + by, r, 0, Math.PI * 2); g.fill();   // back
    g.beginPath(); g.arc(0, cy, r, 0, Math.PI * 2); g.fill();         // front

    g.beginPath();                                   // the mouth
    g.arc(0, cy, r * 0.68, 0, Math.PI * 2);
    g.fillStyle = css('--bg');
    g.fill(); g.stroke();
  }

  /* ── the left panel ─────────────────────────────────────────────────────
     For a picture: the picture itself, ruled into the bands each form was read
     from, with the band being pointed out washed over in the key colour.
     For a sound: the take drawn as circles — the ones already turned into a
     form stack up, and the one being turned spins like a loader. */

  function drawSrc(){
    const { g, w, h } = fit(src);
    if (!shapes.length) return;
    g.strokeStyle = css('--fg'); g.fillStyle = css('--fg');

    if (photo) {
      const r = Math.min(w / photo.width, h / photo.height);
      const iw = photo.width * r, ih = photo.height * r;
      const ox = (w - iw) / 2, oy = (h - ih) / 2;
      g.drawImage(photo, ox, oy, iw, ih);

      const edges = bandEdges();
      if (head >= 0 && playing) {                     // wash over the live band
        g.globalAlpha = 0.6;
        g.fillRect(ox, oy + edges[head] * ih, iw, (edges[head + 1] - edges[head]) * ih);
        g.globalAlpha = 1;
      }
      g.lineWidth = 2;
      for (let i = 1; i < edges.length - 1; i++) {
        g.beginPath();
        g.moveTo(ox, oy + edges[i] * ih); g.lineTo(ox + iw, oy + edges[i] * ih);
        g.stroke();
      }
      return;
    }

    // a sound: the forms already made, stacked up the panel
    const done = playing ? head : shapes.length;
    const made = shapes.slice(0, Math.max(done, 0));
    if (made.length) {
      const unit = Math.min(h / made.length, w * 0.55) / prod.width[1];
      let y = h / 2 - made.reduce((a, s) => a + s.w * unit, 0) / 2;
      for (const sh of made) {
        const r = sh.w * unit / 2;
        g.beginPath(); g.arc(w / 2, y + r, r, 0, Math.PI * 2); g.fill();
        y += r * 2;
      }
    }
    if (playing && head >= 0 && head < shapes.length) {    // the one being made
      const t = performance.now() / 1000;
      const R = Math.min(w, h) * 0.17, N = 8;
      const cxp = w / 2, cyp = h * 0.26;
      for (let i = 0; i < N; i++) {
        const a = t * 2.2 + i * (Math.PI * 2 / N);
        const k = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3 - i * 0.8));
        const rr = R * 0.26 * k * (shapes[head].w / prod.width[1]);
        g.beginPath();
        g.arc(cxp + Math.cos(a) * R, cyp + Math.sin(a) * R, Math.max(3, rr), 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  /* where one band ends and the next begins, 0..1 down the picture */
  function bandEdges(){
    const e = [0];
    for (let i = 1; i < shapes.length; i++) e.push((shapes[i - 1].at + shapes[i].at) / 2);
    e.push(1);
    return e;
  }

  const draw = () => { (view === 'top' ? drawTop : drawIso)(); drawSrc(); };

  /* ── input ──────────────────────────────────────────────────────────────── */

  /* The input step runs the palette inverted (Tray_01); the result step runs
     it the right way up (ImageConvert_1) and drops the heading. */
  const dressResult = on => {
    document.documentElement.classList.toggle('is-flip', !on);
    page.classList.toggle('is-result', on);
  };

  async function run(frames){
    if (!frames.length) { reset(); return; }
    shapes = build(frames);
    head = -1;
    view = 'iso';
    modeBtn.textContent = '2D';
    resetAngles();
    io.classList.add('is-off');
    out.classList.add('is-on');
    dressResult(true);
    draw();
  }

  function readImage(file){
    const img = new Image();
    img.onload = () => { photo = img; run(framesFromImage(img)); };
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
        img.onload = () => { photo = img; run(framesFromImage(img)); };
        img.src = c.toDataURL();
      } else {
        photo = null;
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


  /* ── walking through the piece ──────────────────────────────────────────
     Play steps form by form: on the left the band (or the circles) it came
     from, on the right that form picked out. */

  function tick(){
    if (!playing) return;
    const i = Math.floor((performance.now() - playFrom) / STEP);
    if (i >= shapes.length) { stop(); return; }
    head = i;
    draw();
    frame = requestAnimationFrame(tick);
  }

  function play(){
    if (!shapes.length) return;
    playing = true; playFrom = performance.now(); head = 0;
    playBtn.classList.add('is-on');
    cancelAnimationFrame(frame); frame = requestAnimationFrame(tick);
  }

  function stop(){
    playing = false; head = -1;
    playBtn.classList.remove('is-on');
    cancelAnimationFrame(frame); frame = null;
    draw();
  }

  playBtn.addEventListener('click', e => { e.stopPropagation(); playing ? stop() : play(); });

  modeBtn.addEventListener('click', e => {
    e.stopPropagation();
    view = view === 'iso' ? 'top' : 'iso';
    modeBtn.textContent = view === 'iso' ? '2D' : '3D';   // what you get next
    draw();
  });

  cartBtn.addEventListener('click', e => {               // the basket comes later
    e.stopPropagation();
    cartBtn.classList.add('is-added');
    setTimeout(() => cartBtn.classList.remove('is-added'), 700);
  });

  /* drag the canvas to turn the piece */
  let turning = null;
  cv.addEventListener('pointerdown', e => {
    if (view !== 'iso' || !shapes.length) return;
    e.stopPropagation();
    turning = { x: e.clientX, y: e.clientY };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!turning) return;
    yaw   += (e.clientX - turning.x) * 0.012;
    pitch  = clamp(pitch + (e.clientY - turning.y) * 0.010, 0.05, 1.45);
    turning = { x: e.clientX, y: e.clientY };
    draw();
  });
  ['pointerup', 'pointercancel'].forEach(t =>
    cv.addEventListener(t, () => { turning = null; }));

  page.querySelector('[data-again]').addEventListener('click', e => {
    e.stopPropagation(); reset();
  });

  const label = word => word + ' ' + (kind === 'images' ? 'Image' : 'Sound');

  function reset(){
    stopLive(); stop();
    shapes = []; head = -1; photo = null;
    fileBox.classList.remove('is-busy', 'is-armed');
    io.classList.remove('is-off');
    out.classList.remove('is-on');
    if (page.classList.contains('is-on')) dressResult(false);
    else page.classList.remove('is-result');
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
    modeBtn.hidden = kind !== 'images';     // a sound has nothing to show flat
    reset();
    return true;
  }

  const close = () => { stopLive(); stop(); reset(); };
  const redraw = () => { if (shapes.length) draw(); };

  return { open, close, redraw, has: id => !!PRODUCTS[id] };
})();
