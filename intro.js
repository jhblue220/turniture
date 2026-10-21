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
  settled: 950,   // hold on the finished word, in Avenir
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
    c.font = `600 ${fs}px "Avenir Next"`;
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
      c.font = `600 100px ${font}`;
      return c.measureText('H').actualBoundingBoxAscent || 0;
    };
    const ref = cap('"Avenir Next"') || 71;
    sizeOf = new Map(FONTS.map(f => {
      const h = cap(f);
      const k = h ? ref / h : 1;
      return [f, Math.min(1.6, Math.max(0.7, k))];
    }));
  }

  function recentre(){
    wordEl.style.transform = `translateX(${-wordEl.offsetWidth / 2}px)`;
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

    // 1 — type it out, reshuffling the faces as it goes
    wordEl.innerHTML = '';
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

    // 2 — everything lands on Avenir
    clearInterval(shuffleTimer); shuffleTimer = null;
    spans.forEach(s => { s.style.fontFamily = ''; s.style.fontSize = ''; });
    await wait(T.settled, my);

    // 3 — hand over to the tagline
    show('tagline');
    await wait(T.cross + T.tagline, my);

    // 4 — and dissolve into the wordmark
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
