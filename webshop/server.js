// Imeraj Bohrkronen – Webshop-Server ohne externe Abhängigkeiten (Node.js >= 18).
// Start: node server.js   →   http://localhost:3000
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

const SHIPPING_FEE = 6.9;
const FREE_SHIPPING_FROM = 150;
const STATUSES = ['neu', 'in_bearbeitung', 'versendet', 'fertig', 'storniert'];
const PAYMENTS = ['rechnung', 'vorkasse', 'paypal', 'nachnahme'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// ---------- Datenhaltung ----------
function loadProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
}

let products = loadProducts();

function loadOrders() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

let orders = loadOrders();

function saveOrders() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = ORDERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(orders, null, 2));
  fs.renameSync(tmp, ORDERS_FILE);
}

const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Hilfsfunktionen ----------
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? MIME['.json'] : headers['Content-Type'] || 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 100_000) {
        reject(Object.assign(new Error('Anfrage zu groß'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Ungültiges JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validateOrder(body) {
  const errors = [];
  const c = body.customer || {};
  const customer = {
    company: str(c.company, 150),
    vatId: str(c.vatId, 30).replace(/\s/g, '').toUpperCase(),
    name: str(c.name, 100),
    email: str(c.email, 150),
    street: str(c.street, 150),
    zip: str(c.zip, 10),
    city: str(c.city, 100),
    note: str(c.note, 500),
  };
  if (customer.vatId && !/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(customer.vatId))
    errors.push('Die USt-IdNr. ist ungültig (z. B. DE123456789).');
  if (customer.name.length < 2) errors.push('Bitte einen Namen angeben.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) errors.push('Bitte eine gültige E-Mail-Adresse angeben.');
  if (customer.street.length < 3) errors.push('Bitte Straße und Hausnummer angeben.');
  if (!/^\d{4,5}$/.test(customer.zip)) errors.push('Bitte eine gültige Postleitzahl angeben.');
  if (customer.city.length < 2) errors.push('Bitte einen Ort angeben.');

  const payment = PAYMENTS.includes(body.payment) ? body.payment : null;
  if (!payment) errors.push('Bitte eine Zahlungsart wählen.');

  const items = [];
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('Der Warenkorb ist leer.');
  } else {
    const merged = new Map();
    for (const it of body.items) {
      const qty = Number(it && it.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        errors.push('Ungültige Menge im Warenkorb.');
        continue;
      }
      merged.set(it.id, (merged.get(it.id) || 0) + qty);
    }
    for (const [id, qty] of merged) {
      const p = products.find((x) => x.id === id);
      if (!p) errors.push('Ein Artikel existiert nicht mehr.');
      else if (qty > p.stock) errors.push(`„${p.name}“: nur noch ${p.stock} Stück verfügbar.`);
      else items.push({ id: p.id, name: p.name, price: p.price, qty, total: round2(p.price * qty) });
    }
  }
  return { errors, customer, payment, items };
}

function newOrderId() {
  const d = new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `B-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function publicOrder(o) {
  // Kundensicht ohne vollständige Adresse
  return {
    id: o.id,
    createdAt: o.createdAt,
    status: o.status,
    items: o.items,
    subtotal: o.subtotal,
    shipping: o.shipping,
    total: o.total,
    payment: o.payment,
    customer: { name: o.customer.name },
  };
}

function setStatus(order, status) {
  if (order.status === status) return;
  // Bestand zurückbuchen, wenn storniert wird (und umgekehrt)
  if (status === 'storniert' && order.status !== 'storniert') {
    for (const it of order.items) {
      const p = products.find((x) => x.id === it.id);
      if (p) p.stock += it.qty;
    }
  } else if (order.status === 'storniert' && status !== 'storniert') {
    for (const it of order.items) {
      const p = products.find((x) => x.id === it.id);
      if (p) p.stock = Math.max(0, p.stock - it.qty);
    }
  }
  order.status = status;
  order.history.push({ status, at: new Date().toISOString() });
}

// Bestand beim Start aus bestehenden (nicht stornierten) Bestellungen ableiten
for (const o of orders) {
  if (o.status === 'storniert') continue;
  for (const it of o.items) {
    const p = products.find((x) => x.id === it.id);
    if (p) p.stock = Math.max(0, p.stock - it.qty);
  }
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (req.method === 'GET' && url.pathname === '/api/products') {
    return send(res, 200, products);
  }

  if (req.method === 'POST' && url.pathname === '/api/orders') {
    const body = await readBody(req);
    const { errors, customer, payment, items } = validateOrder(body);
    if (errors.length) return send(res, 400, { errors });

    const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
    const shipping = subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
    const now = new Date().toISOString();
    const order = {
      id: newOrderId(),
      createdAt: now,
      status: 'neu',
      history: [{ status: 'neu', at: now }],
      customer,
      payment,
      items,
      subtotal,
      shipping,
      total: round2(subtotal + shipping),
    };
    for (const it of items) products.find((p) => p.id === it.id).stock -= it.qty;
    orders.push(order);
    saveOrders();
    return send(res, 201, publicOrder(order));
  }

  if (req.method === 'GET' && parts[1] === 'orders' && parts.length === 3) {
    const o = orders.find((x) => x.id === parts[2]);
    return o ? send(res, 200, publicOrder(o)) : send(res, 404, { error: 'Bestellung nicht gefunden.' });
  }

  // ----- Admin -----
  if (parts[1] === 'admin') {
    if (!isAdmin(req)) return send(res, 401, { error: 'Nicht autorisiert.' });

    if (req.method === 'GET' && parts[2] === 'orders' && parts.length === 3) {
      return send(res, 200, [...orders].reverse());
    }

    if (req.method === 'POST' && parts[2] === 'orders' && parts[3] === 'complete-all') {
      let count = 0;
      for (const o of orders) {
        if (o.status !== 'fertig' && o.status !== 'storniert') {
          setStatus(o, 'fertig');
          count++;
        }
      }
      if (count) saveOrders();
      return send(res, 200, { completed: count });
    }

    if (req.method === 'PATCH' && parts[2] === 'orders' && parts.length === 4) {
      const o = orders.find((x) => x.id === parts[3]);
      if (!o) return send(res, 404, { error: 'Bestellung nicht gefunden.' });
      const body = await readBody(req);
      if (!STATUSES.includes(body.status)) return send(res, 400, { error: 'Ungültiger Status.' });
      setStatus(o, body.status);
      saveOrders();
      return send(res, 200, o);
    }
  }

  return send(res, 404, { error: 'Nicht gefunden.' });
}

// ---------- Statische Dateien ----------
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/admin') rel = '/admin.html';
  if (rel === '/impressum') rel = '/impressum.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Verboten');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Seite nicht gefunden');
    send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else if (req.method === 'GET') serveStatic(req, res, url);
      else send(res, 405, 'Methode nicht erlaubt');
    } catch (err) {
      if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Serverfehler' });
      if (!err.status) console.error(err);
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Imeraj Bohrkronen läuft auf http://localhost:${PORT}`);
    console.log(`Admin-Bereich:   http://localhost:${PORT}/admin`);
    if (!process.env.ADMIN_TOKEN) console.warn('Hinweis: Standard-Admin-Passwort "admin" aktiv – bitte ADMIN_TOKEN setzen.');
  });
}

module.exports = { createServer };
