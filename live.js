/* ===========================================================================
   What a live take looks like while it is being taken.

   A recording has nothing to show — no viewfinder, no picture — so the page
   draws what the microphone is hearing instead, and counts how long you have
   been going. Both builds need the same two things (Web_LiveSound and
   04_Live_Sound draw the same row of bars at different sizes), so they live
   here rather than twice over.

   `make.js` owns the stream; this only ever reads it. Nothing here touches
   the page beyond the one canvas it is handed, and whichever build is using
   it puts the clock's text where its own sheet puts it.
   =========================================================================== */

const Live = (() => {

  let ac = null, analyser = null, buf = null, raf = null;
  let cv = null, bars = 18, barMs = 110;
  let levels = [], lastBar = 0, began = 0;

  /* ── the meter ──────────────────────────────────────────────────────────
     A browser that refuses the AudioContext still gets a clock and a take —
     it just has nothing to look at while it records, which is worth less
     than the recording itself. */

  function start(canvas, stream, opts){
    stop();
    cv    = canvas;
    bars  = (opts && opts.bars)  || 18;
    barMs = (opts && opts.barMs) || 110;
    began = performance.now();
    levels = []; lastBar = 0;

    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      buf = new Uint8Array(analyser.fftSize);
      ac.createMediaStreamSource(stream).connect(analyser);
    } catch (err) {
      console.warn('[live] no meter for this take:', err.name);
      ac = analyser = buf = null;
      return false;
    }
    raf = requestAnimationFrame(draw);
    return true;
  }

  function stop(){
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (ac) ac.close();
    ac = analyser = buf = null;
    levels = [];
    began = 0;
    if (cv) {
      const g = cv.getContext('2d');
      if (g) g.clearRect(0, 0, cv.width, cv.height);
    }
    cv = null;
  }

  /* root mean square of the window, pulled up so ordinary speech uses most
     of the height rather than a sliver of it */
  function loudness(){
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3.4);
  }

  /* The bars fill in from the left as the take runs and then scroll, so the
     row is a picture of how long you have been going as much as of how loud.
     The row is laid out for the full count whatever is in it, so the bars
     stand still as they come in rather than spreading out again every frame. */
  function draw(now){
    raf = requestAnimationFrame(draw);
    if (!analyser || !cv) return;

    if (now - lastBar >= barMs) {
      lastBar = now;
      levels.push(loudness());
      if (levels.length > bars) levels.shift();
    }

    const dpr = Math.min(2, devicePixelRatio || 1);
    const box = cv.getBoundingClientRect();
    if (!box.width) return;
    const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }

    const g = cv.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.fillStyle = getComputedStyle(document.documentElement)
                    .getPropertyValue('--fg').trim();

    const pitch = w / bars, bw = pitch * 0.536;
    levels.forEach((v, i) => {
      const bh = Math.max(h * 0.06, h * (0.1 + 0.9 * v));
      g.fillRect(i * pitch + (pitch - bw) / 2, (h - bh) / 2, bw, bh);
    });
  }

  /* ── the clock ──────────────────────────────────────────────────────────
     Minutes, seconds and hundredths, which is what Web_LiveSound shows.
     Hundredths are no use for reading a duration off, but they are what
     makes it obvious the thing is running. */

  const pad = n => String(n).padStart(2, '0');

  function clock(){
    const ms = began ? performance.now() - began : 0;
    const cs = Math.floor(ms / 10);
    return `${pad(Math.floor(cs / 6000))}:${pad(Math.floor(cs / 100) % 60)}:${pad(cs % 100)}`;
  }

  return { start, stop, clock, running: () => began > 0 };
})();
