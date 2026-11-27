/* ===========================================================================
   The four screens after the film.

   `Reference/Process_01.png` is the running order: the drawing, the G-code
   film, the tray grid, the end frame. This file fills all four and runs
   them; `app.js` only ever says which one is up.

   ── why they all answer to the palette ───────────────────────────────────
   Every one of them is the viewer's two colours and nothing else. Slot 2 is
   the ground, slot 1 is everything drawn on it, exactly as the rest of the
   site works. That is why the drawing and the end frame are fetched and put
   into the page rather than hung in an `<img>`: an SVG in an `<img>` is a
   document of its own and cannot see `--c1`, so it would stay the colour it
   was exported in. Put in, it is just more of the page.

   The tray grid is the odd one. It is three photographs, not a drawing, so
   there is nothing to recolour — instead it goes through a two-tone filter
   that lands black on slot 1 and white on slot 2, and the nine photographs
   are then laid back over it in their own colours through a clip. The
   middle cell is left under the filter, because the tray mark and its
   wording are drawing and belong in slot 1 with everything else.
   =========================================================================== */

const Process = (() => {

  /* ── the drawing ───────────────────────────────────────────────────────
     Seven pieces, left to right: the person, an arrow, the burst, an arrow,
     the printer, an arrow, the chair. They arrive in that order a fifth of
     a second apart, and each one keeps a wobble of its own afterwards — the
     boil of a hand-drawn loop, which is what it is meant to read as. The
     numbers below are what make each wobble a different one. */
  const STEP  = 0.2;                       // seconds between arrivals
  const BOIL  = [                          // one per piece, in drawing order
    { dur: 0.72, x: 1.6, y: 1.1, r: 0.55, s: 1.004 },   // person
    { dur: 0.95, x: 0.9, y: 1.8, r: 0.30, s: 1.006 },   // arrow
    { dur: 0.55, x: 2.1, y: 1.4, r: 0.95, s: 1.010 },   // burst
    { dur: 1.10, x: 1.2, y: 1.5, r: 0.25, s: 1.004 },   // arrow
    { dur: 0.83, x: 1.1, y: 1.9, r: 0.45, s: 1.005 },   // printer
    { dur: 0.88, x: 1.5, y: 1.2, r: 0.35, s: 1.006 },   // arrow
    { dur: 0.66, x: 1.8, y: 1.3, r: 0.70, s: 1.008 }    // chair
  ];

  /* ── the tray grid ─────────────────────────────────────────────────────
     Measured off the stills themselves (1920 x 2000): three columns at 280,
     744 and 1208, three rows at 219, 748 and 1277, each cell 432 x 504. The
     middle one is the tray mark and stays two-tone. */
  const SHEET = { w: 1920, h: 2000, cw: 432, ch: 504,
                  cx: [280, 744, 1208], cy: [219, 748, 1277], skip: 4 };
  const FRAMES = ['1.png', '2.png', '3.png'];
  const HOLD   = 1500;                     // ms a still is up
  const CROSS  = 420;                      // ms it takes to swap

  let root = '', panes = [], seq = null, gcode = null;
  let tray = null, trayI = 0, trayT = null, duo = null;
  let groups = [], seqOn = false;

  const q = s => document.querySelector(s);

  /* a colour the page is actually using, as three 0..1 numbers */
  function slot(n){
    const v = getComputedStyle(document.documentElement)
                .getPropertyValue('--c' + n).trim() || '#000000';
    const m = v.match(/^#([0-9a-f]{6})$/i);
    const i = m ? parseInt(m[1], 16) : 0;
    return [(i >> 16 & 255) / 255, (i >> 8 & 255) / 255, (i & 255) / 255];
  }

  /* ── the two-tone filter ───────────────────────────────────────────────
     Luminance first, then each channel is read off a two-stop table: black
     comes out slot 1, white comes out slot 2, and everything between is the
     straight line across. It is one `<filter>` in the page, written once and
     rewritten whenever the palette moves. */
  function duotone(){
    if (!duo){
      const ns = 'http://www.w3.org/2000/svg';
      const s  = document.createElementNS(ns, 'svg');
      s.setAttribute('class', 'duo-def');
      s.innerHTML =
        '<filter id="duo" color-interpolation-filters="sRGB">' +
          '<feColorMatrix type="matrix" values="' +
            '.299 .587 .114 0 0 .299 .587 .114 0 0 .299 .587 .114 0 0 0 0 0 1 0"/>' +
          '<feComponentTransfer>' +
            '<feFuncR type="table"/><feFuncG type="table"/><feFuncB type="table"/>' +
          '</feComponentTransfer>' +
        '</filter>';
      document.body.appendChild(s);
      duo = s;
    }
    const a = slot(1), b = slot(2);         // black -> slot 1, white -> slot 2
    const f = duo.querySelectorAll('feFuncR, feFuncG, feFuncB');
    for (let i = 0; i < 3; i++)
      f[i].setAttribute('tableValues', a[i].toFixed(4) + ' ' + b[i].toFixed(4));
  }

  /* ── building ──────────────────────────────────────────────────────── */

  async function drawing(){
    const host = q('[data-seq]');
    if (!host) return;
    try {
      host.innerHTML = await (await fetch(root + 'Process/sequence.svg')).text();
    } catch (e) { return; }
    groups = [...host.querySelectorAll('svg > g')];
    groups.forEach((g, i) => {
      const b = BOIL[i % BOIL.length];
      /* The wobble is a CSS animation so it costs the main thread nothing;
         what differs per piece is set here rather than in the stylesheet,
         because there is no sensible way to write seven of them by hand. */
      g.style.setProperty('--bx', b.x + 'px');
      g.style.setProperty('--by', b.y + 'px');
      g.style.setProperty('--br', b.r + 'deg');
      g.style.setProperty('--bs', b.s);
      g.style.animationDuration = b.dur + 's';
      g.style.animationDelay    = (-b.dur * (i / BOIL.length)) + 's';
      g.style.transitionDelay   = (i * STEP) + 's';
    });
  }

  async function endframe(){
    const host = q('[data-endframe]');
    if (!host) return;
    try {
      host.innerHTML = await (await fetch(root + 'Process/endframe.svg')).text();
    } catch (e) {}
  }

  /* Each still twice over: once whole under the filter, once as the nine
     cells in their own colours laid back on top. The middle cell is left
     out — it is the tray mark, which is drawing and belongs in slot 1 —
     and so is the first still, which is wording rather than photographs.

     The cells are sprites rather than clips: one box per cell with the
     whole sheet as its background, sized and placed by the usual sprite
     sum. `clip-path` cannot hold eight separate rectangles. */
  function trayGrid(){
    const host = q('[data-tray]');
    if (!host) return;
    const S = SHEET;

    const cells = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++){
        if (r * 3 + c === S.skip) continue;
        cells.push({
          l:  S.cx[c] / S.w * 100,  t: S.cy[r] / S.h * 100,
          w:  S.cw    / S.w * 100,  h: S.ch    / S.h * 100,
          bx: S.cx[c] / (S.w - S.cw) * 100,
          by: S.cy[r] / (S.h - S.ch) * 100
        });
      }
    const sx = S.w / S.cw * 100, sy = S.h / S.ch * 100;

    host.innerHTML = FRAMES.map((f, i) => {
      const src = root + 'Video/TrayVariation/' + f;
      const cut = i ? cells.map(c =>
        `<i class="tray__c" style="left:${c.l}%;top:${c.t}%;width:${c.w}%;height:${c.h}%;` +
        `background-image:url('${src}');background-size:${sx}% ${sy}%;` +
        `background-position:${c.bx}% ${c.by}%"></i>`).join('') : '';
      return `<div class="tray__f${i ? '' : ' is-on'}">` +
             `<img class="tray__duo" src="${src}" alt="">${cut}</div>`;
    }).join('');
    tray = [...host.querySelectorAll('.tray__f')];
  }

  /* ── running ───────────────────────────────────────────────────────── */

  function seqRun(on){
    if (!groups.length || on === seqOn) return;
    seqOn = on;
    /* Going back up they leave together rather than one by one: a staggered
       exit would read as a second thought. */
    groups.forEach((g, i) => { g.style.transitionDelay = on ? (i * STEP) + 's' : '0s'; });
    q('[data-seq]').classList.toggle('is-on', on);
  }

  function trayRun(on){
    clearTimeout(trayT); trayT = null;
    if (!tray) return;
    if (!on){ trayI = 0; tray.forEach((f, i) => f.classList.toggle('is-on', !i)); return; }
    const step = () => {
      trayI = (trayI + 1) % tray.length;
      tray.forEach((f, i) => f.classList.toggle('is-on', i === trayI));
      trayT = setTimeout(step, HOLD + CROSS);
    };
    trayT = setTimeout(step, HOLD + CROSS);
  }

  /* The file is only named when the screen is first reached — it is fifteen
     megabytes and most visits never get this far. Asking a video to play in
     the same breath as handing it a source is a race the load usually wins,
     so the wish is remembered and acted on again once there are frames. */
  let gwant = false;
  function gcodeRun(on){
    if (!gcode) return;
    gwant = on;
    if (!on){
      gcode.pause();
      try { gcode.currentTime = 0; } catch (e) {}
      return;
    }
    if (!gcode.src){
      gcode.addEventListener('canplay', () => { if (gwant) gcode.play().catch(() => {}); });
      gcode.src = root + 'Video/Gcodeexperiement.mp4';
    }
    gcode.play().catch(() => {});
  }

  /* ── outside ───────────────────────────────────────────────────────── */

  function mount(){
    panes = [...document.querySelectorAll('[data-pane]')];
    if (!panes.length) return;
    root  = panes[0].dataset.root || '';
    gcode = q('[data-gcode]');
    duotone();
    drawing(); endframe(); trayGrid();
  }

  /* `n` is how deep the page is; the four of these are the screens after
     the film, so the first of them is `base`. */
  function at(n, base){
    const k = n - base;                      // -1 and below: none of them
    panes.forEach((p, i) => p.classList.toggle('is-up', k >= i));
    seqRun(k === 0);
    gcodeRun(k === 1);
    trayRun(k === 2);
  }

  return { mount, at,
           count:  () => panes.length,
           redraw: () => duotone() };        // the palette moved
})();
