/* ===========================================================================
   The film.

   One screen below the title sequence the room plays. It plays itself: the
   screen arrives, the film starts from the top, and six seconds later it is
   over. The wheel is not part of it — a notch down from the titles brings
   this screen in, a notch up sends it back, and that is all the wheel does
   here.

   ── what drives the rectangles ───────────────────────────────────────────
   The film's own clock, and nothing else. `vid.currentTime` is read once a
   frame and every rectangle's arrival is a second in `film-scenes.js`
   against it. No seeking, no easing of the time, no map: the decoder plays
   forward, which is the one thing it is good at.

   ── why the clock outlives the film ──────────────────────────────────────
   The camera only reaches the view from above at 5.85 and the film runs out
   at 6.04, which is not room for five rectangles to arrive one after
   another. So the clock keeps counting past the end while the picture sits
   on its last frame — `tail` in the settings — and the final beat plays out
   on the still. It reads as the camera coming to rest, which is what it is.

   ── why the rectangles are measured against the video and not the window ──
   The film is laid against the window like the opening one, so it is cropped
   by `object-fit:cover` to whatever shape the window is. A rectangle given in
   window terms would slide off the furniture the moment the window changed
   shape. They are given as a share of the video frame instead, 0..1, and this
   file works out where that frame actually landed on the glass.
   =========================================================================== */

const Film = (() => {

  const S = FILM_SCENES;

  const RISE = 0.22;      // seconds a rectangle takes to arrive
  const FALL = 0.26;      // and to leave

  let el, vid, gfx;
  let marks = [];
  let broken = false, built = false, on = false;
  let dur = 0, vt = 0, last = 0, frame = null;
  let crop = { x: 0, y: 0, w: 0, h: 0 };

  const cl   = v => Math.max(0, Math.min(1, v));
  const ease = v => 1 - Math.pow(1 - v, 3);          // easeOutCubic

  /* ── where the video frame actually landed ───────────────────────────────
     The same sum `object-fit` does, so the rectangles land on the furniture
     rather than near it. Which of the two sums depends on the window.

     A window roughly the film's own shape is filled: the long side runs off
     both edges evenly and nothing of the frame that matters is lost. But a
     portrait handset is nowhere near 16:9, and filling it throws away about
     three quarters of the width — enough that a rectangle drawn around the
     cabinet stops reading as a rectangle at all and becomes a band running
     off both sides. Below `FILL_BELOW` the frame is laid in whole instead,
     with the page colour above and below it, the way the artboard itself
     letterboxes in a window of the wrong shape.

     `object-fit` is set from here too, so the picture and the sum can never
     disagree about which of the two is happening. */
  const FILL_BELOW = 1.3;               // window w/h under this is letterboxed

  function cover(){
    const W = innerWidth, H = innerHeight;
    const rv = (vid.videoWidth || 16) / (vid.videoHeight || 9);
    const fill = (W / H) >= FILL_BELOW;
    vid.style.objectFit = fill ? 'cover' : 'contain';

    let w, h;
    if (fill) { w = (W / H > rv) ? W : H * rv; h = (W / H > rv) ? W / rv : H; }
    else      { w = (W / H > rv) ? H * rv : W; h = (W / H > rv) ? H : W / rv; }
    crop = { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }

  /* a mark's box at this second — a plain one, or eased along its track */
  function rect(m, t){
    const k = m.track;
    if (!k || k.length < 2) return m.box;
    if (t <= k[0][0]) return k[0].slice(1);
    if (t >= k[k.length - 1][0]) return k[k.length - 1].slice(1);
    for (let i = 1; i < k.length; i++){
      if (t <= k[i][0]){
        const u = (t - k[i-1][0]) / ((k[i][0] - k[i-1][0]) || 1);
        return [1, 2, 3, 4].map(j => k[i-1][j] + (k[i][j] - k[i-1][j]) * u);
      }
    }
    return m.box;
  }

  function build(){
    marks = [];
    gfx.textContent = '';
    for (const sh of S.shots){
      for (const m of sh.marks || []){
        const d = document.createElement('div');
        d.className = 'fmark';
        const wording = sh.label === false ? null : (sh.label || S.label);
        if (wording){
          const s = document.createElement('span');
          s.className = 'fmark__t';
          s.textContent = wording;
          d.appendChild(s);
          m.txt = s;
        }
        gfx.appendChild(d);
        m.el = d; m.shot = sh;
        m.t0 = sh.in + (m.at || 0);
        marks.push(m);
      }
    }
    built = true;
  }

  function paint(t){
    for (const m of marks){
      const sh   = m.shot;
      const a    = ease(cl((t - m.t0) / RISE));
      /* `out: null` is the last word on the screen — it stays up. */
      const gone = sh.out == null ? 1 : 1 - cl((t - sh.out) / FALL);
      const v    = Math.min(a, Math.max(0, gone));

      if (v <= 0){ m.el.style.opacity = '0'; continue; }

      const r = rect(m, t);
      m.el.style.opacity   = v;
      m.el.style.width     = (r[2] * crop.w) + 'px';
      m.el.style.height    = (r[3] * crop.h) + 'px';
      m.el.style.transform =
        `translate(${crop.x + r[0] * crop.w}px, ${crop.y + r[1] * crop.h}px) scale(${1 + 0.05 * (1 - a)})`;

      if (m.txt){
        const b = ease(cl((t - m.t0 - 0.06) / (RISE * 1.25)));
        m.txt.style.opacity   = Math.min(b, Math.max(0, gone));
        m.txt.style.transform = `translateY(${(1 - b) * 7}px)`;
      }
    }
  }

  function tick(now){
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;

    /* The film's clock while there is film left, then our own. A paused or
       stalled decoder simply stops the rectangles with the picture, which is
       the honest thing for it to do. */
    if (vid.ended || vid.currentTime >= dur - 0.02)
      vt = Math.min(dur + (S.tail || 0), Math.max(vt, dur) + dt);
    else
      vt = vid.currentTime;

    paint(vt);
    frame = on ? requestAnimationFrame(tick) : null;
  }

  /* ── outside ─────────────────────────────────────────────────────────── */

  function mount(){
    el  = document.querySelector('.film');
    if (!el) return;
    vid = el.querySelector('video');
    gfx = el.querySelector('[data-film-g]');

    /* The one place the file is named is `film-scenes.js`, so it is set here
       rather than in the markup. Should it be missing, `broken` is what the
       page reads: the film screen is skipped and the main page is the two it
       always was, rather than a black screen nobody can scroll past. */
    const ready = () => { ready_(); try { vid.currentTime = 0; } catch (e) {} };
    vid.addEventListener('error', () => { broken = true; });
    vid.addEventListener('loadedmetadata', ready);
    /* `film-scenes.js` names the file from the site root; the portrait build
       sits a folder down and says so with data-root, the way its own markup
       already reaches back for the opening film. */
    vid.src = (el.dataset.root || '') + S.src;    // listeners first, then load
    if (vid.readyState >= 1) ready();
    addEventListener('resize', () => { if (vid.videoWidth){ cover(); if (on) paint(vt); } });
  }

  function enter(){
    if (on || broken) return;
    on = true; vt = 0; last = performance.now();
    if (!built && vid.readyState >= 1) ready_();
    try { vid.currentTime = 0; } catch (e) {}
    vid.play().catch(() => {});
    paint(0);
    frame = requestAnimationFrame(tick);
  }

  /* the same first load as `mount`, for the case where the metadata only
     arrived after it ran */
  function ready_(){ dur = vid.duration || 6; cover(); build(); }

  function leave(){
    on = false;
    cancelAnimationFrame(frame); frame = null;
    vid.pause();
    try { vid.currentTime = 0; } catch (e) {}
    vt = 0;
    if (built) paint(0);
  }

  return { mount, enter, leave,
           ok:   () => !broken,
           done: () => vt >= dur + (S.tail || 0),
           at:   () => vt };
})();
