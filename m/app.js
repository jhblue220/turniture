/* ===========================================================================
   TURNitURE — phone build.

   Shares ../shapes.js, ../logo.js, ../intro.js and ../make.js with the desktop
   page untouched; what differs is everything the desktop drove with a pointer.
   There is no hover on a phone, so the card opens on a tap, the option bar box
   parks where you tap instead of chasing a cursor, and the white dot is gone.
   Geometry is authored on a 390-wide artboard — see styles.css.
   =========================================================================== */

const stage   = document.getElementById('stage');
const itemsEl = document.getElementById('items');
const win     = document.getElementById('window');
const dotsEl  = document.getElementById('dots');
const colors  = document.getElementById('colors');
const swatchesEl = document.getElementById('swatches');
const titleEl = document.querySelector('[data-title]');
const pages   = document.querySelectorAll('.page');
const navBtns = [...document.querySelectorAll('.nav__b')];

const TITLES = { images: 'Turn your image into', sounds: 'Turn your sound into' };
/* the pages that are a page in their own right rather than a picker tab */
const OWN = ['home', 'profile', 'cart'];

let page = 'home';          // 'home' | 'images' | 'sounds' | 'profile' | 'cart'
let colorsOpen = false;
// 1 = foreground, 2 = background — a different pair every time you arrive
const [startFg, startBg] = openingPair();
let slots = { 1: startFg, 2: startBg };
let nextSlot = 1;

/* ── artboard scaling ───────────────────────────────────────────────────────
   Width only: the artboard is 598 across — the width the sheets in Reference/
   are drawn on — and the type and spacing are sized for it, so the scale
   follows the screen's width and the height is taken as it comes. --vh is
   that height back in artboard units, which is what lets the stylesheet
   anchor things to the bottom of the screen.

   Capped at 1, because the redirect also catches small tablets and the
   composition does not want to be blown up past the size it was drawn.  */

const MAXK = 1;

/* The card is 361 x 574 at --s = 1, which is the size 02_Select_02 draws it.
   On a handset too short to hold that between the window's own insets it
   comes down together rather than being cropped. */
const CARD = 574, WIN_TOP = 380, WIN_BOT = 301, SMAX = 1;

function fit(){
  const k = Math.min(innerWidth / 598, MAXK);
  const vh = innerHeight / k;
  const r = document.documentElement.style;
  r.setProperty('--k', k);
  r.setProperty('--vh', vh);
  r.setProperty('--s', Math.min(SMAX, (vh - WIN_TOP - WIN_BOT) / CARD).toFixed(4));
  return k;
}
let k = fit();
addEventListener('resize', () => { k = fit(); });

/* ── items ──────────────────────────────────────────────────────────────── */

document.querySelector('.logo').innerHTML = LOGO_SVG;

/* The header is five glyphs now. Image, Sound and the palette are the three
   added for this build (Icon/Mobile_Icon/); the last two are the ones the
   desktop bar already used. */
const GLYPH = { images: 'image', sounds: 'sound', colors: 'colors',
                profile: 'profile', cart: 'cart' };
navBtns.forEach(b => { b.innerHTML = ICONS[GLYPH[b.dataset.nav]]; });

/* The silhouettes are sized off --s like the rest of the card, so they follow
   it when the window height changes. The viewBox is left at the traced size,
   which keeps the drift below working in the units the mockups were measured
   in whatever the card ends up being. */
const sized = (w, h) => `width:calc(var(--s) * ${w}px); height:calc(var(--s) * ${h}px)`;

const restSvg = s =>
  `<svg class="s-rest" viewBox="0 0 ${s.w} ${s.h}" style="${sized(s.w, s.h)}">
     <path d="${s.d}" fill-rule="evenodd"/>
   </svg>`;

/* One <path> per unit so each can be resized on its own; overflow:visible
   lets a unit grow past the cluster box without being clipped. */
const clusterSvg = c =>
  `<svg class="s-hover" viewBox="0 0 ${c.w} ${c.h}"
        style="${sized(c.w, c.h)}; --dy:calc(var(--s) * ${c.dy || 0}px); overflow:visible">
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

dotsEl.innerHTML = ITEMS.map(() => '<span class="dot"></span>').join('');
const dotEls = [...dotsEl.querySelectorAll('.dot')];

/* ── live shapes ────────────────────────────────────────────────────────────
   Each unit keeps its centre and its anchored edge; only width and height
   move, and the two move independently. 0.5 is the resting value and redraws
   the cluster exactly as measured from the mockup.                         */

const SWING_H = 0.95;   // how far height may stray from the mockup
const SWING_W = 0.30;   // how far width may

const clusterOf = el => ITEMS[+getComputedStyle(el).getPropertyValue('--i')].cluster;
const rest = n => new Array(n).fill(0.5);

/* Group the units that sit side by side and remember the gap the mockup left
   between neighbours. Rows are repacked from those gaps every frame, so a unit
   changing width pushes its neighbours along instead of opening a seam. */
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
    for (let j = 0; j < row.idx.length; j++) {
      const i = row.idx[j], u = c.units[i], { w, h } = size[i];
      x += row.gaps[j];
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
   While a card is open each unit wanders on its own: width and height each
   ease towards a fresh random target, each on its own clock, so the cluster
   keeps reshuffling instead of pulsing in unison. Opening always starts from
   the mockup proportions and drifts out from there.                        */

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

function openItem(el){
  itemEls.forEach(o => { if (o !== el) closeItem(o); });
  el.classList.add('is-hot');
  reset(el);                                   // always begin at the mockup
  startFrames();
}

function closeItem(el){
  if (!el.classList.contains('is-hot')) return;
  el.classList.remove('is-hot');
  const d = drifts.get(el) || reset(el);
  settling = { el, sw: d.sw.slice(), sh: d.sh.slice() };
  startFrames();
}

const hotItem = () => itemEls.find(e => e.classList.contains('is-hot'));

/* ── the row steps one card at a time ───────────────────────────────────────
   One card is centred and its neighbours are cropped at the screen edges, so
   a tap on a neighbour brings it to the middle first. */

const VISIBLE = 1;
const LAST    = Math.max(0, ITEMS.length - VISIBLE);

let pos = 0;

function slide(to){
  pos = Math.min(LAST, Math.max(0, to));
  itemsEl.style.setProperty('--pos', pos);
  document.getElementById('prev').classList.toggle('is-off', pos === 0);
  document.getElementById('next').classList.toggle('is-off', pos === LAST);
  dotEls.forEach((d, i) => d.classList.toggle('is-on', i === pos));
  // a card that slid out from the middle must not stay open
  settling = null;
  itemEls.forEach((el, i) => {
    el.classList.remove('is-hot');
    drifts.delete(el);
    const n = ITEMS[i].cluster.units.length;
    paint(el, rest(n), rest(n));
  });
}

document.getElementById('prev').addEventListener('click', e => { e.stopPropagation(); slide(pos - 1); });
document.getElementById('next').addEventListener('click', e => { e.stopPropagation(); slide(pos + 1); });

/* ── swipe ──────────────────────────────────────────────────────────────────
   Read off the window rather than left to the browser, which is why the
   window sets touch-action:none. The threshold is in real pixels, so it is
   the same flick of the thumb whatever the artboard is scaled to. */

const SWIPE = 40;                              // artboard px before it counts
let down = null, swiped = false;

win.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; swiped = false; });
win.addEventListener('pointercancel', () => { down = null; });
win.addEventListener('pointerup', e => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  down = null;
  if (Math.abs(dx) > SWIPE * k && Math.abs(dx) > Math.abs(dy)) {
    swiped = true;                             // so the tap underneath is ignored
    slide(pos + (dx < 0 ? 1 : -1));
  }
});

/* One tap brings a card to the middle, the next opens it — the dimensions and
   the drifting shape the desktop shows on hover — and the next makes it. */
itemEls.forEach((el, i) => {
  el.addEventListener('click', e => {
    e.stopPropagation();
    if (swiped) { swiped = false; return; }
    if (i !== pos) { slide(i); return; }
    if (!el.classList.contains('is-hot')) { openItem(el); return; }
    if (Make.open(el.dataset.id, page)) show(page, true);
  });
});

/* ── navigation ─────────────────────────────────────────────────────────── */

/* 'home' | 'images' | 'sounds' show their own page; 'make' keeps whichever
   picker tab we came from lit, and runs the palette the other way round. */
function show(next, making){
  if (!making) Make.close();
  Profile.close();
  Checkout.close();
  page = next;
  const shown = making ? 'make' : OWN.includes(next) ? next : 'picker';
  pages.forEach(p => p.classList.toggle('is-on', p.dataset.page === shown));
  document.documentElement.classList.toggle('is-flip', !!making);
  // only a recording gets a scrub bar, and the canvas has to clear it
  document.documentElement.classList.toggle('has-scrub', !!making && page === 'sounds');
  if (TITLES[next]) titleEl.textContent = TITLES[next];
  // the film and the title sequence under it (see below)
  atHome(next === 'home');
  paintTabs();
  if (making) Make.redraw();
  if (next === 'cart') Checkout.open();
}

/* ── the opening film ───────────────────────────────────────────────────────────────
   As on the desktop build: the film fills the handset, and the title
   sequence waits one screen below it. Swipe up to meet it, down to come
   back. Each runs only while it is the thing on screen. */

const heroVid  = document.querySelector('.hero__v');
const scroller = document.getElementById('scroller');
let deep = false;                       // is the title sequence the one on screen?

/* iOS refuses to start a film in Low Power Mode, and nothing here leans on
   it, so the refusal is let go of. */
const playFilm = on => { on ? heroVid.play().catch(() => {}) : heroVid.pause(); };

function depth(next){
  if (next === deep) return;
  deep = next;
  document.documentElement.classList.toggle('is-down', deep);
  deep ? Intro.start() : Intro.stop();
  playFilm(!deep);
}

/* arriving at the main page always starts at the film again */
function atHome(on){
  const r = document.documentElement.classList;
  r.toggle('is-home', on);
  deep = false; r.remove('is-down');
  Intro.stop();
  playFilm(on);
}

scroller.addEventListener('click', e => { e.stopPropagation(); depth(true); });

/* A flick of the thumb, read off the window — the picker's own swipe is on
   the card strip and never sees these. The threshold is in real pixels, so
   it is the same flick whatever the artboard is scaled to. */
let filmY = null;
addEventListener('touchstart', e => { filmY = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', e => {
  if (filmY === null || page !== 'home') return;
  const dy = filmY - e.touches[0].clientY;
  if (Math.abs(dy) > 40) { depth(dy > 0); filmY = null; }
}, { passive: true });
addEventListener('touchend', () => { filmY = null; });

/* and a wheel, for the handful of desktop browsers that land here */
addEventListener('wheel', e => {
  if (page !== 'home' || Math.abs(e.deltaY) < 2) return;
  depth(e.deltaY > 0);
}, { passive: true });

/* Whichever of the five is open gets the box, and its glyph is knocked out
   in the page colour. On the main page none of them is open — the film is
   not one of the five — so the box goes away. */
function paintTabs(){
  const lit = colorsOpen ? 'colors' : page === 'home' ? null : page;
  navBtns.forEach(b => b.classList.toggle('is-on', b.dataset.nav === lit));
  boxTo(navBtns.find(b => b.dataset.nav === lit) || null);
}

/* ── the option bar box ─────────────────────────────────────────────────────
   On the desktop it follows the pointer and parks on a click. With nothing to
   follow it marks whichever of the five buttons is open — paintTabs() puts it
   there — and travels when another one is opened. The buttons are 44 square,
   so the box is simply their own box.                                      */

const navbox = document.getElementById('navbox');
let boxAt = null;

function boxRect(el){
  const kk = +getComputedStyle(document.documentElement).getPropertyValue('--k');
  const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: (r.left - s.left) / kk, y: (r.top - s.top) / kk,
           w: r.width / kk,           h: r.height / kk };
}

function boxTo(el){
  if (!el) { navbox.classList.remove('is-on'); boxAt = null; return; }
  if (el === boxAt && navbox.classList.contains('is-on')) return;
  const fresh = !navbox.classList.contains('is-on');
  const r = boxRect(el);
  navbox.classList.toggle('is-pop', fresh);     // appear in place, or travel
  navbox.style.width  = `${r.w}px`;
  navbox.style.height = `${r.h}px`;
  if (fresh) {
    // park it small and in place, flush, then let it spring open
    navbox.style.transform = `translate(${r.x}px, ${r.y}px) scale(.72)`;
    void navbox.offsetWidth;
  }
  navbox.classList.add('is-on');
  navbox.style.transform = `translate(${r.x}px, ${r.y}px)`;
  boxAt = el;
}

// keep it on the parked button when the window resizes under it
addEventListener('resize', () => { const at = boxAt; boxAt = null; if (at) boxTo(at); });

navBtns.forEach(b => b.addEventListener('click', e => {
  e.stopPropagation();
  const n = b.dataset.nav;
  if (n === 'colors') { colorsOpen ? closeColors() : openColors(); return; }
  show(n);
}));

document.querySelector('.logo').addEventListener('click', e => {
  e.preventDefault();
  e.stopPropagation();
  show('home');
});

/* ── colour panel ───────────────────────────────────────────────────────────
   Fourteen chips down the right edge. The column spreads them between its top
   and bottom (styles.css) rather than stepping a fixed pitch, so the last one
   cannot fall off a short screen — which is why there is no inline top here.*/

swatchesEl.innerHTML = PALETTE.map((c, i) => `
  <button class="swatch" data-i="${i}" aria-label="colour ${i + 1}">
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

/* The bars a phone browser puts above and below the page take their colour
   from this one meta tag, and a fixed value in it leaves them a different
   colour from the page the moment the palette moves — which is what the
   status bar and the toolbar were doing.

   --bg is read back off the root rather than looked up in PALETTE: the
   input step of Let's Make runs the pair the other way round and the result
   step turns it back (make.js, `dressResult`), so the answer is whatever
   the stylesheet has arrived at, not whatever was picked. Which is also why
   the root's class is watched — that flip happens inside make.js and this
   file is not told about it. */
const chromeMeta = document.querySelector('meta[name="theme-color"]');

function paintChrome(){
  const bg = getComputedStyle(document.documentElement)
               .getPropertyValue('--bg').trim();
  if (bg) chromeMeta.setAttribute('content', bg);
}

new MutationObserver(paintChrome).observe(document.documentElement,
  { attributes: true, attributeFilter: ['class'] });

function applyColors(){
  const r = document.documentElement.style;
  r.setProperty('--c1', PALETTE[slots[1]]);
  r.setProperty('--c2', PALETTE[slots[2]]);
  paintSwatches();
  paintChrome();
  Make.redraw();        // canvas pixels do not follow CSS variables
  Checkout.redraw();
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
swatchEls.forEach((el, i) => { el.style.transitionDelay = `${i * 28}ms`; });

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

/* tapping anywhere else puts the panel away, and closes an open card */
document.addEventListener('click', () => {
  if (colorsOpen) closeColors();
  const hot = hotItem();
  if (hot) closeItem(hot);
});

/* ── live ───────────────────────────────────────────────────────────────────
   Mobile_LiveImage / Mobile_LiveSound. The desktop keeps the camera inside
   the little box it was armed from; at this width that box is the screen, so
   make.js tells us when a stream starts and the root takes a class the
   stylesheet can lay the whole page out from. The one round button underneath
   is the second press on the live box — make.js already knows what that
   means, so it is handed straight on. */

const liveBox = document.querySelector('.drop[data-kind="live"]');
const shootEl = document.querySelector('[data-shoot]');
const waveEl  = document.querySelector('[data-wave]');

shootEl.addEventListener('click', e => { e.stopPropagation(); liveBox.click(); });

Make.onLive((what, stream) => {
  const r = document.documentElement.classList;
  r.toggle('is-live-img', what === 'images');
  r.toggle('is-live-snd', what === 'sounds');
  what === 'sounds' ? startWave(stream) : stopWave();
});

/* What the mic is hearing, a bar at a time. The bars fill in from the left as
   the take runs and then scroll, so the row is a picture of how long you have
   been going as much as of how loud. */

const BARS = 13, BAR_MS = 130;
let ac = null, analyser = null, buf = null, waveRaf = null;
let levels = [], lastBar = 0;

function startWave(stream){
  stopWave();
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    buf = new Uint8Array(analyser.fftSize);
    ac.createMediaStreamSource(stream).connect(analyser);
  } catch (err) {
    console.warn('[m] no meter for this take:', err.name);
    return;
  }
  levels = []; lastBar = 0;
  waveRaf = requestAnimationFrame(drawWave);
}

function stopWave(){
  if (waveRaf) cancelAnimationFrame(waveRaf);
  waveRaf = null;
  if (ac) ac.close();
  ac = analyser = buf = null;
  levels = [];
}

/* root mean square of the window, pulled up so ordinary speech uses most of
   the height rather than a sliver of it */
function loudness(){
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
  return Math.min(1, Math.sqrt(sum / buf.length) * 3.4);
}

function drawWave(now){
  waveRaf = requestAnimationFrame(drawWave);
  if (!analyser) return;

  if (now - lastBar >= BAR_MS) {
    lastBar = now;
    levels.push(loudness());
    if (levels.length > BARS) levels.shift();
  }

  const dpr = Math.min(2, devicePixelRatio || 1);
  const box = waveEl.getBoundingClientRect();
  if (!box.width) return;
  const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
  if (waveEl.width !== w || waveEl.height !== h) { waveEl.width = w; waveEl.height = h; }

  const g = waveEl.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();

  // the row is laid out for the full count, so the bars stand still as they
  // come in rather than spreading out again on every frame
  const pitch = w / BARS, bw = pitch * 0.53;
  levels.forEach((v, i) => {
    const bh = Math.max(h * 0.06, h * (0.1 + 0.9 * v));
    g.fillRect(i * pitch + (pitch - bw) / 2, (h - bh) / 2, bw, bh);
  });
}

/* ── go ─────────────────────────────────────────────────────────────────── */

applyColors();
paintTabs();
slide(0);
atHome(true);
