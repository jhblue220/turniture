/* ===========================================================================
   The scroll film — what it shows, and when.

   This file is settings only. There is no code in it: `film.js` reads these
   numbers and does the work, so everything you would want to nudge after
   watching it once lives here and nowhere else.

   ── the shape of a shot ──────────────────────────────────────────────────
     in,  out   the stretch of film, in seconds, this shot is about
     hold       how much scroll that stretch is given, against a plain 1 for
                the footage between shots. 2.2 means it takes a bit over
                twice the wheel to cross — the frames crawl so the graphic
                has time to be read
     pin        scroll, in the same units, where the film stops dead on the
                frame at `out`. This is the pause: the wheel keeps turning,
                the picture does not move. Nothing is blocked and no timer
                runs — the scroll simply maps to a flat piece of film
     marks      the rectangles. `box` is [x, y, w, h] as a share of the video
                frame, 0..1, measured off the picture itself — never off the
                window — so the window's shape cannot pull it off the furniture
     at         when a mark lands, as a share of the shot's own scroll. 0 is
                at once; the last scene staggers five of them
     label      the wording above the rectangle. Left out, it is the one at
                the top of this file; `false` leaves the rectangle bare
     track      optional. [[t, x, y, w, h], ...] — the box at those seconds,
                eased between. Give it two or more rows if a camera move ever
                drags a rectangle off the thing it is meant to be on

   ── where these numbers came from ────────────────────────────────────────
   The four reference stills in `Reference/` were measured pixel by pixel:
   the black rectangles, the border weight, and the wording's size and
   offset. Each still was then matched against the film frame by frame to
   find the second it was taken at, and `out` is set to exactly that second
   — so the frame the scroll stops dead on is the frame the reference was
   drawn on, and every rectangle sits where it was drawn. `in` is where it
   was asked for, which leaves the film crawling from there into the held
   frame.

      Reference/Film_Cabinet → 2.31s
      Reference/Film_Table   → 3.80s
      Reference/Film_Lamp    → 5.18s
      Reference/Film_Above   → 5.94s, all five bare

   The camera keeps moving through the first part of each window, so a
   rectangle is at its truest on the held frame and drifts a little on the
   way in. `track` is there if any of them ever drifts enough to matter.
   =========================================================================== */

const FILM_SCENES = {

  src:   'Video/1.mp4',                   // 1920 x 1080, 6.04s
  label: 'Designed by Not Me',

  /* Wheel distance, in pixels, for the whole film. Bigger is slower. */
  run:  6400,

  /* Scroll weight for the footage that is not a shot. */
  gap:  1.6,

  shots: [

    /* 0.0–1.5s is the move into the room and carries no graphic, so it is
       not a shot at all — it is the lead-in, and it reads as a plain `gap`. */

    { id: 'cabinet', in: 1.50, out: 2.31, hold: 2.2, pin: 1.2,
      marks: [ { box: [0.3699, 0.5611, 0.5566, 0.4289] } ] },

    { id: 'table',   in: 3.10, out: 3.80, hold: 2.6, pin: 1.2,
      marks: [ { box: [0.2123, 0.2367, 0.5585, 0.5704] } ] },

    { id: 'lamp',    in: 4.60, out: 5.18, hold: 2.6, pin: 1.2,
      marks: [ { box: [0.3976, 0.2702, 0.1605, 0.5659] } ] },

    /* The rise to the view from above. No wording here — the reference puts
       bare rectangles on the five pieces, one after another. The window of
       film is short because the camera is still climbing until 5.8; what
       gives the five of them room to arrive is the `pin`, which holds this
       one frame for a sixth of the whole scroll. */
    { id: 'above',   in: 5.78, out: 5.94, hold: 3.0, pin: 2.2, label: false,
      marks: [
        { at: 0.00, box: [0.3492, 0.1217, 0.3411, 0.2872] },   // sofa
        { at: 0.13, box: [0.2554, 0.1098, 0.1005, 0.2991] },   // lamp
        { at: 0.26, box: [0.4404, 0.4363, 0.1756, 0.1609] },   // table
        { at: 0.39, box: [0.3009, 0.4970, 0.1495, 0.2359] },   // chair
        { at: 0.52, box: [0.6903, 0.5662, 0.1622, 0.4290] }    // cabinet
      ] }
  ]
};
