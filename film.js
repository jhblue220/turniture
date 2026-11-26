/* ===========================================================================
   The scroll film.

   One screen below the title sequence the room plays, and the wheel is what
   plays it. Nothing runs by itself: a notch down is a step forward through
   the film, a notch up is a step back, and letting go of the wheel leaves the
   picture on the frame it had reached.

   ── how the scroll becomes a time ────────────────────────────────────────
   Not evenly, which is the whole point. `film-scenes.js` gives each shot a
   weight, so the seconds a rectangle is up are given two or three times the
   wheel of the footage either side of them, and a `pin` after it is a piece
   of film with no length at all — the scroll runs on, the frame does not
   change. That is the pause. Scrolling is never blocked and no timer is ever
   started; the map from scroll to seconds is simply not a straight line.

   ── why the picture is not jumped straight to that time ──────────────────
   A wheel arrives in a flurry of notches and a seek is not free, so the time
   the scroll asks for is a target the shown time eases towards, frame by
   frame. That easing is what makes it feel like film rather than like a
   slider, and it is also what keeps the decoder from being asked for forty
   different seconds in one second of wall clock.

   ── why the rectangles are measured against the video and not the window ──
   The film is laid against the window like the opening one, so it is cropped
   by `object-fit:cover` to whatever shape the window is. A rectangle given in
   window terms would slide off the furniture the moment the window changed
   shape. They are given as a share of the video frame instead, 0..1, and this
   file works out where that frame actually landed on the glass.
   =========================================================================== */

const Film = (() => {

  const S = FILM_SCENES;

  const TAU    = 0.085;   // seconds for the shown time to catch the asked one
  const SEEK   = 1 / 90;  // don't trouble the decoder for less than this
  const REVEAL = 0.18;    // a mark arrives over this share of its shot
  const FADE   = 0.030;   // and leaves over this share of the whole film
  const OVER   = 130;     // wheel past the top edge before the film lets go
  const JUMP   = 0.5;     // seconds: past this, go straight there instead of easing

  let el, vid, gfx;
  let marks = [], pieces = [], total = 0, dur = 0;
  let broken = false, built = false, on = false;
  let px = 0, over = 0;
  let tNow = 0, last = 0, frame = null;
  let crop = { x: 0, y: 0, w: 0, h: 0 };

  const cl   = v => Math.max(0, Math.min(1, v));
  const ease = v => 1 - Math.pow(1 - v, 3);          // easeOutCubic

  /* ── the map ─────────────────────────────────────────────────────────────
     A list of pieces, each a stretch of film and the share of the scroll it
     is given. A pinned piece has the same second at both ends. */
  function layout(){
    pieces = []; total = 0;
    let cur = 0;

    const add = (t0, t1, len) => { pieces.push({ t0, t1, len, p0: 0, p1: 0 }); total += len; return pieces.length - 1; };

    for (const sh of S.shots){
      if (sh.in > cur) add(cur, sh.in, (sh.in - cur) * S.gap);
      sh._a = add(sh.in, sh.out, (sh.out - sh.in) * (sh.hold ?? 1));
      sh._b = sh.pin ? add(sh.out, sh.out, sh.pin) : sh._a;
      cur = sh.out;
    }
    if (dur > cur + 0.01) add(cur, dur, (dur - cur) * S.gap);

    let acc = 0;
    for (const pc of pieces){ pc.p0 = acc / total; acc += pc.len; pc.p1 = acc / total; }
    for (const sh of S.shots){ sh.p0 = pieces[sh._a].p0; sh.p1 = pieces[sh._b].p1; }
  }

  function timeAt(p){
    for (let i = 0; i < pieces.length; i++){
      const pc = pieces[i];
      if (p <= pc.p1 || i === pieces.length - 1){
        const k = pc.p1 > pc.p0 ? cl((p - pc.p0) / (pc.p1 - pc.p0)) : 0;
        return pc.t0 + (pc.t1 - pc.t0) * k;
      }
    }
    return 0;
  }

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
        marks.push(m);
      }
    }
    built = true;
  }

  function paint(p, t){
    for (const m of marks){
      const sh   = m.shot;
      const span = (sh.p1 - sh.p0) || 1e-6;
      const from = sh.p0 + span * (m.at || 0);
      const a    = ease(cl((p - from) / (span * REVEAL)));
      const gone = 1 - cl((p - sh.p1) / FADE);
      const v    = Math.min(a, Math.max(0, gone));

      if (v <= 0){ m.el.style.opacity = '0'; continue; }

      const r = rect(m, t);
      m.el.style.opacity   = v;
      m.el.style.width     = (r[2] * crop.w) + 'px';
      m.el.style.height    = (r[3] * crop.h) + 'px';
      m.el.style.transform =
        `translate(${crop.x + r[0] * crop.w}px, ${crop.y + r[1] * crop.h}px) scale(${1 + 0.05 * (1 - a)})`;

      if (m.txt){
        const b = ease(cl((p - from - span * 0.05) / (span * REVEAL * 1.25)));
        m.txt.style.opacity   = Math.min(b, Math.max(0, gone));
        m.txt.style.transform = `translateY(${(1 - b) * 7}px)`;
      }
    }
  }

  function tick(now){
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;

    const want = timeAt(px / S.run);
    /* A long jump is not a camera move, it is somebody dragging the scrollbar
       or coming back to the page. Easing across it would have the decoder
       chasing a second a frame and arriving late; go straight there. */
    tNow = Math.abs(want - tNow) > JUMP
      ? want
      : tNow + (want - tNow) * (1 - Math.exp(-dt / TAU));

    /* Only ever one seek in the air. Assigning `currentTime` again while the
       last one is still working does not cancel it — the requests queue, the
       picture falls behind the scroll and never catches up. */
    if (!broken && !vid.seeking && vid.readyState >= 1
        && Math.abs(vid.currentTime - tNow) > SEEK){
      try { vid.currentTime = tNow; } catch (e) {}
    }
    paint(px / S.run, tNow);
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
    const ready = () => {
      dur = vid.duration || 6;
      layout(); cover(); build();
      try { vid.currentTime = 0; } catch (e) {}
    };
    vid.addEventListener('error', () => { broken = true; });
    vid.addEventListener('loadedmetadata', ready);
    /* `film-scenes.js` names the file from the site root; the portrait build
       sits a folder down and says so with data-root, the way its own markup
       already reaches back for the opening film. */
    vid.src = (el.dataset.root || '') + S.src;    // listeners first, then load
    if (vid.readyState >= 1) ready();
    addEventListener('resize', () => { if (vid.videoWidth){ cover(); if (on) paint(px / S.run, tNow); } });
  }

  function enter(){
    if (on || broken) return;
    on = true; px = 0; over = 0; tNow = 0; last = performance.now();
    /* iOS will not decode, and so will not seek, a film it has never been
       told to play. One play-and-stop at the start is what unlocks it. */
    vid.play().then(() => vid.pause()).catch(() => {});
    if (!built && vid.readyState >= 1){ dur = vid.duration || 6; layout(); cover(); build(); }
    frame = requestAnimationFrame(tick);
  }

  function leave(){
    on = false;
    cancelAnimationFrame(frame); frame = null;
    vid.pause();
  }

  /* Returns 'top' when the wheel has been pushed past the start of the film
     for long enough that it should hand the screen back to the titles. */
  function scroll(dy){
    if (!on) return null;
    if (dy < 0 && px <= 0){
      over += -dy;
      return over > OVER ? (over = 0, 'top') : null;
    }
    over = 0;
    px = Math.max(0, Math.min(S.run, px + dy));
    return null;
  }

  return { mount, enter, leave, scroll,
           ok:  () => !broken,
           at:  () => px / S.run };
})();
