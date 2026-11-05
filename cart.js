/* ===========================================================================
   What is in the basket. No DOM here — the page reads this and redraws.

   An entry is one piece somebody made: the snapshot `make.js` hands over
   (the forms in mm and the angle it was left at) plus where on the floor the
   person has dragged it. The pieces are kept as numbers rather than as
   pictures so the cart re-colours with the page like everything else.
   =========================================================================== */

const Cart = (() => {

  /* Prices are per product, from the bill in the 02_Cart mockups. */
  const PRICE = {
    'side-table' : 220000,
    'tray'       : 120000,
    'wall-shelves': 180000,
    'stool'      : 150000,
    'pendant'    :  95000
  };

  /* The tag on the bill takes a flat amount off (02_Cart_02: - 25,000₩). */
  const COUPON = 25000;

  let items = [], seq = 0, coupon = false;
  const watchers = [];

  const emit = () => watchers.forEach(f => f());

  function add(snap){
    if (!snap) return null;
    const it = { key: 'c' + (++seq), ...snap, at: null };   // `at` set on first layout
    items.push(it);
    emit();
    return it;
  }

  function remove(key){
    const i = items.findIndex(it => it.key === key);
    if (i < 0) return;
    items.splice(i, 1);
    if (!items.length) coupon = false;
    emit();
  }

  function clear(){
    if (!items.length) return;
    items = [];
    coupon = false;
    emit();
  }

  /* One row per product, however many of it are in the basket. */
  function lines(){
    const by = new Map();
    for (const it of items) {
      const row = by.get(it.id) || { id: it.id, name: it.name, n: 0, unit: PRICE[it.id] || 0 };
      row.n++;
      by.set(it.id, row);
    }
    return [...by.values()].map(r => ({ ...r, sum: r.unit * r.n }));
  }

  const subtotal = () => lines().reduce((a, r) => a + r.sum, 0);
  const discount = () => (coupon && items.length ? Math.min(COUPON, subtotal()) : 0);
  const total    = () => subtotal() - discount();

  function toggleCoupon(){
    if (!items.length) return;
    coupon = !coupon;
    emit();
  }

  /* 120000 -> "120,000 ₩" */
  const money = n => n.toLocaleString('en-US') + ' ₩';

  return {
    add, remove, clear, lines, subtotal, discount, total, toggleCoupon, money,
    list:      () => items,
    count:     () => items.length,
    hasCoupon: () => coupon,
    priceOf:   it => PRICE[it.id] || 0,
    onChange:  f => watchers.push(f)
  };
})();
