/* ===========================================================================
   The cart (02_Cart_01 … 04).

     1  what you have made, lying loose on the left where you can push the
        pieces about, with the bill down the right
     2  where it should go
     3  how you are paying
     4  the receipt, which gathers the pieces up and leaves

   The pieces are the real ones: `make.js` lends its renderer out, so each
   canvas here is drawn from the forms themselves and follows the palette.
   =========================================================================== */

const Checkout = (() => {
  const page   = document.querySelector('.page--cart');
  const floor  = document.getElementById('floor');
  const empty  = document.getElementById('floorEmpty');
  const slip   = document.getElementById('slipItems');
  const bills  = [...page.querySelectorAll('[data-bill]')];

  /* Where a piece may be put down, measured from the floor's own top-left.
     Both builds lay the floor out in their own stylesheet — one beside the
     bill, one above it — so the box and the entry are measured rather than
     written down here. The stage is what carries the scale, so these come
     back in artboard px either way. */
  let FLOOR = { w: 1185, h: 840 };
  let CARD  = { w: 360, h: 420 };
  let MAXX  = FLOOR.w - CARD.w, MAXY = FLOOR.h - CARD.h;

  function measure(){
    const el = floor.firstElementChild;
    if (floor.clientWidth) FLOOR = { w: floor.clientWidth, h: floor.clientHeight };
    if (el && el.offsetWidth) CARD = { w: el.offsetWidth, h: el.offsetHeight };
    MAXX = Math.max(0, FLOOR.w - CARD.w);
    MAXY = Math.max(0, FLOOR.h - CARD.h);
  }

  const K = () => +getComputedStyle(document.documentElement).getPropertyValue('--k') || 1;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ── the floor ──────────────────────────────────────────────────────────── */

  /* New pieces are laid out across the floor rather than on top of each other,
     three to a row, the second row as low as the floor allows so a name never
     lands on the piece beneath it. After that, wherever they are left is where
     they stay. */
  function place(i){
    const cols = Math.max(1, Math.floor(FLOOR.w / CARD.w));
    const stepX = cols > 1 ? MAXX / (cols - 1) : 0;
    const col = i % cols, row = Math.floor(i / cols);
    return {
      x: clamp(col * stepX, 0, MAXX),
      y: clamp(row * MAXY, 0, MAXY)
    };
  }

  function buildFloor(){
    const items = Cart.list();
    empty.hidden = !!items.length;
    floor.innerHTML = items.map(it => `
      <div class="piece" data-key="${it.key}">
        <canvas class="piece__cv" width="720" height="600"></canvas>
        <div class="piece__row">
          <span class="piece__name">${it.name}</span>
          <button class="piece__x" aria-label="Remove ${it.name}">${ICONS.cross}</button>
        </div>
        <div class="piece__price">${Cart.money(Cart.priceOf(it))}</div>
      </div>`).join('');

    measure();
    [...floor.children].forEach((el, i) => {
      const it = items[i];
      if (!it.at) it.at = place(i);
      it.at = { x: clamp(it.at.x, 0, MAXX), y: clamp(it.at.y, 0, MAXY) };
      el.style.left = `${it.at.x}px`;
      el.style.top  = `${it.at.y}px`;
      Make.paint(el.querySelector('.piece__cv'), it, false);
    });
  }

  /* drag a piece anywhere on the floor */
  let drag = null;

  floor.addEventListener('pointerdown', e => {
    const el = e.target.closest('.piece');
    if (!el || e.target.closest('.piece__x')) return;
    e.stopPropagation();
    const it = Cart.list().find(i => i.key === el.dataset.key);
    if (!it) return;
    drag = { el, it, k: K(), x: e.clientX, y: e.clientY, ox: it.at.x, oy: it.at.y, moved: false };
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-held');
  });

  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / drag.k, dy = (e.clientY - drag.y) / drag.k;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    drag.it.at = {
      x: clamp(drag.ox + dx, 0, MAXX),
      y: clamp(drag.oy + dy, 0, MAXY)
    };
    drag.el.style.left = `${drag.it.at.x}px`;
    drag.el.style.top  = `${drag.it.at.y}px`;
  });

  ['pointerup', 'pointercancel'].forEach(t => addEventListener(t, () => {
    if (!drag) return;
    drag.el.classList.remove('is-held');
    drag = null;
  }));

  floor.addEventListener('click', e => {
    const x = e.target.closest('.piece__x');
    if (!x) return;
    e.stopPropagation();
    Cart.remove(x.closest('.piece').dataset.key);
  });

  /* ── the bill ───────────────────────────────────────────────────────────── */

  function buildBill(){
    const rows = Cart.lines().map(r => `
      <div class="bill__row">
        <span class="bill__k">${r.name} X ${r.n}</span>
        <span class="bill__v">${Cart.money(r.sum)}</span>
      </div>`).join('');

    const html = `
      ${rows}
      <div class="bill__row bill__row--total">
        <span class="bill__k">Total</span>
        <span class="bill__v">${Cart.money(Cart.total())}</span>
      </div>
      <div class="rule rule--low"></div>
      <div class="bill__tag"${Cart.hasCoupon() ? '' : ' hidden'}>
        <span class="bill__tagi">${ICONS.ticket}</span>- ${Cart.money(Cart.discount())}
      </div>`;

    bills.forEach(b => { b.innerHTML = html; });
    fitBills();
  }

  /* Many items would push the Total down over the buttons, so once the bill is
     longer than the room under the rule it is written smaller to suit. */
  function fitBills(){
    bills.forEach(b => {
      b.style.setProperty('--bs', 1);
      const avail = parseFloat(getComputedStyle(b).getPropertyValue('--avail'));
      const h = b.scrollHeight;          // the stage scales, so this is artboard px
      if (avail && h > avail) b.style.setProperty('--bs', (avail / h).toFixed(3));
    });
  }

  /* ── steps ──────────────────────────────────────────────────────────────── */

  const stepAt = () => +page.dataset.step;

  function step(n){
    page.dataset.step = n;
    fitBills();                          // a hidden bill measures 0, so refit on show
    if (n === 4) receipt();
  }

  document.getElementById('cartBuy').addEventListener('click', e => {
    e.stopPropagation();
    if (Cart.count()) step(2);
  });
  page.querySelector('[data-go-step="3"]').addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    step(3);
  });
  document.getElementById('cartPay').addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    step(4);
  });

  document.getElementById('cartTrash').addEventListener('click', e => {
    e.stopPropagation();
    Cart.clear();
  });
  document.getElementById('cartTicket').addEventListener('click', e => {
    e.stopPropagation();
    Cart.toggleCoupon();
  });

  document.getElementById('cartTrash').innerHTML  = ICONS.trash;
  document.getElementById('cartTicket').innerHTML = ICONS.ticket;

  /* ── the receipt ────────────────────────────────────────────────────────
     Everything bought, drawn on the paper itself — which is the --fg colour,
     so the pieces are drawn the other way round. Then it goes up and off, and
     the basket is empty again. */

  function receipt(){
    const items = Cart.list();
    slip.innerHTML = items.map(() =>
      '<canvas class="slip__cv" width="686" height="466"></canvas>').join('');
    [...slip.children].forEach((cv, i) => Make.paint(cv, items[i], true));

    requestAnimationFrame(() => requestAnimationFrame(() => {
      page.classList.add('is-away');
      setTimeout(() => {
        page.classList.remove('is-away');
        Cart.clear();
        step(1);
        show('home');
      }, 1150);
    }));
  }

  /* ── the address and card selects ───────────────────────────────────────── */

  const PLACES = {
    'Korea':          { Seoul: ['04524', '06236', '03187'],
                        Gyeonggi: ['13529', '16489'],
                        Busan: ['48058', '47340'] },
    'United States':  { 'New York': ['10001', '11201'],
                        California: ['90012', '94103'],
                        Illinois: ['60601', '60614'] },
    'United Kingdom': { London: ['EC1A 1BB', 'SW1A 2AA'],
                        Manchester: ['M1 1AE'] },
    'Japan':          { Tokyo: ['100-0001', '150-0002'],
                        Osaka: ['530-0001'] },
    'France':         { Paris: ['75001', '75008'],
                        Occitanie: ['31000'] }
  };

  const sel = k => page.querySelector(`[data-sel="${k}"]`);

  function fill(el, head, values){
    el.innerHTML = `<option value="" selected disabled>${head}</option>` +
      values.map(v => `<option>${v}</option>`).join('');
  }

  function wirePlaces(){
    const country = sel('country'), county = sel('county'), zip = sel('zip');
    fill(country, 'Country', Object.keys(PLACES));
    fill(county, 'County', []);
    fill(zip, 'Zipcode', []);
    country.addEventListener('change', () => {
      fill(county, 'County', Object.keys(PLACES[country.value] || {}));
      fill(zip, 'Zipcode', []);
    });
    county.addEventListener('change', () => {
      fill(zip, 'Zipcode', (PLACES[country.value] || {})[county.value] || []);
    });
  }

  function wireCard(){
    fill(sel('month'), 'Month',
         Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')));
    const y = new Date().getFullYear();
    fill(sel('year'), 'Year', Array.from({ length: 10 }, (_, i) => String(y + i)));
  }

  wirePlaces();
  wireCard();

  /* ── in and out ─────────────────────────────────────────────────────────── */

  function build(){
    buildBill();
    if (stepAt() === 1) buildFloor();
  }

  Cart.onChange(() => {
    build();
    // nothing left to pay for, so back to the empty floor
    if (!Cart.count() && stepAt() > 1 && stepAt() < 4) step(1);
  });

  const open    = () => { step(1); build(); };
  const close   = () => { page.classList.remove('is-away'); };
  const redraw  = () => { if (page.classList.contains('is-on')) build(); };

  return { open, close, redraw };
})();
