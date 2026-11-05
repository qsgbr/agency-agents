'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-'));
process.env.ADMIN_TOKEN = 'geheim';
const { createServer } = require('../server');

let server, base;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const json = (method, url, body, token) =>
  fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

const customer = { name: 'Erika Muster', email: 'erika@example.de', street: 'Hauptstr. 1', zip: '10115', city: 'Berlin' };

test('liefert Startseite und Produkte', async () => {
  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
  const products = await (await fetch(base + '/api/products')).json();
  assert.ok(products.length > 0);
});

test('lehnt ungültige Bestellung ab', async () => {
  const res = await json('POST', '/api/orders', { customer: { name: 'x' }, items: [] });
  assert.equal(res.status, 400);
  const { errors } = await res.json();
  assert.ok(errors.length >= 3);
});

test('Bestellung: Preis wird serverseitig berechnet, Bestand sinkt', async () => {
  const before = (await (await fetch(base + '/api/products')).json()).find((p) => p.id === 'hm-068');
  const res = await json('POST', '/api/orders', {
    customer, payment: 'rechnung', items: [{ id: 'hm-068', qty: 2, price: 0.01 }],
  });
  assert.equal(res.status, 201);
  const order = await res.json();
  assert.equal(order.subtotal, 69.8);
  assert.equal(order.shipping, 6.9);
  assert.equal(order.total, 76.7);
  assert.equal(order.status, 'neu');
  const after = (await (await fetch(base + '/api/products')).json()).find((p) => p.id === 'hm-068');
  assert.equal(after.stock, before.stock - 2);
  // öffentliche Ansicht enthält keine Adresse
  const pub = await (await fetch(base + '/api/orders/' + order.id)).json();
  assert.equal(pub.customer.email, undefined);
});

test('kostenloser Versand ab 150 €, Firmendaten werden gespeichert', async () => {
  const res = await json('POST', '/api/orders', {
    customer: { ...customer, company: 'Bau GmbH', vatId: 'de 123456789' },
    payment: 'paypal', items: [{ id: 'nb-202', qty: 1 }],
  });
  const order = await res.json();
  assert.equal(order.shipping, 0);
  assert.equal(order.total, 369);
  const all = await (await json('GET', '/api/admin/orders', null, 'geheim')).json();
  assert.equal(all[0].customer.company, 'Bau GmbH');
  assert.equal(all[0].customer.vatId, 'DE123456789');
});

test('ungültige USt-IdNr. wird abgelehnt', async () => {
  const res = await json('POST', '/api/orders', {
    customer: { ...customer, vatId: '123' }, payment: 'paypal', items: [{ id: 'nb-052', qty: 1 }],
  });
  assert.equal(res.status, 400);
});

test('mehr als Lagerbestand wird abgelehnt', async () => {
  const res = await json('POST', '/api/orders', { customer, payment: 'paypal', items: [{ id: 'nb-202', qty: 50 }] });
  assert.equal(res.status, 400);
});

test('Admin: Schutz, Status ändern, alle fertigstellen', async () => {
  assert.equal((await json('GET', '/api/admin/orders')).status, 401);
  assert.equal((await json('GET', '/api/admin/orders', null, 'falsch')).status, 401);

  const list = await (await json('GET', '/api/admin/orders', null, 'geheim')).json();
  assert.equal(list.length, 2);

  const patched = await json('PATCH', `/api/admin/orders/${list[0].id}`, { status: 'versendet' }, 'geheim');
  assert.equal((await patched.json()).status, 'versendet');

  const done = await (await json('POST', '/api/admin/orders/complete-all', null, 'geheim')).json();
  assert.equal(done.completed, 2);

  const final = await (await json('GET', '/api/admin/orders', null, 'geheim')).json();
  assert.ok(final.every((o) => o.status === 'fertig'));
  assert.ok(fs.existsSync(path.join(process.env.DATA_DIR, 'orders.json')));
});

test('Stornieren bucht Bestand zurück', async () => {
  const stock = async () => (await (await fetch(base + '/api/products')).json()).find((p) => p.id === 'zb-zentrier').stock;
  const s0 = await stock();
  const order = await (await json('POST', '/api/orders', { customer, payment: 'vorkasse', items: [{ id: 'zb-zentrier', qty: 3 }] })).json();
  assert.equal(await stock(), s0 - 3);
  await json('PATCH', `/api/admin/orders/${order.id}`, { status: 'storniert' }, 'geheim');
  assert.equal(await stock(), s0);
});

test('Pfad-Traversal wird verhindert', async () => {
  const res = await fetch(base + '/..%2Fserver.js');
  assert.notEqual(res.status, 200);
});
