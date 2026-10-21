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
   move. 0.5 means "nothing happening" and redraws the shape as measured from
   the mockup, so a still room or a silent mic looks exactly like the
   reference.                                                               */

const SWING_H = 0.95;   // how far height reacts
const SWING_W = 0.30;   // how far width reacts

function paint(el, vals){
  const c = ITEMS[+getComputedStyle(el).getPropertyValue('--i')].cluster;
  const paths = el.querySelectorAll('.s-hover path');
  c.units.forEach((u, i) => {
    const v  = vals[i] ?? 0.5;
    const w  = u.w * (1 + SWING_W * (v - 0.5));
    const h  = Math.min(c.h, Math.max(u.h * 0.3, u.h * (1 + SWING_H * (v - 0.5))));
    const dx = u.x + (u.w - w) / 2;
    const dy = c.anchor === 'bottom' ? c.h - h
             : c.anchor === 'center' ? (u.y ?? 0) + (u.h - h) / 2
             : 0;
    const p = paths[i];
    p.setAttribute('d', c.unit(w, h, u, c.h));
    p.setAttribute('transform', `translate(${dx.toFixed(2)},${dy.toFixed(2)})`);
  });
}

const neutral = n => new Array(n).fill(0.5);
itemEls.forEach((el, i) => paint(el, neutral(ITEMS[i].cluster.units.length)));

let frame = null;
let settling = null;        // values easing back to neutral after a mouseleave

function tick(){
  const hot = itemEls.find(e => e.classList.contains('is-hot'));
  if (hot) {
    settling = null;
    const n = ITEMS[+getComputedStyle(hot).getPropertyValue('--i')].cluster.units.length;
    paint(hot, Sense.read(n));
    frame = requestAnimationFrame(tick);
    return;
  }
  if (settling) {                       // ease the shape back before stopping
    const { el, vals } = settling;
    let done = true;
    for (let i = 0; i < vals.length; i++) {
      vals[i] += (0.5 - vals[i]) * 0.2;
      if (Math.abs(vals[i] - 0.5) > 0.004) done = false;
    }
    paint(el, vals);
    if (!done) { frame = requestAnimationFrame(tick); return; }
    paint(el, neutral(vals.length));
    settling = null;
  }
  frame = null;
}

const startFrames = () => { if (frame === null) frame = requestAnimationFrame(tick); };

itemEls.forEach(el => {
  el.addEventListener('mouseenter', () => { el.classList.add('is-hot'); startFrames(); });
  el.addEventListener('mouseleave', () => {
    el.classList.remove('is-hot');
    const n = ITEMS[+getComputedStyle(el).getPropertyValue('--i')].cluster.units.length;
    settling = { el, vals: Sense.read(n).slice() };
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
  itemEls.forEach((el, i) => {
    el.classList.remove('is-hot');
    paint(el, neutral(ITEMS[i].cluster.units.length));
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
  // the title sequence only runs while the main page is on screen,
  // and the camera / mic only while a picker page is
  if (next === 'home') { Intro.start(); Sense.stop(); } else Intro.stop();
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
  // the click is the user gesture the browser wants before it will prompt
  if (t === 'images') Sense.use('camera');
  if (t === 'sounds') Sense.use('mic');
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
