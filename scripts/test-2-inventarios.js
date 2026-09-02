const { execSync, spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
const DATA = path.join(dir, 'server', 'data');

// ---- Limpiar a cero primero ----
['products', 'entries', 'cycles', 'suppliers'].forEach(f =>
  fs.writeFileSync(`${DATA}/${f}.json`, '[]'));

spawn('bash', ['-c', `cd ${dir} && setsid node server/server.js </dev/null >/tmp/srvT.log 2>&1 & disown; echo ok`]);
let token = null;
const request = (method, path, body, auth = true) =>
  new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${token}`;
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const r = http.request({ hostname: 'localhost', port: 3000, path, method, headers }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(raw) }); } catch (e) { resolve({ status: res.statusCode, raw }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

function assert(cond, label) {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + label);
  if (!cond) { execSync('pkill -9 -f "node server/server.js"'); process.exit(1); }
}

async function login() {
  for (let i = 0; i < 40; i++) {
    try { const r = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123' }, false); token = r.json && r.json.token; if (token) return; } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
  }
  console.log('FALLO login inicial'); process.exit(1);
}

const mkProd = (name, unit, avgCost) => request('POST', '/api/products', { name, category: 'perecedero', unit, avgCost });

async function registrarTandas(cycleId, cantidad) {
  const totales = { purchase: 0, sale: 0, loss: 0, count: 0 };
  for (let i = 0; i < cantidad; i++) {
    const p = await mkProd(`Producto prueba ${i}`, 'kg', (i + 1) * 10);
    const pid = p.json.id;
    // compra
    const qty = (i % 20) + 1;
    const totalCost = qty * (i + 1) * 10;
    await request('POST', '/api/entries', { type: 'purchase', productId: pid, quantity: qty, totalCost, date: `2025-06-${String((i % 28) + 1).padStart(2, '0')}` });
    totales.purchase += totalCost;
    // venta
    const saleQty = Math.min(qty, 5);
    const totalSale = saleQty * 15;
    await request('POST', '/api/entries', { type: 'sale', productId: pid, quantity: saleQty, totalSale, date: `2025-06-${String((i % 28) + 1).padStart(2, '0')}` });
    totales.sale += totalSale;
    // pérdida
    if (i % 3 === 0) {
      const lossCost = 10;
      await request('POST', '/api/entries', { type: 'loss', productId: pid, quantity: 1, unitCost: 10, totalCost: lossCost, lossReason: 'caducado', date: `2025-06-${String((i % 28) + 1).padStart(2, '0')}` });
      totales.loss += lossCost;
    }
    totales.count++;
  }
  return totales;
}

(async () => {
  await login();

  // ===== CICLO 1 =====
  const c1 = await request('POST', '/api/cycles/open', { startDate: '2025-06-01', openingInventory: 1000 });
  assert(c1.status === 201, 'Ciclo 1 abierto');
  const t1 = await registrarTandas(c1.json.id, 40);
  const close1 = await request('POST', '/api/cycles/close', { endDate: '2025-06-30' });
  assert(close1.status === 200, 'Ciclo 1 cerrado');
  const cur1 = close1.json;
  setTimeout(() => {}, 0);
  assert(cur1.totalPurchases === t1.purchase, `C1 compras ${cur1.totalPurchases} == ${t1.purchase}`);
  assert(cur1.totalSales === t1.sale, `C1 ventas ${cur1.totalSales} == ${t1.sale}`);
  assert(cur1.totalLosses === t1.loss, `C1 pérdidas ${cur1.totalLosses} == ${t1.loss}`);
  assert(Math.abs(cur1.netProfit - (t1.sale - t1.purchase - t1.loss)) < 1, `C1 neto coherente (${cur1.netProfit})`);
  console.log(`   C1 reseumen: compras=${cur1.totalPurchases} ventas=${cur1.totalSales} perdidas=${cur1.totalLosses} neto=${cur1.netProfit} inventarioFinal=${cur1.closingInventory}`);

  // ===== CICLO 2 (hereda inventario del 1) =====
  const c2 = await request('POST', '/api/cycles/open', { startDate: '2025-07-01' });
  assert(c2.status === 201, 'Ciclo 2 abierto');
  assert(c2.json.openingInventory === cur1.closingInventory, `C2 hereda inventario (${c2.json.openingInventory} == ${cur1.closingInventory})`);
  console.log(`   C2 inventario heredado = ${c2.json.openingInventory}`);
  const t2 = await registrarTandas(c2.json.id, 60);
  const close2 = await request('POST', '/api/cycles/close', { endDate: '2025-07-31' });
  assert(close2.status === 200, 'Ciclo 2 cerrado');
  const cur2 = close2.json;
  assert(cur2.totalPurchases === t2.purchase, `C2 compras ${cur2.totalPurchases} == ${t2.purchase}`);
  assert(cur2.totalSales === t2.sale, `C2 ventas ${cur2.totalSales} == ${t2.sale}`);
  assert(cur2.totalLosses === t2.loss, `C2 pérdidas ${cur2.totalLosses} == ${t2.loss}`);
  console.log(`   C2 reseumen: compras=${cur2.totalPurchases} ventas=${cur2.totalSales} perdidas=${cur2.totalLosses} neto=${cur2.netProfit} inventarioFinal=${cur2.closingInventory}`);

  // ===== Informe PDF/Excel =====
  const pdf = await request('GET', `/api/reports/cycle/${cur1.id}/pdf`);
  const pdfTexto = typeof pdf.json === 'string' ? pdf.json : 'PNG/binario';
  assert(pdf.status === 200, `PDF ciclo 1 (${pdf.status})`);
  const excel = await request('GET', `/api/reports/cycle/${cur1.id}/excel`);
  assert(excel.status === 200, `Excel ciclo 1 (${excel.status})`);

  // ===== Dashboard final =====
  const dash = await request('GET', '/api/dashboard');
  assert(dash.json.closedCycles === 2, `Dashboard con 2 ciclos cerrados (${dash.json.closedCycles})`);

  console.log('\n===== TEST DE 2 INVENTARIOS COMPLETADO OK =====');
  execSync('pkill -9 -f "node server/server.js"');
  process.exit(0);
})();
