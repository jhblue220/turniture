/* ===========================================================================
   Main-page title sequence, on a loop:

     1. "Furniture?" is typed out one letter at a time, growing outwards from
        the centre. While it is being typed every letter keeps swapping to a
        different typeface — no two letters ever share one.
     2. Once the last letter lands, the whole word snaps to Avenir.
     3. "Furniture?" leaves, "Turn It Yours" arrives (Avenir).
     4. "Turn It Yours" dissolves into the TURNitURE wordmark.
     5. Back to 1.
   =========================================================================== */

const WORD = 'Furniture?';

/* One entry per letter at minimum (10), so a shuffle can always hand out
   distinct faces. The Google families are loaded in index.html; the rest are
   system faces — the mix is richest on macOS, which is what the mockups use. */
const FONTS = [
  '"Playfair Display", serif',
  '"Archivo Black", sans-serif',
  '"Space Mono", monospace',
  '"Caveat", cursive',
  '"Abril Fatface", serif',
  'Georgia, serif',
  '"Courier New", Courier, monospace',
  '"Times New Roman", Times, serif',
  'Verdana, Geneva, sans-serif',
  '"Trebuchet MS", Tahoma, sans-serif',
  'Impact, Haettenschweiler, sans-serif',
  'Palatino, "Palatino Linotype", serif',
  'Futura, "Century Gothic", sans-serif',
  'Didot, "Bodoni MT", serif',
  '"American Typewriter", Rockwell, serif',
  'Copperplate, "Copperplate Gothic Light", fantasy'
];

const T = {
  letter:  125,   // gap between letters appearing
  shuffle:  85,   // how often the typefaces re-deal
  settled: 750,   // hold on the finished word, in Avenir
  stretch: 620,   // tracking out until the edges meet the next line
  cross:   460,   // one line leaving / the next arriving
  tagline:1250,   // hold on "Turn It Yours"
  logo:   1700,   // hold on the wordmark
  gap:     420    // blank beat before looping
};

const Intro = (() => {
  const root    = document.getElementById('intro');
  const wordEl  = document.getElementById('word');
  const lineEls = {
    word:    document.getElementById('introWord'),
    tagline: document.getElementById('introTagline'),
    logo:    document.getElementById('introLogo')
  };

  lineEls.logo.querySelector('.intro__fx').innerHTML = LOGO_SVG;

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let runId = 0;
  let shuffleTimer = null;

  const ABORT = Symbol('abort');
  const wait = (ms, my) => new Promise((ok, no) =>
    setTimeout(() => (my === runId ? ok() : no(ABORT)), ms));

  const show = name => Object.keys(lineEls)
    .forEach(k => lineEls[k].classList.toggle('is-on', k === name));

  /* Letter cells are fixed to their Avenir width, so swapping typefaces
     changes the glyph without the word jittering sideways. */
  function measure(){
    const c = document.createElement('canvas').getContext('2d');
    const fs = parseFloat(getComputedStyle(lineEls.word).fontSize);
    c.font = `900 ${fs}px Avenir`;
    return [...WORD].map(ch => ({ ch, w: c.measureText(ch).width }));
  }

  /* Every family draws a different cap height at the same font-size, which
     would make the word look like it was cut from a ransom note. Measure each
     one against Avenir once and scale it to match, so the faces change but the
     optical size does not. */
  let sizeOf = null;
  function calibrate(){
    const c = document.createElement('canvas').getContext('2d');
    const cap = font => {
      c.font = `900 100px ${font}`;
      return c.measureText('H').actualBoundingBoxAscent || 0;
    };
    const ref = cap('Avenir') || 71;
    sizeOf = new Map(FONTS.map(f => {
      const h = cap(f);
      const k = h ? ref / h : 1;
      return [f, Math.min(1.6, Math.max(0.7, k))];
    }));
  }

  /* offsetWidth carries one trailing letter-space after the last glyph, so
     strip it to get the width the eye actually reads. */
  const ink = el => el.offsetWidth - (parseFloat(getComputedStyle(el).letterSpacing) || 0);

  function recentre(w){
    wordEl.style.transform = `translateX(${-(w ?? ink(wordEl)) / 2}px)`;
  }

  /* Track a line out (or in) until it spans exactly `target`, so the line that
     replaces it lands on the same left and right edges. */
  async function stretchTo(el, target, n, my, centred){
    el.classList.add('is-stretch');
    const ls = parseFloat(getComputedStyle(el).letterSpacing) || 0;
    el.style.letterSpacing = `${ls + (target - ink(el)) / (n - 1)}px`;
    if (centred) recentre(target);
    await wait(T.stretch, my);
    el.classList.remove('is-stretch');
  }

  function deal(spans){
    const pool = FONTS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    spans.forEach((s, i) => {
      s.style.fontFamily = pool[i];
      s.style.fontSize = `${(sizeOf.get(pool[i]) * 100).toFixed(1)}%`;
    });
  }

  async function sequence(my){
    const cells = measure();
    const tagFx = lineEls.tagline.querySelector('.intro__fx');
    const logoFx = lineEls.logo.querySelector('.intro__fx');

    // 1 — clear anything the previous round (or an interrupted one) left behind,
    //     with transitions off so the new round starts from a clean frame
    wordEl.innerHTML = '';
    [wordEl, tagFx].forEach(el => {
      el.classList.remove('is-stretch');
      el.classList.add('is-instant');
      el.style.letterSpacing = '';
    });
    wordEl.style.transform = '';
    void wordEl.offsetWidth;                       // flush
    [wordEl, tagFx].forEach(el => el.classList.remove('is-instant'));

    recentre();
    show('word');
    const spans = [];
    shuffleTimer = setInterval(() => spans.length && deal(spans), T.shuffle);

    for (const { ch, w } of cells) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = ch;
      s.style.width = `${w}px`;
      wordEl.appendChild(s);
      spans.push(s);
      deal(spans);
      recentre();
      await wait(T.letter, my);
    }

    // 2 — everything lands on Avenir Black
    clearInterval(shuffleTimer); shuffleTimer = null;
    spans.forEach(s => { s.style.fontFamily = ''; s.style.fontSize = ''; });
    recentre();
    await wait(T.settled, my);

    // 3 — track out until the word spans the tagline, then hand over
    await stretchTo(wordEl, ink(tagFx), WORD.length, my, true);
    show('tagline');
    await wait(T.cross + T.tagline, my);

    // 4 — the tagline does the same against the wordmark, then dissolves into it
    await stretchTo(tagFx, logoFx.offsetWidth, tagFx.textContent.length, my, false);
    show('logo');
    await wait(T.cross + T.logo, my);

    // 5 — a blank beat, then round again
    show(null);
    await wait(T.gap, my);
  }

  async function start(){
    if (still) { show('logo'); return; }
    const my = ++runId;
    try {
      await document.fonts.ready;
      if (!sizeOf) calibrate();
      for (;;) {
        if (my !== runId) return;
        await sequence(my);
      }
    } catch (e) {
      if (e !== ABORT) throw e;
    }
  }

  function stop(){
    runId++;
    if (shuffleTimer) { clearInterval(shuffleTimer); shuffleTimer = null; }
    show(null);
  }

  return { start, stop, root };
})();
