(() => {
'use strict';

/* ---------- Helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('dashly.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('dashly.' + k, JSON.stringify(v)); return true; } catch { return false; } }
};
// Small seeded random generator so demo data is the same on every load.
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const RATES = { USD: 1, EUR: 0.92, GBP: 0.79 };
const settings = { name: 'Dashly Demo Store', currency: 'USD', theme: 'light', ...store.get('settings', {}) };
const money = (n, d = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: settings.currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(n * RATES[settings.currency]);
const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const BADGES = { Completed: 'ok', Pending: 'warn', Cancelled: 'bad', Active: 'ok', VIP: 'vio', New: 'blue', 'In stock': 'ok', 'Low stock': 'warn', 'Out of stock': 'bad' };
const badge = t => `<span class="badge ${BADGES[t]}">${t}</span>`;

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : '');
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3500);
}

/* ---------- Demo data (fictional) ---------- */
const SEED = [
  ['Aero Wireless Earbuds', 'Electronics', 79, 120], ['Lumen Desk Lamp', 'Home', 45, 64],
  ['Trail Runner Jacket', 'Apparel', 96, 38], ['Calm Ceramic Mug Set', 'Home', 28, 8],
  ['Pulse Fitness Band', 'Electronics', 59, 0], ['Dew Hydrating Serum', 'Beauty', 34, 75],
  ['Summit Yoga Mat', 'Sports', 38, 52], ['Nimbus Hoodie', 'Apparel', 64, 41],
  ['Orbit Bluetooth Speaker', 'Electronics', 88, 22], ['Glow Vitamin C Cream', 'Beauty', 29, 5]
].map(([name, category, price, stock], i) => ({ id: 's' + i, name, category, price, stock }));
const CATS = [...new Set(SEED.map(p => p.category))];
const NAMES = ['Maya Collins', 'Jonas Weber', 'Priya Nair', 'Liam Foster', 'Sofia Marino', 'Omar Haddad', 'Chloe Bennett', 'Ethan Park', 'Nora Lindqvist', 'Diego Alvarez', 'Hana Sato', 'Marcus Reed'];

const rand = rng(7);
const orders = Array.from({ length: 48 }, (_, i) => {
  const p = SEED[Math.floor(rand() * SEED.length)], qty = 1 + Math.floor(rand() * 3), r = rand();
  const date = new Date(); date.setDate(date.getDate() - Math.floor(i * 0.9));
  return {
    id: '#DS-' + (2048 - i), customer: NAMES[Math.floor(rand() * NAMES.length)], product: p.name, category: p.category,
    qty, amount: p.price * qty, date, status: r < 0.62 ? 'Completed' : r < 0.86 ? 'Pending' : 'Cancelled'
  };
});
const customers = (() => {
  const m = {};
  orders.forEach(o => {
    const c = m[o.customer] ??= { name: o.customer, orders: 0, spent: 0 };
    c.orders++; if (o.status !== 'Cancelled') c.spent += o.amount;
  });
  return Object.values(m).map(c => ({ ...c, email: c.name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', status: c.spent >= 600 ? 'VIP' : c.orders >= 4 ? 'Active' : 'New' }))
    .sort((a, b) => b.spent - a.spent);
})();
let products = [...SEED, ...store.get('products', [])];

/* ---------- State ---------- */
let range = 30, period = 'daily', view = 'overview';
const os = { q: '', status: 'all', sort: 'date-desc', shown: 10 };
const charts = {};

/* ---------- KPIs ---------- */
function renderKpis() {
  const f = range / 30;
  const items = [
    ['Total Revenue', money(24680 * f), '+12.4%', 'up', 'wallet'],
    ['Total Orders', Math.round(1248 * f).toLocaleString('en-US'), '+8.1%', 'up', 'orders'],
    ['Total Customers', Math.round(864 * f).toLocaleString('en-US'), '+5.3%', 'up', 'customers'],
    ['Average Order Value', money(19.78, 2), '-1.2%', 'down', 'tag']
  ];
  $('#kpis').innerHTML = items.map(([label, val, delta, dir, icon]) => `
    <article class="card kpi">
      <div class="kpi-top"><span>${label}</span><span class="kpi-ic"><svg class="ic" aria-hidden="true"><use href="#i-${icon}"/></svg></span></div>
      <strong>${val}</strong>
      <span><span class="delta ${dir}"><span class="sr-only">${dir === 'up' ? 'Up' : 'Down'} </span>${delta}</span> <small>vs previous period (sample)</small></span>
    </article>`).join('');
}

/* ---------- Tables ---------- */
const orderRow = o => `<tr><td>${o.id}</td><td>${esc(o.customer)}</td><td>${esc(o.product)}</td><td>${fmtDate(o.date)}</td><td>${money(o.amount, 2)}</td><td>${badge(o.status)}</td>
  <td><button class="btn sm" type="button" data-order="${o.id}" aria-label="View details for order ${o.id}">Details</button></td></tr>`;

function renderOrders() {
  const q = os.q.toLowerCase(), [key, dir] = os.sort.split('-');
  const list = orders
    .filter(o => (os.status === 'all' || o.status === os.status) && (!q || o.id.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q)))
    .sort((a, b) => (key === 'date' ? a.date - b.date : a.amount - b.amount) * (dir === 'asc' ? 1 : -1));
  const rows = list.slice(0, os.shown);
  $('#ordersBody').innerHTML = rows.map(orderRow).join('');
  $('#ordersWrap').hidden = !list.length;
  $('#ordersEmpty').hidden = list.length > 0;
  $('#ordersCount').textContent = list.length ? `Showing ${rows.length} of ${list.length} orders` : '';
  $('#loadMore').hidden = rows.length >= list.length;
  $('#recentBody').innerHTML = [...orders].sort((a, b) => b.date - a.date).slice(0, 5).map(orderRow).join('');
}

const stockStatus = s => s === 0 ? 'Out of stock' : s < 10 ? 'Low stock' : 'In stock';
function renderProducts() {
  const q = $('#productSearch').value.trim().toLowerCase(), c = $('#productCat').value;
  const list = products.filter(p => (c === 'all' || p.category === c) && p.name.toLowerCase().includes(q));
  $('#productsBody').innerHTML = list.map(p => {
    const h = [...p.name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360; // fallback "image" colour from the name
    return `<tr><td><div class="prod"><span class="thumb" aria-hidden="true" style="background:hsl(${h} 75% 90%);color:hsl(${h} 55% 30%)">${esc(p.name[0].toUpperCase())}</span>${esc(p.name)}</div></td>
      <td>${esc(p.category)}</td><td>${money(p.price, 2)}</td><td>${p.stock}</td><td>${badge(stockStatus(p.stock))}</td></tr>`;
  }).join('');
  $('#productsEmpty').hidden = list.length > 0;
}

function renderCustomers() {
  const q = $('#customerSearch').value.trim().toLowerCase();
  const list = customers.filter(c => c.name.toLowerCase().includes(q) || c.email.includes(q));
  $('#customersBody').innerHTML = list.map(c => `<tr><td><strong>${esc(c.name)}</strong></td><td>${c.email}</td><td>${c.orders}</td><td>${money(c.spent, 2)}</td><td>${badge(c.status)}</td></tr>`).join('');
  $('#customersEmpty').hidden = list.length > 0;
}

/* ---------- Charts ---------- */
const PAL = ['#2f5bea', '#7c5cf0', '#19a7ce', '#f2a33a', '#e5566d'];
function applyChartTheme() {
  if (!window.Chart) return;
  Chart.defaults.color = css('--muted');
  Chart.defaults.borderColor = css('--line');
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
}
function draw(id, type, data, options = {}) {
  const canvas = $('#' + id), fallback = canvas.parentElement.querySelector('.fallback');
  if (!window.Chart) { canvas.hidden = true; fallback.hidden = false; return; }
  canvas.hidden = false; fallback.hidden = true;
  charts[id]?.destroy();
  charts[id] = new Chart(canvas, { type, data, options: { responsive: true, maintainAspectRatio: false, animation: reduce.matches ? false : { duration: 500 }, ...options } });
}
const axisTitle = text => ({ display: true, text });
const moneyAxis = { ticks: { callback: v => money(v) } };
const moneyTip = c => ' ' + money(c.parsed.y ?? c.parsed);

function renderSales() {
  const n = period === 'daily' ? range : 12, r = rng(n * period.length + 5);
  const base = { daily: 820, weekly: 5800, monthly: 24000 }[period];
  const labels = [], data = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    if (period === 'daily') d.setDate(d.getDate() - i); else if (period === 'weekly') d.setDate(d.getDate() - i * 7); else d.setMonth(d.getMonth() - i);
    labels.push(d.toLocaleDateString('en-US', period === 'monthly' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' }));
    data.push(Math.round(base * (0.78 + r() * 0.4 + (n - i) / n * 0.25)));
  }
  draw('salesChart', 'line', {
    labels, datasets: [{ label: 'Revenue (demo)', data, borderColor: PAL[0], backgroundColor: 'rgba(47,91,234,.12)', fill: true, tension: 0.35, borderWidth: 2, pointRadius: n > 20 ? 0 : 3, pointHoverRadius: 5 }]
  }, {
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: moneyTip } } },
    scales: {
      x: { title: axisTitle({ daily: 'Day', weekly: 'Week starting', monthly: 'Month' }[period]), grid: { display: false }, ticks: { maxTicksLimit: 10 } },
      y: { title: axisTitle(`Revenue (${settings.currency})`), ...moneyAxis }
    }
  });
}

function renderCharts() {
  const f = range / 30, ring = css('--card');
  renderSales();
  const cat = {}; orders.forEach(o => { if (o.status !== 'Cancelled') cat[o.category] = (cat[o.category] || 0) + o.amount; });
  const catLabels = Object.keys(cat), catVals = catLabels.map(k => Math.round(cat[k] * 6 * f));
  const ringData = { labels: catLabels, datasets: [{ data: catVals, backgroundColor: PAL, borderColor: ring, borderWidth: 2 }] };
  draw('catChart', 'doughnut', ringData, { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${money(c.parsed)}` } } } });
  draw('anCat', 'bar', { labels: catLabels, datasets: [{ label: 'Revenue (demo)', data: catVals, backgroundColor: PAL[0], borderRadius: 6 }] }, {
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: moneyTip } } },
    scales: { x: { title: axisTitle('Category'), grid: { display: false } }, y: { title: axisTitle(`Revenue (${settings.currency})`), ...moneyAxis } }
  });
  const st = ['Completed', 'Pending', 'Cancelled'].map(s => Math.round(orders.filter(o => o.status === s).length * f * 10));
  draw('anStatus', 'doughnut', { labels: ['Completed', 'Pending', 'Cancelled'], datasets: [{ data: st, backgroundColor: ['#19a77a', '#f2a33a', '#e5566d'], borderColor: ring, borderWidth: 2 }] },
    { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed} orders` } } } });
  const units = {}; orders.forEach(o => { if (o.status !== 'Cancelled') units[o.product] = (units[o.product] || 0) + o.qty; });
  const best = Object.entries(units).sort((a, b) => b[1] - a[1]).slice(0, 5);
  draw('anBest', 'bar', { labels: best.map(b => b[0]), datasets: [{ label: 'Units sold (demo)', data: best.map(b => Math.round(b[1] * f * 10)), backgroundColor: PAL[1], borderRadius: 6 }] }, {
    indexAxis: 'y', plugins: { legend: { display: false } },
    scales: { x: { title: axisTitle('Units sold') }, y: { grid: { display: false } } }
  });
}

/* ---------- Navigation & layout ---------- */
const PAGES = {
  overview: ['Overview', () => `Welcome back, Alex. Here's a demo snapshot of ${settings.name}.`],
  orders: ['Orders', () => 'Search, filter and review demo orders.'],
  products: ['Products', () => 'Browse demo products or add your own.'],
  customers: ['Customers', () => 'Fictional customers and their spending.'],
  analytics: ['Analytics', () => 'Demonstration charts for the selected date range.'],
  settings: ['Settings', () => 'Store preferences saved in this browser.']
};
function setHeader() { $('#pageTitle').textContent = PAGES[view][0]; $('#pageSub').textContent = PAGES[view][1](); $('#brandStore').textContent = settings.name; $('#rangeSel').hidden = !['overview', 'analytics'].includes(view); document.title = `${PAGES[view][0]} | Dashly`; }
let firstRoute = true;
function route() {
  const h = location.hash.slice(1);
  view = PAGES[h] ? h : 'overview';
  $$('.view').forEach(s => s.hidden = s.id !== 'view-' + view);
  $$('.nav a').forEach(a => a.getAttribute('href') === '#' + view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  setHeader(); closeDrawer(false);
  if (view === 'overview' || view === 'analytics') renderCharts(); // redraw once the section is visible
  if (!firstRoute) $('#pageTitle').focus();
  firstRoute = false;
}
function openDrawer() { document.body.classList.add('nav-open'); $('#menuBtn').setAttribute('aria-expanded', 'true'); $('.nav a').focus(); }
function closeDrawer(restore = true) {
  if (!document.body.classList.contains('nav-open')) return;
  document.body.classList.remove('nav-open'); $('#menuBtn').setAttribute('aria-expanded', 'false');
  if (restore) $('#menuBtn').focus();
}
function closeNotifs() { $('#notifs').hidden = true; $('#bellBtn').setAttribute('aria-expanded', 'false'); }

/* ---------- Forms ---------- */
function setError(form, field, msg) {
  const input = form.elements[field];
  $('#e-' + input.id).textContent = msg;
  msg ? input.setAttribute('aria-invalid', 'true') : input.removeAttribute('aria-invalid');
  return !msg;
}
function submitProduct(e) {
  e.preventDefault();
  const f = e.target, name = f.pname.value.trim(), cat = f.pcat.value, price = parseFloat(f.pprice.value), stock = Number(f.pstock.value);
  const dup = products.some(p => p.name.toLowerCase() === name.toLowerCase());
  const ok = [
    setError(f, 'pname', name.length < 2 ? 'Enter a product name with at least 2 characters.' : dup ? 'A product with this name already exists.' : ''),
    setError(f, 'pcat', cat ? '' : 'Choose a category.'),
    setError(f, 'pprice', !(price > 0 && price <= 10000) ? 'Enter a price between 0.01 and 10,000.' : ''),
    setError(f, 'pstock', f.pstock.value === '' || !Number.isInteger(stock) || stock < 0 || stock > 9999 ? 'Enter a whole number from 0 to 9,999.' : '')
  ].every(Boolean);
  if (!ok) { toast('Fix the highlighted fields and try again.', 'error'); f.querySelector('[aria-invalid=true]').focus(); return; }
  products.unshift({ id: 'u' + Date.now(), name, category: cat, price, stock });
  const saved = store.set('products', products.filter(p => p.id[0] === 'u'));
  renderProducts(); $('#productModal').close(); f.reset();
  toast(saved ? `${name} added.` : `${name} added, but could not be saved in this browser.`, saved ? 'ok' : 'error');
}
function submitSettings(e) {
  e.preventDefault();
  const f = e.target, name = f.sname.value.trim();
  if (!setError(f, 'sname', name.length < 2 ? 'Enter a store name with at least 2 characters.' : '')) { toast('Store name is required.', 'error'); f.sname.focus(); return; }
  Object.assign(settings, { name, currency: f.currency.value, theme: f.theme.value });
  store.set('settings', settings); applySettings(); toast('Settings saved.');
}
function fillSettings() {
  const f = $('#settingsForm'); f.sname.value = settings.name; f.currency.value = settings.currency; f.theme.value = settings.theme;
}
function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  applyChartTheme(); renderAll();
}
function renderAll() { renderKpis(); renderOrders(); renderProducts(); renderCustomers(); renderCharts(); setHeader(); }

/* ---------- Events ---------- */
function bind() {
  window.addEventListener('hashchange', route);
  $('#menuBtn').onclick = openDrawer; $('#scrim').onclick = () => closeDrawer();
  $('#collapseBtn').onclick = e => { const on = document.body.classList.toggle('collapsed'); e.currentTarget.setAttribute('aria-pressed', on); store.set('collapsed', on); };
  $('#bellBtn').onclick = e => { const open = $('#notifs').hidden; $('#notifs').hidden = !open; e.currentTarget.setAttribute('aria-expanded', open); };
  $('#markRead').onclick = () => { $('#bellDot').hidden = true; closeNotifs(); toast('All notifications marked as read.'); };
  document.addEventListener('click', e => {
    if (!e.target.closest('.pop-wrap')) closeNotifs();
    const close = e.target.closest('[data-close]'); if (close) close.closest('dialog').close();
    if (e.target.matches('dialog')) e.target.close(); // click on backdrop
    const btn = e.target.closest('[data-order]');
    if (btn) showOrder(orders.find(o => o.id === btn.dataset.order));
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeNotifs(); closeDrawer(); } });

  $$('.range-sel').forEach(s => s.onchange = () => { range = +s.value; $$('.range-sel').forEach(x => x.value = s.value); renderKpis(); renderCharts(); });
  $$('[data-period]').forEach(b => b.onclick = () => { period = b.dataset.period; $$('[data-period]').forEach(x => x.setAttribute('aria-pressed', x === b)); renderSales(); });

  $('#orderSearch').oninput = e => { os.q = e.target.value.trim(); os.shown = 10; renderOrders(); };
  $('#orderStatus').onchange = e => { os.status = e.target.value; os.shown = 10; renderOrders(); };
  $('#orderSort').onchange = e => { os.sort = e.target.value; renderOrders(); };
  $('#loadMore').onclick = () => { os.shown += 10; renderOrders(); };
  $('#resetOrders').onclick = () => { Object.assign(os, { q: '', status: 'all', shown: 10 }); $('#orderSearch').value = ''; $('#orderStatus').value = 'all'; renderOrders(); };

  $('#productSearch').oninput = renderProducts; $('#productCat').onchange = renderProducts;
  $('#customerSearch').oninput = renderCustomers;
  $('#addProductBtn').onclick = () => {
    const f = $('#productForm'); f.reset(); ['pname', 'pcat', 'pprice', 'pstock'].forEach(k => setError(f, k, ''));
    $('#productModal').showModal(); f.pname.focus();
  };
  $('#productForm').onsubmit = submitProduct;
  $('#settingsForm').onsubmit = submitSettings;
}

function showOrder(o) {
  const rows = [['Order ID', o.id], ['Customer', esc(o.customer)], ['Product', esc(o.product)], ['Category', o.category], ['Quantity', o.qty], ['Date', fmtDate(o.date)], ['Amount', money(o.amount, 2)], ['Status', badge(o.status)]];
  $('#orderDetail').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#orderModal').showModal();
}

/* ---------- Init ---------- */
function init() {
  const opts = CATS.map(c => `<option>${c}</option>`).join('');
  $('#productCat').insertAdjacentHTML('beforeend', opts); $('#pcat').insertAdjacentHTML('beforeend', opts);
  if (store.get('collapsed', false)) { document.body.classList.add('collapsed'); $('#collapseBtn').setAttribute('aria-pressed', 'true'); }
  fillSettings(); bind(); applySettings(); route();
  // If Chart.js finished loading after first paint, draw charts again.
  if (!window.Chart) window.addEventListener('load', () => { applyChartTheme(); renderCharts(); });
}
document.addEventListener('DOMContentLoaded', init);
})();
