/* Silhouettes traced 1:1 from the Reference PNGs (1920 x 1080 artboard).
   `rest` = idle state, `hover` = the detailed shape revealed inside the box. */
const ITEMS = [
  {
    id: 'side-table', label: 'Side Table', size: '500*500*700',
    rest:  { w: 54,  h: 319, d: 'M0,0 L54,0 L54,296 L50,307 L42,315 L31,319 L23,319 L12,315 L4,307 L0,296 L0,0 Z' },
    hover: { w: 270, h: 319, d: 'M0,0 L270,0 L270,206 L266,217 L258,225 L247,229 L239,229 L228,225 L220,217 L216,206 L216,296 L212,307 L204,315 L193,319 L181,318 L174,315 L164,303 L162,296 L162,206 L158,217 L150,225 L139,229 L124,227 L112,217 L108,206 L108,143 L104,154 L96,162 L85,166 L77,166 L66,162 L58,154 L54,143 L53,300 L50,307 L42,315 L31,319 L16,317 L4,307 L0,296 L0,0 Z' }
  },
  {
    id: 'tray', label: 'Tray', size: '250*250*160',
    rest:  { w: 95,  h: 183, d: 'M0,0 L95,0 L48,183 L0,0 Z' },
    hover: { w: 314, h: 184, d: 'M0,0 L95,0 L72,88 L136,88 L117,0 L194,0 L186,36 L247,36 L229,100 L314,100 L314,102 L288,136 L276,155 L270,161 L255,184 L220,136 L206,183 L181,88 L177,79 L156,182 L152,169 L140,106 L137,99 L96,183 L94,182 L65,121 L63,121 L47,183 L0,0 Z' }
  },
  {
    id: 'wall-shelves', label: 'Wall Shelves', size: '250*250*160',
    rest:  { w: 100, h: 156, d: 'M0,0 L100,0 L97,55 L87,106 L75,136 L69,145 L57,155 L47,156 L38,152 L28,141 L18,121 L10,95 L4,63 L1,35 L0,0 Z' },
    hover: { w: 268, h: 176, d: 'M0,0 L268,0 L267,27 L263,54 L257,76 L248,96 L241,106 L229,115 L218,116 L206,110 L195,96 L187,79 L181,119 L177,131 L172,137 L169,137 L165,133 L162,126 L155,93 L149,129 L139,160 L129,174 L120,176 L116,174 L108,164 L100,144 L92,109 L87,68 L77,84 L64,95 L54,98 L47,98 L31,91 L17,74 L9,57 L2,29 L0,0 Z' }
  },
  {
    id: 'stool', label: 'Stool', size: '380*380*450',
    rest:  { w: 42,  h: 195, d: 'M0,0 L42,0 L42,195 L0,195 L0,0 Z' },
    hover: { w: 210, h: 229, d: 'M0,0 L210,0 L210,229 L168,229 L168,137 L126,137 L126,222 L84,222 L84,165 L42,165 L42,229 L0,229 L0,0 Z' }
  }
];

/* Palette sampled from Color.png / ColorChanged.png.
   Slot 1 = foreground (type + shapes), slot 2 = background. */
const PALETTE = [
  '#00A698', '#6F5D00', '#7B0D66', '#FF8D23',
  '#FFD500', '#841125', '#ACD7B4', '#027C66'
];
