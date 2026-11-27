/* ===========================================================================
   The film — what it shows, and when.

   This file is settings only. There is no code in it: `film.js` reads these
   numbers and does the work, so everything you would want to nudge after
   watching it once lives here and nowhere else.

   The film plays itself, so every number below is a second of film. Not a
   share of some scroll, not a tween — the second the frame is on. Nudging a
   rectangle later is adding to a number here and nothing else.

   ── the shape of a shot ──────────────────────────────────────────────────
     in         the second the rectangle arrives
     out        the second it leaves. `null` keeps it up to the end
     marks      the rectangles. `box` is [x, y, w, h] as a share of the video
                frame, 0..1, measured off the picture itself — never off the
                window — so the window's shape cannot pull it off the furniture
     at         seconds after `in` that this one mark waits. 0 is with the
                shot; the last scene staggers five of them
     label      the wording above the rectangle. Left out, it is the one at
                the top of this file; `false` leaves the rectangle bare
     track      optional. [[t, x, y, w, h], ...] — the box at those seconds,
                eased between. Give it two or more rows if a camera move ever
                drags a rectangle off the thing it is meant to be on

   ── where these numbers came from ────────────────────────────────────────
   The four reference stills in `Reference/` were measured pixel by pixel:
   the black rectangles, the border weight, and the wording's size and
   offset. Each still was then matched against the film frame by frame to
   find the second it was taken at.

      Reference/Film_Cabinet → 2.31s
      Reference/Film_Table   → 3.80s
      Reference/Film_Lamp    → 5.18s
      Reference/Film_Above   → 5.94s, all five bare

   The boxes are given as measured there, but `in` is earlier than that in
   every case, so the question was whether the camera moves enough in between
   to pull a rectangle off its piece of furniture. Each box was matched back
   against the frame at its own `in` second, searching position and scale:
   scale 0.99–1.01 and under 1% of the frame in either direction, every time.
   The camera is effectively still once each shot has settled, so the boxes
   are plain and `track` is unused. The one place it mattered was the rise to
   the view from above, which is still climbing at 5.78 and settled by 5.85 —
   hence that second.
   =========================================================================== */

const FILM_SCENES = {

  src:   'Video/1.mp4',                   // 1920 x 1080, 6.04s
  label: 'Designed by Not Me',

  /* The last frame is held this long, in seconds, after the film runs out.
     The rise to the view from above only lands at 5.85 and five rectangles
     have to arrive one after another, so they finish on the still. */
  tail: 1.4,

  shots: [

    /* 0.0–1.5s is the move into the room and carries no graphic, so it is
       not a shot at all — it is the lead-in. */

    { id: 'cabinet', in: 1.50, out: 2.60,
      marks: [ { box: [0.3699, 0.5611, 0.5566, 0.4289] } ] },

    { id: 'table',   in: 3.00, out: 3.70,
      marks: [ { box: [0.2123, 0.2367, 0.5585, 0.5704] } ] },

    { id: 'lamp',    in: 4.50, out: 5.30,
      marks: [ { box: [0.3976, 0.2702, 0.1605, 0.5659] } ] },

    /* The rise to the view from above. No wording here — the reference puts
       bare rectangles on the five pieces, one after another. They are the
       last thing the screen says, so they do not leave: `out: null` keeps
       them up on the held frame until the viewer scrolls away. */
    { id: 'above',   in: 5.85, out: null, label: false,
      marks: [
        { at: 0.00, box: [0.3492, 0.1217, 0.3411, 0.2872] },   // sofa
        { at: 0.24, box: [0.2554, 0.1098, 0.1005, 0.2991] },   // lamp
        { at: 0.48, box: [0.4404, 0.4363, 0.1756, 0.1609] },   // table
        { at: 0.72, box: [0.3009, 0.4970, 0.1495, 0.2359] },   // chair
        { at: 0.96, box: [0.6903, 0.5662, 0.1622, 0.4290] }    // cabinet
      ] }
  ]
};
