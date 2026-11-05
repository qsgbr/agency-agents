'use strict';

const SHIPPING_FEE = 6.9;
const FREE_SHIPPING_FROM = 150;
const CART_KEY = 'imeraj-cart';

const $ = (id) => document.getElementById(id);
const eur = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let products = [];
let category = 'Alle';
let cart = loadCart(); // { [productId]: qty }

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; }
}
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* ignorieren */ }
}

function cartItems() {
  return Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
    .filter((i) => i.product);
}

function totals() {
  const subtotal = cartItems().reduce((s, i) => s + i.product.price * i.qty, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  return { subtotal, shipping, total: subtotal + shipping };
}

// ---------- Rendering ----------
const COLORS = { Nassbohrkronen: '#4a4a4a', Trockenbohrkronen: '#f07800', Dosensenker: '#8c8c8c', 'Zubehör': '#5a5a5a' };
let diameterQuery = '';

// Zeichnet eine einfache Bohrkrone (oder ein Zubehörteil) als SVG.
function drawing(p) {
  const color = COLORS[p.category] || '#555';
  const d = p.specs.durchmesser || 40;
  if (p.category === 'Zubehör') {
    return `<svg viewBox="0 0 200 120" role="img" aria-label="${esc(p.name)}">
      <rect x="40" y="48" width="120" height="24" rx="4" fill="${color}"/>
      <rect x="20" y="52" width="24" height="16" rx="2" fill="#9a958d"/>
      <rect x="156" y="52" width="24" height="16" rx="2" fill="#9a958d"/>
      ${Array.from({ length: 6 }, (_, i) => `<line x1="${24 + i * 3}" y1="52" x2="${24 + i * 3}" y2="68" stroke="#fff" stroke-opacity=".5"/>`).join('')}
    </svg>`;
  }
  const w = 40 + Math.min(d, 202) * 0.55; // Breite skaliert mit Ø
  const x = (200 - w) / 2;
  const segs = p.specs.segmente || 6;
  const segW = w / segs;
  const segments = Array.from({ length: segs }, (_, i) =>
    `<rect x="${x + i * segW + 1}" y="92" width="${segW - 3}" height="12" rx="1.5" fill="#2b2b2b"/>`).join('');
  return `<svg viewBox="0 0 200 120" role="img" aria-label="${esc(p.name)}">
    <rect x="92" y="4" width="16" height="16" rx="2" fill="#9a958d"/>
    <rect x="${x}" y="20" width="${w}" height="10" rx="3" fill="#8a857d"/>
    <rect x="${x}" y="28" width="${w}" height="66" fill="${color}"/>
    <rect x="${x}" y="28" width="${w * 0.18}" height="66" fill="#fff" fill-opacity=".18"/>
    ${segments}
    <text x="100" y="66" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">Ø ${p.specs.durchmesser || ''}</text>
  </svg>`;
}

function specRows(s) {
  const rows = [
    ['Ø', s.durchmesser && `${s.durchmesser} mm`],
    ['Nutzlänge', s.nutzlaenge && `${s.nutzlaenge} mm`],
    ['Anschluss', s.anschluss],
    ['Kühlung', s.kuehlung],
    ['Für', s.anwendung],
  ].filter((r) => r[1]);
  return `<dl class="specs">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function renderFilters() {
  const cats = ['Alle', ...new Set(products.map((p) => p.category))];
  $('filters').innerHTML = cats
    .map((c) => `<button data-cat="${esc(c)}" class="${c === category ? 'active' : ''}">${esc(c)}</button>`)
    .join('');
}

function renderProducts() {
  const q = Number(diameterQuery);
  let list = products.filter((p) => category === 'Alle' || p.category === category);
  if (q > 0) {
    // passende Durchmesser (± 10 mm), nächstgelegene zuerst
    list = list
      .filter((p) => p.specs.durchmesser && p.category !== 'Zubehör' && Math.abs(p.specs.durchmesser - q) <= 10)
      .sort((a, b) => Math.abs(a.specs.durchmesser - q) - Math.abs(b.specs.durchmesser - q));
  }
  $('resultInfo').textContent = q > 0
    ? (list.length ? `${list.length} Bohrkrone(n) passend zu Ø ${q} mm` : `Keine Bohrkrone um Ø ${q} mm gefunden – sprich uns für Sondergrößen an.`)
    : '';
  $('products').innerHTML = list
    .map((p) => {
      const inCart = cart[p.id] || 0;
      const left = p.stock - inCart;
      return `
      <article class="card">
        <div class="drawing">${drawing(p)}</div>
        <span class="tag">${esc(p.category)}</span>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description)}</p>
        ${specRows(p.specs)}
        <div class="row">
          <div><div class="price">${eur(p.price)}</div>
          <div class="stock">${p.stock > 0 ? (p.stock < 10 ? `Nur noch ${p.stock} auf Lager` : 'Auf Lager') : 'Ausverkauft'}</div></div>
          <button class="primary" data-add="${p.id}" ${left <= 0 ? 'disabled' : ''}>In den Warenkorb</button>
        </div>
      </article>`;
    })
    .join('');
}

function renderTotals(el) {
  const t = totals();
  const missing = FREE_SHIPPING_FROM - t.subtotal;
  el.innerHTML = `
    <div><span>Zwischensumme</span><span>${eur(t.subtotal)}</span></div>
    <div><span>Versand</span><span>${t.shipping ? eur(t.shipping) : 'kostenlos'}</span></div>
    <div class="grand"><span>Gesamt</span><span>${eur(t.total)}</span></div>
    <p class="hint">inkl. MwSt.${t.subtotal > 0 && missing > 0 ? ` · Noch ${eur(missing)} bis zum kostenlosen Versand` : ''}</p>`;
}

function renderCart() {
  const items = cartItems();
  $('cartCount').textContent = items.reduce((s, i) => s + i.qty, 0);
  $('cartLines').innerHTML = items.length
    ? items
        .map(
          ({ product: p, qty }) => `
      <div class="line">
        <div class="name">${esc(p.name)}</div>
        <div class="sum">${eur(p.price * qty)}</div>
        <div class="qty">
          <button data-dec="${p.id}" aria-label="Weniger">−</button>
          <span>${qty}</span>
          <button data-inc="${p.id}" aria-label="Mehr" ${qty >= p.stock ? 'disabled' : ''}>+</button>
        </div>
        <div style="text-align:right"><button class="remove" data-remove="${p.id}">Entfernen</button></div>
      </div>`
        )
        .join('')
    : '<p class="hint">Dein Warenkorb ist leer.</p>';
  renderTotals($('cartTotals'));
  $('toCheckout').disabled = items.length === 0;

  $('checkoutLines').innerHTML = items
    .map(({ product: p, qty }) => `<div class="line"><div>${qty} × ${esc(p.name)}</div><div class="sum">${eur(p.price * qty)}</div></div>`)
    .join('');
  renderTotals($('checkoutTotals'));
  renderProducts();
}

// ---------- Ansichten ----------
function show(view) {
  for (const v of ['shopView', 'checkoutView', 'successView']) $(v).classList.toggle('hidden', v !== view);
  window.scrollTo(0, 0);
}
function openCart(open) {
  $('drawer').classList.toggle('open', open);
  $('backdrop').classList.toggle('open', open);
}

// ---------- Aktionen ----------
function changeQty(id, delta) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  const next = Math.min((cart[id] || 0) + delta, p.stock);
  if (next <= 0) delete cart[id];
  else cart[id] = next;
  saveCart();
  renderCart();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.cat) { category = t.dataset.cat; renderFilters(); renderProducts(); }
  else if (t.dataset.add) { changeQty(t.dataset.add, 1); openCart(true); }
  else if (t.dataset.inc) changeQty(t.dataset.inc, 1);
  else if (t.dataset.dec) changeQty(t.dataset.dec, -1);
  else if (t.dataset.remove) { delete cart[t.dataset.remove]; saveCart(); renderCart(); }
});

$('diameter').addEventListener('input', (e) => { diameterQuery = e.target.value; renderProducts(); });
$('openCart').onclick = () => openCart(true);
$('closeCart').onclick = () => openCart(false);
$('backdrop').onclick = () => openCart(false);
$('toCheckout').onclick = () => { openCart(false); show('checkoutView'); };
$('backToShop').onclick = () => show('shopView');
$('newOrder').onclick = () => show('shopView');
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openCart(false); });

$('checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    customer: {
      company: f.get('company'), vatId: f.get('vatId'),
      name: f.get('name'), email: f.get('email'), street: f.get('street'),
      zip: f.get('zip'), city: f.get('city'), note: f.get('note'),
    },
    payment: f.get('payment'),
    items: Object.entries(cart).map(([id, qty]) => ({ id, qty })),
  };
  const btn = $('placeOrder');
  btn.disabled = true;
  btn.textContent = 'Wird gesendet …';
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const errs = data.errors || [data.error || 'Unbekannter Fehler'];
      $('formErrors').innerHTML = `<ul>${errs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
      $('formErrors').classList.remove('hidden');
      return;
    }
    $('formErrors').classList.add('hidden');
    $('orderId').textContent = data.id;
    $('orderSummary').textContent = `${data.items.reduce((s, i) => s + i.qty, 0)} Artikel · Gesamt ${eur(data.total)} · Eine Bestätigung geht an deine E-Mail-Adresse.`;
    cart = {};
    saveCart();
    e.target.reset();
    await loadProducts();
    show('successView');
  } catch {
    $('formErrors').textContent = 'Verbindung zum Server fehlgeschlagen. Bitte erneut versuchen.';
    $('formErrors').classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Zahlungspflichtig bestellen';
  }
});

async function loadProducts() {
  try {
    products = await (await fetch('/api/products')).json();
    // Warenkorb an aktuellen Bestand anpassen
    for (const [id, qty] of Object.entries(cart)) {
      const p = products.find((x) => x.id === id);
      if (!p || p.stock <= 0) delete cart[id];
      else if (qty > p.stock) cart[id] = p.stock;
    }
    saveCart();
    renderFilters();
    renderCart();
  } catch {
    $('products').innerHTML = '<p class="errors">Produkte konnten nicht geladen werden.</p>';
  }
}

loadProducts();
