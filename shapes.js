/* Silhouettes traced 1:1 from the Reference PNGs (1920 x 1080 artboard).

   `rest`    — the idle silhouette, kept exactly as traced.
   `cluster` — the hover state. Every hover shape in the mockups turns out to be
               the same silhouette repeated at different sizes, so instead of one
               baked outline each one is a list of units drawn on demand. That is
               what lets the camera / microphone resize them one by one at run
               time while the arrangement stays put (see sense.js).

   A unit is drawn into its own w x h box with the origin top-left; `anchor` says
   which edge it keeps while it resizes, and `row` groups the units that sit
   side by side (the rings are the only cluster with more than one row).
   `dy` nudges a cluster below the shared baseline, where the reference drew it
   lower. */

const UNIT = {
  // Side Table — a bar with a rounded, dripping bottom
  drip: (w, h) => {
    const r = Math.min(w * 0.43, h);
    return `M0,0 H${w} V${h - r} Q${w},${h} ${w / 2},${h} Q0,${h} 0,${h - r} Z`;
  },
  // Tray — a triangle hanging point-down
  spike: (w, h) => `M0,0 H${w} L${w / 2},${h} Z`,
  // Wall Shelves — a tapering dome
  dome: (w, h) =>
    `M0,0 H${w} L${w * 0.94},${h * 0.42} Q${w * 0.84},${h} ${w / 2},${h} ` +
    `Q${w * 0.16},${h} ${w * 0.06},${h * 0.42} Z`,
  // Stool — a plain bar
  bar: (w, h) => `M0,0 H${w} V${h} H0 Z`,
  // Pendant — a cone on a flex, the flex reaching back up to the ceiling
  cone: (w, h, u, H) => {
    const c = w / 2, t = Math.max(2, w * 0.02), top = -(H - h);
    return `M${c - t / 2},${top} H${c + t / 2} V0 H${c - t / 2} Z ` +
           `M${c},0 L${w},${h} H0 Z`;
  },
  // Shelves — a ring
  ring: (w, h) => {
    const rx = w / 2, ry = h / 2, t = Math.min(rx, ry) * 0.2;
    const o = (a, b) => `M${rx - a},${ry} a${a},${b} 0 1,0 ${2 * a},0 a${a},${b} 0 1,0 ${-2 * a},0 Z`;
    return `${o(rx, ry)} ${o(rx - t, ry - t)}`;
  }
};

const ITEMS = [
  {
    id: 'side-table', label: 'Side Table', size: '500*500*700',
    rest: { w: 54, h: 319, d: 'M0,0 L54,0 L54,296 L50,307 L42,315 L31,319 L23,319 L12,315 L4,307 L0,296 L0,0 Z' },
    cluster: {
      w: 270, h: 319, anchor: 'top', unit: UNIT.drip,
      units: [
        { x: 0,   w: 54, h: 319 }, { x: 54,  w: 54, h: 166 },
        { x: 108, w: 54, h: 229 }, { x: 162, w: 54, h: 319 },
        { x: 216, w: 54, h: 229 }
      ]
    }
  },
  {
    id: 'tray', label: 'Tray', size: '250*250*160',
    rest: { w: 95, h: 183, d: 'M0,0 L95,0 L48,183 L0,0 Z' },
    cluster: {
      w: 314, h: 184, anchor: 'bottom', unit: UNIT.spike,
      units: [
        { x: 0,   w: 86, h: 121 }, { x: 58,  w: 72, h: 183 },
        { x: 102, w: 64, h: 106 }, { x: 138, w: 70, h: 182 },
        { x: 180, w: 76, h: 136 }, { x: 228, w: 86, h: 184 }
      ]
    }
  },
  {
    id: 'wall-shelves', label: 'Wall Shelves', size: '700*150*240',
    rest: { w: 100, h: 156, d: 'M0,0 L100,0 L97,55 L87,106 L75,136 L69,145 L57,155 L47,156 L38,152 L28,141 L18,121 L10,95 L4,63 L1,35 L0,0 Z' },
    cluster: {
      w: 268, h: 176, anchor: 'top', unit: UNIT.dome,
      units: [
        { x: 0,   w: 87, h: 98 },  { x: 87,  w: 68, h: 176 },
        { x: 155, w: 32, h: 137 }, { x: 187, w: 81, h: 116 }
      ]
    }
  },
  {
    id: 'stool', label: 'Stool', size: '380*380*450',
    rest: { w: 42, h: 195, d: 'M0,0 L42,0 L42,195 L0,195 L0,0 Z' },
    cluster: {
      w: 210, h: 229, anchor: 'top', unit: UNIT.bar,
      units: [
        { x: 0,   w: 42, h: 229 }, { x: 42,  w: 42, h: 165 },
        { x: 84,  w: 42, h: 222 }, { x: 126, w: 42, h: 137 },
        { x: 168, w: 42, h: 229 }
      ]
    }
  },
  {
    id: 'pendant', label: 'Pendant', size: '500*500*250',
    rest: { w: 160, h: 165, d: 'M79,0 L81,0 L81,64 L90,74 L90,76 L94,79 L97,85 L101,88 L101,90 L105,93 L108,99 L112,102 L112,104 L116,107 L116,109 L120,112 L120,114 L127,121 L127,123 L131,126 L131,128 L138,135 L138,137 L142,140 L145,146 L153,154 L153,156 L160,163 L160,165 L0,165 L0,163 L4,160 L7,154 L11,151 L11,149 L15,146 L15,144 L19,141 L22,135 L26,132 L26,130 L30,127 L33,121 L37,118 L37,116 L41,113 L44,107 L48,104 L48,102 L52,99 L55,93 L59,90 L59,88 L63,85 L66,79 L70,76 L70,74 L79,64 L79,0 Z' },
    cluster: {
      w: 328, h: 209, dy: 12, anchor: 'bottom', unit: UNIT.cone,
      units: [
        { x: 0,   w: 60, h: 61 },  { x: 60,  w: 90, h: 100 },
        { x: 134, w: 70, h: 70 },  { x: 185, w: 60, h: 52 },
        { x: 242, w: 86, h: 145 }
      ]
    }
  }
];

/* Palette sampled from Color.png / ColorChanged.png.
   Slot 1 = foreground (type + shapes), slot 2 = background. */
const PALETTE = [
  '#00A698', '#6F5D00', '#7B0D66', '#FF8D23',
  '#FFD500', '#841125', '#ACD7B4', '#027C66'
];
