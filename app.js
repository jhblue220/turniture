/* ========================================================================== */
const stage   = document.getElementById('stage');
const cursor  = document.getElementById('cursor');
const itemsEl = document.getElementById('items');
const colors  = document.getElementById('colors');
const swatchesEl = document.getElementById('swatches');
const titleEl = document.querySelector('[data-title]');
const pages   = document.querySelectorAll('.page');
const tabs    = document.querySelectorAll('.nav__tab');

const TITLES = { images: 'Turn your image into', sounds: 'Turn your sound into' };

let page = 'home';          // 'home' | 'images' | 'sounds'
let colorsOpen = false;
let slots = { 1: 0, 2: 1 }; // 1 = foreground, 2 = background
let nextSlot = 1;

/* ── artboard scaling ───────────────────────────────────────────────────── */

function fit(){
  const k = Math.min(innerWidth / 1920, innerHeight / 1080);
  document.documentElement.style.setProperty('--k', k);
  return k;
}
let k = fit();
addEventListener('resize', () => { k = fit(); });

/* ── items ──────────────────────────────────────────────────────────────── */

document.querySelector('.logo').innerHTML = LOGO_SVG;

const restSvg = s =>
  `<svg class="s-rest" viewBox="0 0 ${s.w} ${s.h}" width="${s.w}" height="${s.h}">
     <path d="${s.d}" fill-rule="evenodd"/>
   </svg>`;

/* The hover shape is a cluster of separate units, one <path> each, so the
   camera / microphone can resize them one by one. overflow:visible lets a unit
   grow past the cluster box without being clipped. */
const clusterSvg = c =>
  `<svg class="s-hover" viewBox="0 0 ${c.w} ${c.h}" width="${c.w}" height="${c.h}"
        style="--dy:${c.dy || 0}px; overflow:visible">
     ${c.units.map(() => '<path fill-rule="evenodd"/>').join('')}
   </svg>`;

itemsEl.innerHTML = ITEMS.map((it, i) => `
  <div class="item" data-id="${it.id}" style="--i:${i}">
    <div class="item__box"></div>
    <div class="item__shape">
      ${restSvg(it.rest)}
      ${clusterSvg(it.cluster)}
    </div>
    <div class="item__label">${it.label}</div>
    <div class="item__size">${it.size}</div>
  </div>`).join('');

const itemEls = [...itemsEl.querySelectorAll('.item')];

/* ── live shapes ────────────────────────────────────────────────────────────
   Each unit keeps its centre and its anchored edge; only width and height
   move, and the two move independently. 0.5 is the resting value and redraws
   the cluster exactly as measured from the mockup.                         */

const SWING_H = 0.95;   // how far height may stray from the mockup
const SWING_W = 0.30;   // how far width may

const clusterOf = el => ITEMS[+getComputedStyle(el).getPropertyValue('--i')].cluster;
const rest = n => new Array(n).fill(0.5);

/* Group the units that sit side by side and remember the gap the mockup left
   between neighbours — zero for the bars, a slight overlap for the rings. Rows
   are repacked from those gaps every frame, so a unit changing width pushes its
   neighbours along instead of opening a seam. The row as a whole stays centred
   on where the mockup put it, so only the outer edges move. */
ITEMS.forEach(it => {
  const c = it.cluster;
  const byRow = new Map();
  c.units.forEach((u, i) => {
    const r = u.row ?? 0;
    (byRow.get(r) ?? byRow.set(r, []).get(r)).push(i);
  });
  c.rows = [...byRow.values()].map(idx => {
    idx.sort((a, b) => c.units[a].x - c.units[b].x);
    const gaps = idx.map((i, k) => k === 0 ? 0
      : c.units[i].x - (c.units[idx[k - 1]].x + c.units[idx[k - 1]].w));
    const first = c.units[idx[0]], last = c.units[idx[idx.length - 1]];
    return { idx, gaps, centre: (first.x + last.x + last.w) / 2 };
  });
});

function paint(el, sw, sh){
  const c = clusterOf(el);
  const paths = el.querySelectorAll('.s-hover path');

  const size = c.units.map((u, i) => ({
    w: u.w * (1 + SWING_W * ((sw[i] ?? 0.5) - 0.5)),
    h: Math.min(c.h, Math.max(u.h * 0.3,
                u.h * (1 + SWING_H * ((sh[i] ?? 0.5) - 0.5))))
  }));

  for (const row of c.rows) {
    const span = row.idx.reduce((n, i) => n + size[i].w, 0)
               + row.gaps.reduce((a, b) => a + b, 0);
    let x = row.centre - span / 2;
    for (let k = 0; k < row.idx.length; k++) {
      const i = row.idx[k], u = c.units[i], { w, h } = size[i];
      x += row.gaps[k];
      const dy = c.anchor === 'bottom' ? c.h - h
               : c.anchor === 'center' ? (u.y ?? 0) + (u.h - h) / 2
               : 0;
      const p = paths[i];
      p.setAttribute('d', c.unit(w, h, u, c.h));
      p.setAttribute('transform', `translate(${x.toFixed(2)},${dy.toFixed(2)})`);
      x += w;
    }
  }
}

/* ── drift ──────────────────────────────────────────────────────────────────
   While an item is hovered each unit wanders on its own: width and height
   each ease towards a fresh random target, each on its own clock, so the
   cluster keeps reshuffling instead of pulsing in unison. Hovering always
   starts from the mockup proportions and drifts out from there.            */

const LEG = [380, 1100];                       // ms to travel to one target
const ease = t => t * t * (3 - 2 * t);
const chan = () => ({ from: 0.5, to: 0.5, t: 1, dur: 1 });

function advance(c, dt){
  c.t += dt / c.dur;
  if (c.t >= 1) {
    c.from = c.to;
    c.to   = Math.random();
    c.dur  = LEG[0] + Math.random() * (LEG[1] - LEG[0]);
    c.t    = 0;
  }
  return c.from + (c.to - c.from) * ease(c.t);
}

const drifts = new Map();                      // item element -> its channels

function reset(el){
  const n = clusterOf(el).units.length;
  const d = {
    w: Array.from({ length: n }, chan),
    h: Array.from({ length: n }, chan),
    sw: rest(n), sh: rest(n)
  };
  drifts.set(el, d);
  return d;
}

itemEls.forEach((el, i) => {
  const n = ITEMS[i].cluster.units.length;
  paint(el, rest(n), rest(n));
});

let frame = null, last = 0, settling = null;

function tick(now){
  const dt = last ? Math.min(64, now - last) : 16;
  last = now;

  const hot = itemEls.find(e => e.classList.contains('is-hot'));
  if (hot) {
    settling = null;
    const d = drifts.get(hot) || reset(hot);
    d.sw = d.w.map(c => advance(c, dt));
    d.sh = d.h.map(c => advance(c, dt));
    paint(hot, d.sw, d.sh);
    frame = requestAnimationFrame(tick);
    return;
  }

  if (settling) {                              // ease back to the mockup, then stop
    const { el, sw, sh } = settling;
    let done = true;
    for (const a of [sw, sh])
      for (let i = 0; i < a.length; i++) {
        a[i] += (0.5 - a[i]) * 0.18;
        if (Math.abs(a[i] - 0.5) > 0.004) done = false;
      }
    paint(el, sw, sh);
    if (!done) { frame = requestAnimationFrame(tick); return; }
    paint(el, rest(sw.length), rest(sh.length));
    settling = null;
  }
  frame = null;
  last = 0;
}

const startFrames = () => {
  if (frame === null) { last = 0; frame = requestAnimationFrame(tick); }
};

itemEls.forEach(el => {
  el.addEventListener('mouseenter', () => {
    el.classList.add('is-hot');
    reset(el);                                 // always begin at the mockup
    startFrames();
  });
  el.addEventListener('mouseleave', () => {
    el.classList.remove('is-hot');
    const d = drifts.get(el) || reset(el);
    settling = { el, sw: d.sw.slice(), sh: d.sh.slice() };
    startFrames();
  });
});

/* ── the row slides one cell at a time ──────────────────────────────────── */

const VISIBLE = 4;
const LAST    = Math.max(0, ITEMS.length - VISIBLE);
const picker  = document.querySelector('.page--picker');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');

let pos = 0;

function slide(to){
  pos = Math.min(LAST, Math.max(0, to));
  itemsEl.style.setProperty('--pos', pos);
  // pinned left at the start, pinned right at the end, centred in between
  picker.dataset.align = pos === 0 ? 'left' : pos === LAST ? 'right' : 'center';
  prevBtn.classList.toggle('is-off', pos === 0);
  nextBtn.classList.toggle('is-off', pos === LAST);
  // an item that slid out from under the cursor must not stay lit
  settling = null;
  itemEls.forEach((el, i) => {
    el.classList.remove('is-hot');
    drifts.delete(el);
    const n = ITEMS[i].cluster.units.length;
    paint(el, rest(n), rest(n));
  });
}

prevBtn.addEventListener('click', e => { e.stopPropagation(); slide(pos - 1); });
nextBtn.addEventListener('click', e => { e.stopPropagation(); slide(pos + 1); });

/* ── navigation ─────────────────────────────────────────────────────────── */

function show(next){
  page = next;
  pages.forEach(p => p.classList.toggle('is-on',
    p.dataset.page === (next === 'home' ? 'home' : 'picker')));
  if (next !== 'home') titleEl.textContent = TITLES[next];
  // the title sequence only runs while the main page is on screen
  next === 'home' ? Intro.start() : Intro.stop();
  paintTabs();
}

function paintTabs(){
  tabs.forEach(t => t.classList.toggle('is-on',
    t.dataset.tab === page || (t.dataset.tab === 'colors' && colorsOpen)));
}

tabs.forEach(tab => tab.addEventListener('click', e => {
  e.stopPropagation();
  const t = tab.dataset.tab;
  if (t === 'colors') { colorsOpen ? closeColors() : openColors(); return; }
  show(t);
}));

document.querySelector('.logo').addEventListener('click', e => {
  e.preventDefault();
  show('home');
});

/* ── colour panel ───────────────────────────────────────────────────────── */

swatchesEl.innerHTML = PALETTE.map((c, i) => `
  <button class="swatch" data-i="${i}" style="top:${i * 100 - 49}px" aria-label="colour ${i + 1}">
    <span class="swatch__chip" style="background:${c}"><span class="swatch__n"></span></span>
  </button>`).join('');

const swatchEls = [...swatchesEl.querySelectorAll('.swatch')];

function paintSwatches(){
  swatchEls.forEach((el, i) => {
    const n = slots[1] === i ? '1' : slots[2] === i ? '2' : '';
    el.classList.toggle('is-picked', !!n);
    el.querySelector('.swatch__n').textContent = n;
  });
}

function applyColors(){
  const r = document.documentElement.style;
  r.setProperty('--fg', PALETTE[slots[1]]);
  r.setProperty('--bg', PALETTE[slots[2]]);
  paintSwatches();
}

swatchEls.forEach(el => el.addEventListener('click', e => {
  e.stopPropagation();
  const i = +el.dataset.i;
  const other = nextSlot === 1 ? 2 : 1;
  if (slots[other] === i) {            // picking the colour already in the
    slots[other] = slots[nextSlot];    // other slot simply swaps the two
  }
  slots[nextSlot] = i;
  nextSlot = other;
  applyColors();
}));

/* stagger the swatches so they drop in one after another */
swatchEls.forEach((el, i) => {
  el.style.transitionDelay = `${i * 40}ms`;
});

function openColors(){
  colorsOpen = true;
  colors.classList.add('is-open');
  colors.setAttribute('aria-hidden', 'false');
  paintTabs();
}
function closeColors(){
  colorsOpen = false;
  colors.classList.remove('is-open');
  colors.setAttribute('aria-hidden', 'true');
  paintTabs();
}

document.getElementById('colorsClose').addEventListener('click', e => {
  e.stopPropagation();
  closeColors();
});

/* clicking anywhere else closes the panel too */
document.addEventListener('click', () => { if (colorsOpen) closeColors(); });

/* ── cursor ─────────────────────────────────────────────────────────────── */

let cx = innerWidth / 2, cy = innerHeight / 2, small = false;

function moveCursor(){
  const r = stage.getBoundingClientRect();
  const x = (cx - r.left) / k;
  const y = (cy - r.top)  / k;
  cursor.style.transform = `translate(${x}px, ${y}px)`;
}

addEventListener('mousemove', e => {
  cx = e.clientX; cy = e.clientY;
  moveCursor();
});

const HOT = '.item, .nav__tab, .swatch, .colors__close, .arrow, .logo';
document.addEventListener('mouseover', e => {
  const next = !!e.target.closest(HOT);
  if (next !== small) { small = next; cursor.classList.toggle('is-small', small); }
});

/* ── go ─────────────────────────────────────────────────────────────────── */

applyColors();
paintTabs();
slide(0);
moveCursor();
Intro.start();
