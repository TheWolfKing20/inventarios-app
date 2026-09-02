const { execSync, spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
const DATA = path.join(dir, 'server', 'data');

['products', 'entries', 'cycles', 'suppliers'].forEach(f =>
  fs.writeFileSync(`${DATA}/${f}.json`, '[]'));

spawn('bash', ['-c', `cd ${dir} && setsid node server/server.js </dev/null >/tmp/srvSeed.log 2>&1 & disown; echo ok`]);

let token = null;
const request = (method, p, body, auth = true) =>
  new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${token}`;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ hostname: 'localhost', port: 3000, path: p, method, headers }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(raw) }); } catch (e) { resolve({ status: res.statusCode, raw }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

async function login() {
  for (let i = 0; i < 40; i++) {
    try { const r = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123' }, false); token = r.json && r.json.token; if (token) return; } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('No pude iniciar sesión');
}

const CATALOGO = [
  ['Café molido', 'perecedero', 'kg', 220, 350],
  ['Leche entera', 'perecedero', 'litro', 18, 30],
  ['Azúcar', 'no_perecedero', 'kg', 24, 40],
  ['Pan para sandwich', 'perecedero', 'pieza', 3.5, 7],
  ['Pollo desmenuzado', 'perecedero', 'kg', 65, 120],
  ['Queso amarillo', 'perecedero', 'kg', 110, 180],
  ['Jamón', 'perecedero', 'kg', 95, 160],
  ['Vasos plásticos #12', 'no_perecedero', 'caja', 45, null],
  ['Vasos térmicos', 'no_perecedero', 'caja', 120, null],
  ['Servilletas', 'no_perecedero', 'paquete', 30, null],
  ['Agua embotellada', 'no_perecedero', 'botella', 8, 15],
  ['Jugo de naranja', 'perecedero', 'litro', 35, 55],
  ['Refrescos', 'no_perecedero', 'lata', 10, 18],
  ['Galletas', 'no_perecedero', 'paquete', 22, 35],
  ['Bolsas de té', 'no_perecedero', 'caja', 60, 90],
  ['Crema para café', 'perecedero', 'frasco', 40, null]
];

const fecha = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

async function crearProductos() {
  const map = {};
  for (const [name, cat, unit, avgCost, salePrice] of CATALOGO) {
    const r = await request('POST', '/api/products', { name, category: cat, unit, avgCost, salePrice });
    map[name] = r.json.id;
  }
  return Object.values(map);
}

async function correrCiclo(m, openingInventory, prodIds) {
  const c = await request('POST', '/api/cycles/open', { startDate: fecha(2026, m, 1), openingInventory });
  for (let i = 0; i < prodIds.length; i++) {
    const pid = prodIds[i];
    const base = Math.max(15, (i + 3) * 7);
    await request('POST', '/api/entries', { date: fecha(2026, m, 2), type: 'purchase', productId: pid, quantity: 20, totalCost: 20 * base, hasInvoice: true, invoiceRef: `F-${m}01` });
    await request('POST', '/api/entries', { date: fecha(2026, m, 9), type: 'purchase', productId: pid, quantity: 15, totalCost: 15 * base, hasInvoice: true, invoiceRef: `F-${m}02` });
    await request('POST', '/api/entries', { date: fecha(2026, m, 16), type: 'purchase', productId: pid, quantity: 10, totalCost: 10 * base, hasInvoice: true, invoiceRef: `F-${m}03` });
    await request('POST', '/api/entries', { date: fecha(2026, m, 4), type: 'sale', productId: pid, quantity: 6, totalSale: 6 * 2 });
    await request('POST', '/api/entries', { date: fecha(2026, m, 11), type: 'sale', productId: pid, quantity: 8, totalSale: 8 * 2 });
    await request('POST', '/api/entries', { date: fecha(2026, m, 18), type: 'sale', productId: pid, quantity: 5, totalSale: 5 * 2 });
  }
  // Entradas sin producto (descripción libre) y una pérdida
  await request('POST', '/api/entries', { date: fecha(2026, m, 15), type: 'sale', description: `Venta del fin de semana (${m})`, totalSale: 2400 });
  await request('POST', '/api/entries', { date: fecha(2026, m, 20), type: 'loss', description: 'Producto caducado', quantity: 3, totalCost: 90, lossReason: 'Se venció' });
  // Conteo final realista: stock que queda = compras (45) - ventas (19) - pérdida
  const countedQuantities = {};
  prodIds.forEach((pid, i) => { countedQuantities[pid] = 15 + (i % 7) * 2; });
  const close = await request('POST', '/api/cycles/close', { endDate: fecha(2026, m, 28), countedQuantities });
  return close.json;
}

async function main() {
  await login();
  const prodIds = await crearProductos();
  console.log('Productos creados:', prodIds.length);

  const c1 = await correrCiclo(6, 12000, prodIds);
  console.log('-> C1 junio: compras', c1.totalPurchases, 'ventas', c1.totalSales, 'perdidas', c1.totalLosses, 'inventario final', c1.closingInventory);

  const c2 = await correrCiclo(7, c1.closingInventory, prodIds);
  console.log('-> C2 julio: compras', c2.totalPurchases, 'ventas', c2.totalSales, 'perdidas', c2.totalLosses, 'inventario final', c2.closingInventory);

  const c3 = await request('POST', '/api/cycles/open', { startDate: fecha(2026, 8, 13) });
  console.log('-> C3 abierto desde', c3.json.startDate, 'inventario heredado', c3.json.openingInventory);

  console.log('\n===== SEED DE CAFETERÍA CARGADO =====');
  console.log('2 ciclos cerrados (junio y julio) + 1 abierto actual para probar la captura.');
  execSync('pkill -9 -f "node server/server.js"');
  process.exit(0);
}

main().catch(e => { console.error('FALLO:', e.message); try { execSync('pkill -9 -f "node server/server.js"'); } catch (_) {} process.exit(1); });
