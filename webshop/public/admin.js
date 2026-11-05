'use strict';

const TOKEN_KEY = 'ladenzeile-admin';
const LABELS = { neu: 'Neu', in_bearbeitung: 'In Bearbeitung', versendet: 'Versendet', fertig: 'Fertig', storniert: 'Storniert' };
const PAYMENT = { rechnung: 'Rechnung', vorkasse: 'Vorkasse', paypal: 'PayPal', nachnahme: 'Nachnahme' };

const $ = (id) => document.getElementById(id);
const eur = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });

let token = '';
try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch { /* ignorieren */ }
let orders = [];
let filter = 'offen';

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (res.status === 401) { logout(); throw new Error('unauthorized'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Fehler');
  return data;
}

function isOpen(o) { return o.status !== 'fertig' && o.status !== 'storniert'; }

function render() {
  const open = orders.filter(isOpen);
  const revenue = orders.filter((o) => o.status !== 'storniert').reduce((s, o) => s + o.total, 0);
  $('stats').innerHTML = `
    <div class="card"><div class="hint">Bestellungen gesamt</div><div class="num">${orders.length}</div></div>
    <div class="card"><div class="hint">Offen</div><div class="num">${open.length}</div></div>
    <div class="card"><div class="hint">Fertig</div><div class="num">${orders.filter((o) => o.status === 'fertig').length}</div></div>
    <div class="card"><div class="hint">Umsatz</div><div class="num">${eur(revenue)}</div></div>`;

  const filters = { offen: 'Offen', alle: 'Alle', ...LABELS };
  $('statusFilter').innerHTML = Object.entries(filters)
    .map(([k, v]) => `<button data-filter="${k}" class="${k === filter ? 'active' : ''}">${v}</button>`)
    .join('');

  $('completeAll').disabled = open.length === 0;

  const list = orders.filter((o) => (filter === 'alle' ? true : filter === 'offen' ? isOpen(o) : o.status === filter));
  $('orders').innerHTML = list.length
    ? list
        .map((o) => {
          const c = o.customer;
          return `<tr>
        <td><strong>${esc(o.id)}</strong><br><span class="hint">${date(o.createdAt)}</span></td>
        <td>${esc(c.name)}<br><span class="hint">${esc(c.email)}<br>${esc(c.street)}, ${esc(c.zip)} ${esc(c.city)}${c.note ? `<br>„${esc(c.note)}“` : ''}</span></td>
        <td>${o.items.map((i) => `${i.qty} × ${esc(i.name)}`).join('<br>')}</td>
        <td><strong>${eur(o.total)}</strong><br><span class="hint">${PAYMENT[o.payment] || esc(o.payment)}</span></td>
        <td><span class="status ${o.status}">${LABELS[o.status]}</span></td>
        <td>
          <select data-status="${esc(o.id)}" aria-label="Status ändern">
            ${Object.entries(LABELS).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          ${isOpen(o) ? `<br><button class="primary" style="margin-top:6px" data-done="${esc(o.id)}">Fertig</button>` : ''}
        </td>
      </tr>`;
        })
        .join('')
    : '<tr><td colspan="6" class="hint" style="text-align:center;padding:24px">Keine Bestellungen in dieser Ansicht.</td></tr>';
}

async function load() {
  orders = await api('/api/admin/orders');
  render();
}

async function setStatus(id, status) {
  await api(`/api/admin/orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  await load();
}

function logout() {
  token = '';
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignorieren */ }
  $('adminView').classList.add('hidden');
  $('logout').classList.add('hidden');
  $('loginView').classList.remove('hidden');
}

async function login() {
  try {
    await load();
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* ignorieren */ }
    $('loginView').classList.add('hidden');
    $('adminView').classList.remove('hidden');
    $('logout').classList.remove('hidden');
    $('loginError').classList.add('hidden');
  } catch {
    $('loginError').classList.remove('hidden');
  }
}

$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  token = $('token').value;
  login();
});
$('logout').onclick = logout;
$('refresh').onclick = () => load();
$('completeAll').onclick = async () => {
  const n = orders.filter(isOpen).length;
  if (!confirm(`${n} offene Bestellung(en) als „Fertig“ markieren?`)) return;
  await api('/api/admin/orders/complete-all', { method: 'POST' });
  await load();
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.filter) { filter = b.dataset.filter; render(); }
  else if (b.dataset.done) setStatus(b.dataset.done, 'fertig');
});
document.addEventListener('change', (e) => {
  if (e.target.dataset.status) setStatus(e.target.dataset.status, e.target.value);
});

if (token) login();
