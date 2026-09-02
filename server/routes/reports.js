const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { readData, writeData } = require('../db');

const money = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function getProductsMap() {
  const map = {};
  (await readData('products')).forEach(p => { map[p.id] = p; });
  return map;
}

async function getSuppliersMap() {
  const map = {};
  (await readData('suppliers')).forEach(s => { map[s.id] = s; });
  return map;
}

async function getCycleSummary(cycle) {
  const entries = (await readData('entries')).filter(e => e.cycleId === cycle.id);
  const productsMap = await getProductsMap();
  const suppliersMap = await getSuppliersMap();

  const purchases = entries.filter(e => e.type === 'purchase');
  const sales = entries.filter(e => e.type === 'sale');
  const losses = entries.filter(e => e.type === 'loss');

  return {
    cycle,
    entries,
    purchaseCount: purchases.length,
    saleCount: sales.length,
    lossCount: losses.length,
    totalPurchases: purchases.reduce((s, e) => s + (e.totalCost || 0), 0),
    totalSales: sales.reduce((s, e) => s + (e.totalSale || 0), 0),
    totalLosses: losses.reduce((s, e) => s + (e.totalCost || 0), 0),
    purchases,
    sales,
    losses,
    productsMap,
    suppliersMap
  };
}

function setupDoc(title, sub) {
  const doc = new PDFDocument({ margin: 45, size: 'A4' });
  doc.font('Helvetica');

  doc.rect(45, 40, doc.page.width - 90, 80).fill('#2c3e50');
  doc.fillColor('#fff').fontSize(20).font('Helvetica-Bold').text('InventariosApp', 60, 50);
  doc.fontSize(13).font('Helvetica').text(title, 60, 75);
  doc.fontSize(9).text(`${sub || ''}`, 60, 95);
  doc.fontSize(8).fillColor('#bdc3c7').text(`Generado: ${new Date().toLocaleString('es-MX')}`, 60, 110);

  doc.fillColor('#2c3e50');
  return doc;
}

function drawTable(doc, headers, rows, startY, colWidths, opts = {}) {
  let y = startY;
  const pageWidth = doc.page.width - 90;
  const widths = colWidths || headers.map(() => pageWidth / headers.length);

  doc.fontSize(8).font('Helvetica-Bold');
  let x = 45;
  doc.rect(45, y, pageWidth, 20).fill('#34495e');
  doc.fillColor('#fff');
  headers.forEach((h, i) => {
    doc.text(String(h), x + 4, y + 2, { width: widths[i] - 8, align: opts.align && opts.align[i] ? opts.align[i] : 'left' });
    x += widths[i];
  });
  y += 20;

  doc.font('Helvetica').fillColor('#000');
  rows.forEach((row, ri) => {
    if (y > doc.page.height - 70) {
      doc.addPage();
      y = 140;
      x = 45;
      doc.fontSize(8).font('Helvetica-Bold');
      doc.rect(45, y, pageWidth, 20).fill('#34495e');
      doc.fillColor('#fff');
      headers.forEach((h, i) => {
        doc.text(String(h), x + 4, y + 2, { width: widths[i] - 8 });
        x += widths[i];
      });
      y += 20;
      doc.font('Helvetica').fillColor('#000');
    }

    let maxH = 18;
    row.forEach((cell, i) => {
      const lines = Math.ceil(doc.heightOfString(String(cell), { width: widths[i] - 8 }) / 10);
      if (lines > (maxH - 6) / 12) maxH = (lines * 12) + 6;
    });

    doc.rect(45, y, pageWidth, maxH).fill(ri % 2 === 0 ? '#f8f9fa' : '#ffffff');
    x = 45;
    row.forEach((cell, i) => {
      doc.fillColor('#000').fontSize(8);
      doc.text(String(cell), x + 4, y + 2, { width: widths[i] - 8 });
      x += widths[i];
    });
    y += maxH;
  });

  return y;
}

function addMarginLine(doc) {
  doc.rect(45, 128, doc.page.width - 90, 0.5).fill('#ecf0f1');
}

function finalize(doc) {
  const pageCount = doc.bufferedPageRange();
  for (let i = 0; i < pageCount.count; i++) {
    doc.switchToPage(pageCount.start + i);
    doc.fontSize(7).fillColor('#95a5a6').text(
      `Página ${i + 1} de ${pageCount.count} — InventariosApp`,
      45, doc.page.height - 30, { width: doc.page.width - 90, align: 'center' }
    );
  }
  return doc;
}

// ============ PDF RESUMEN DE CICLO ============
router.get('/cycle/:cycleId/pdf', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });

  const s = await getCycleSummary(cycle);
  const doc = setupDoc('Resumen del Ciclo de Inventario', `Ciclo del ${s.cycle.startDate} al ${s.cycle.endDate || '—'} (${s.cycle.status === 'cerrado' ? 'Cerrado' : 'Abierto'})`);
  addMarginLine(doc);

  let y = 140;
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#2c3e50').text('Resumen Económico', 45, y);
  y += 20;
  doc.font('Helvetica').fontSize(10).fillColor('#000');
  const rows = [
    ['Total de compras', '', money(s.totalPurchases)],
    ['Total de ventas', '', money(s.totalSales)],
    ['Total de pérdidas', '', money(s.totalLosses)],
    ['Ganancia estimada (ventas - compras)', '', money(s.totalSales - s.totalPurchases)],
    ['Ganancia neta (ventas - compras - pérdidas)', '', money(s.totalSales - s.totalPurchases - s.totalLosses)]
  ];
  if (cycle.openingInventory) rows.push(['Inventario inicial', '', money(cycle.openingInventory)]);
  if (cycle.closingInventory) rows.push(['Inventario final contado', '', money(cycle.closingInventory)]);

  rows.forEach(r => {
    doc.font('Helvetica').text(r[0], 45, y, { width: 330 });
    doc.font('Helvetica-Bold').text(r[2], 420, y);
    y += 16;
  });

  y += 10;
  y = drawTable(doc, ['Tipo', 'Registros', 'Monto'], [
    ['Compras', s.purchaseCount, money(s.totalPurchases)],
    ['Ventas', s.saleCount, money(s.totalSales)],
    ['Pérdidas', s.lossCount, money(s.totalLosses)]
  ], y, [240, 100, 160]);

  finalize(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=resumen_ciclo_${s.cycle.startDate}.pdf`);
  doc.pipe(res);
  doc.end();
});

// ============ PDF DETALLE DE COMPRAS ============
router.get('/cycle/:cycleId/purchases/pdf', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });

  const s = await getCycleSummary(cycle);
  const doc = setupDoc('Detalle de Compras', `Ciclo del ${cycle.startDate} al ${cycle.endDate || '—'}`);
  addMarginLine(doc);

  const rows = s.purchases.map(e => [e.date, s.productsMap[e.productId]?.name || e.description || '-', s.suppliersMap[e.supplierId]?.name || '—', e.hasInvoice ? 'Sí' : 'No', money(e.totalCost)]);
  const counts = {};
  s.purchases.forEach(e => {
    const name = s.productsMap[e.productId]?.name || e.description || 'Sin producto';
    if (counts[name]) counts[name] += e.totalCost || 0;
    else counts[name] = e.totalCost || 0;
  });

  let y = drawTable(doc, ['Fecha', 'Producto', 'Proveedor', 'Factura', 'Total'], rows, 140, [65, 190, 140, 55, 80]);

  if (Object.keys(counts).length) {
    y += 10;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#2c3e50').text('Compras por Producto', 45, y);
    y += 18;
    doc.font('Helvetica').fillColor('#000').fontSize(9);
    Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([name, total]) => {
      doc.text(`${name}: ${money(total)}`, 45, y);
      y += 14;
    });
  }
  y += 10;
  doc.font('Helvetica-Bold').fillColor('#2c3e50').text(`Total comprado: ${money(s.totalPurchases)}`, 45, y);

  finalize(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=compras_ciclo_${cycle.startDate}.pdf`);
  doc.pipe(res);
  doc.end();
});

// ============ PDF DETALLE DE VENTAS ============
router.get('/cycle/:cycleId/sales/pdf', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });

  const s = await getCycleSummary(cycle);
  const doc = setupDoc('Detalle de Ventas', `Ciclo del ${cycle.startDate} al ${cycle.endDate || '—'}`);
  addMarginLine(doc);

  const rows = s.sales.map(e => [e.date, s.productsMap[e.productId]?.name || e.description || 'Sin producto', e.quantity || '—', money(e.totalSale)]);
  let y = drawTable(doc, ['Fecha', 'Producto', 'Cantidad', 'Total'], rows, 140, [70, 220, 90, 100]);

  y += 10;
  doc.font('Helvetica-Bold').fillColor('#2c3e50').text(`Total vendido: ${money(s.totalSales)}`, 45, y);

  finalize(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=ventas_ciclo_${cycle.startDate}.pdf`);
  doc.pipe(res);
  doc.end();
});

// ============ PDF DETALLE DE PÉRDIDAS ============
router.get('/cycle/:cycleId/losses/pdf', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });

  const s = await getCycleSummary(cycle);
  const doc = setupDoc('Detalle de Pérdidas', `Ciclo del ${cycle.startDate} al ${cycle.endDate || '—'}`);
  addMarginLine(doc);

  const rows = s.losses.map(e => [e.date, s.productsMap[e.productId]?.name || e.description || 'Sin producto', e.lossReason || '—', money(e.totalCost)]);
  let y = drawTable(doc, ['Fecha', 'Producto', 'Motivo', 'Pérdida'], rows, 140, [70, 190, 170, 90]);

  y += 10;
  doc.font('Helvetica-Bold').fillColor('#2c3e50').text(`Total de pérdidas: ${money(s.totalLosses)}`, 45, y);

  finalize(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=perdidas_ciclo_${cycle.startDate}.pdf`);
  doc.pipe(res);
  doc.end();
});

// ============ PDF COMPARATIVO ENTRE CICLOS ============
router.get('/comparative/pdf', async (req, res) => {
  const cycles = await readData('cycles');
  const closed = cycles.filter(c => c.status === 'cerrado');
  const doc = setupDoc('Comparativo entre Ciclos', `${closed.length} ciclos cerrados`);
  addMarginLine(doc);

  if (closed.length === 0) {
    doc.fillColor('#2c3e50').text('Aún no hay ciclos cerrados para comparar.', 45, 150);
    finalize(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=comparativo.pdf');
    doc.pipe(res);
    doc.end();
    return;
  }

  const entriesAll = await readData('entries');
  const rows = closed.map(c => [
    `${c.startDate} al ${c.endDate || '—'}`,
    money(entriesAll.filter(e => e.cycleId === c.id && e.type === 'purchase').reduce((s, e) => s + (e.totalCost || 0), 0)),
    money(entriesAll.filter(e => e.cycleId === c.id && e.type === 'sale').reduce((s, e) => s + (e.totalSale || 0), 0)),
    money(c.netProfit)
  ]);

  drawTable(doc, ['Ciclo', 'Compras', 'Ventas', 'Ganancia Neta'], rows, 140, [200, 120, 120, 120]);

  finalize(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=comparativo_ciclos.pdf');
  doc.pipe(res);
  doc.end();
});

// ============ EXCEL EXPORT ============
router.get('/cycle/:cycleId/excel', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });

  const s = await getCycleSummary(cycle);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InventariosApp';
  wb.created = new Date();

  const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } } };
  const moneyFmt = '"$"#,##0.00';

  const wsSummary = wb.addWorksheet('Resumen');
  wsSummary.columns = [{ width: 30 }, { width: 20 }];
  wsSummary.addRow(['Concepto', 'Valor']);
  wsSummary.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  wsSummary.addRow(['Ciclo', `${cycle.startDate} al ${cycle.endDate || '—'}`]);
  wsSummary.addRow(['Estado', cycle.status]);
  wsSummary.addRow(['Total de compras', s.totalPurchases]);
  wsSummary.addRow(['Total de ventas', s.totalSales]);
  wsSummary.addRow(['Total de pérdidas', s.totalLosses]);
  wsSummary.addRow(['Ganancia estimada', s.totalSales - s.totalPurchases]);
  wsSummary.addRow(['Ganancia neta', s.totalSales - s.totalPurchases - s.totalLosses]);
  if (cycle.openingInventory) wsSummary.addRow(['Inventario inicial', cycle.openingInventory]);
  if (cycle.closingInventory) wsSummary.addRow(['Inventario final', cycle.closingInventory]);
  wsSummary.getCell('B3').numFmt = moneyFmt;

  const wsPurch = wb.addWorksheet('Compras');
  wsPurch.columns = [{ width: 15 }, { width: 30 }, { width: 25 }, { width: 15 }, { width: 15 }];
  wsPurch.addRow(['Fecha', 'Producto', 'Proveedor', 'Factura', 'Total']);
  wsPurch.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  s.purchases.forEach(e => wsPurch.addRow([e.date, s.productsMap[e.productId]?.name || e.description || '-', s.suppliersMap[e.supplierId]?.name || '—', e.hasInvoice ? 'Sí' : 'No', e.totalCost]));

  const wsSales = wb.addWorksheet('Ventas');
  wsSales.columns = [{ width: 15 }, { width: 30 }, { width: 15 }, { width: 15 }];
  wsSales.addRow(['Fecha', 'Producto', 'Cantidad', 'Total']);
  wsSales.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  s.sales.forEach(e => wsSales.addRow([e.date, s.productsMap[e.productId]?.name || e.description || '-', e.quantity || '', e.totalSale]));

  const wsLoss = wb.addWorksheet('Pérdidas');
  wsLoss.columns = [{ width: 15 }, { width: 30 }, { width: 25 }, { width: 15 }];
  wsLoss.addRow(['Fecha', 'Producto', 'Motivo', 'Pérdida']);
  wsLoss.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  s.losses.forEach(e => wsLoss.addRow([e.date, s.productsMap[e.productId]?.name || e.description || '-', e.lossReason || '', e.totalCost]));

  const wsCount = wb.addWorksheet('Conteo Final');
  wsCount.columns = [{ width: 30 }, { width: 15 }];
  wsCount.addRow(['Producto', 'Cantidad Contada']);
  wsCount.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  (cycle.closingSnapshot || []).forEach(sn => wsCount.addRow([sn.productName, sn.countedQuantity]));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=ciclo_${cycle.startDate}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

// ============ EXCEL TEMPLATE ============
router.get('/template', async (req, res) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InventariosApp';
  const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } } };

  const ws = wb.addWorksheet('Registros');
  ws.columns = [
    { width: 15 }, { width: 30 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 12 }, { width: 20 }
  ];
  ws.addRow(['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Costo Total', 'Venta Total', '¿Factura?', 'Motivo (pérdida)']);
  ws.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  ws.addRow(['2025-09-15', 'Pollo entero', 'compra', '3', '195.00', '', 'sí', '']);
  ws.addRow(['2025-09-15', 'Pollo entero', 'venta', '1', '', '120.00', '', '']);
  ws.addRow(['2025-09-16', 'Leche', 'perdida', '2', '40.00', '', '', 'se echó a perder']);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=plantilla_registros.xlsx');
  await wb.xlsx.write(res);
  res.end();
});

// ============ EXCEL IMPORT ============
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/import', upload.single('file'), async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

  const cycles = await readData('cycles');
  const openCycle = cycles.find(c => c.status === 'abierto');
  if (!openCycle) return res.status(400).json({ error: 'No hay un ciclo abierto para importar' });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);

  const ws = wb.getWorksheet('Registros') || wb.worksheets[0];
  const products = await readData('products');
  let entries = await readData('entries');
  let createdProducts = 0;
  let createdEntries = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const date = row.getCell(1).value;
    const productName = row.getCell(2).value;
    const typeRaw = String(row.getCell(3).value || '').toLowerCase().trim();
    const quantity = Number(row.getCell(4).value) || 0;
    const totalCost = Number(row.getCell(5).value) || 0;
    const totalSale = Number(row.getCell(6).value) || 0;
    const hasInvoiceCell = row.getCell(7).value;
    const lossReason = row.getCell(8).value || '';

    if (!productName) return;

    let type = typeRaw === 'venta' ? 'sale' : typeRaw === 'compra' ? 'purchase' : typeRaw === 'perdida' || typeRaw === 'pérdida' ? 'loss' : null;
    if (!type) return;

    let product = products.find(p => p.name.toLowerCase() === String(productName).trim().toLowerCase());
    if (!product) {
      const { v4: uuidv4 } = require('uuid');
      product = { id: `prod_${uuidv4().slice(0, 8)}`, name: String(productName).trim(), category: '', unit: '', avgCost: type === 'purchase' ? (quantity ? totalCost / quantity : 0) : 0, salePrice: null, minStock: 0, active: true, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      products.push(product);
      createdProducts++;
    }

    const entry = {
      id: `ent_${require('uuid').v4().slice(0, 8)}`,
      cycleId: openCycle.id,
      date: date ? (date instanceof Date ? date.toISOString().split('T')[0] : String(date).slice(0, 10)) : new Date().toISOString().split('T')[0],
      type,
      productId: product.id,
      description: '',
      quantity,
      unit: product.unit || '',
      unitCost: type === 'purchase' && quantity ? totalCost / quantity : 0,
      totalCost,
      totalSale,
      hasInvoice: /s(i|í)/i.test(String(hasInvoiceCell || '')),
      invoiceRef: '',
      supplierId: '',
      lossReason,
      notes: '',
      createdAt: new Date().toISOString()
    };

    entries.push(entry);
    createdEntries++;
  });

  await writeData('products', products);
  await writeData('entries', entries);
  res.json({ createdProducts, createdEntries, message: `Importados ${createdEntries} registros y ${createdProducts} productos nuevos.` });
});

// ============================================================
//  CALCULO DE BALANCE GENERAL POR CICLO
// ============================================================
async function getBalance(cycle) {
  const entries = (await readData('entries')).filter(e => e.cycleId === cycle.id);
  const totalPurchases = entries.filter(e => e.type === 'purchase').reduce((s, e) => s + (e.totalCost || 0), 0);
  const totalSales = entries.filter(e => e.type === 'sale').reduce((s, e) => s + (e.totalSale || 0), 0);
  const totalLosses = entries.filter(e => e.type === 'loss').reduce((s, e) => s + (e.totalCost || 0), 0);
  const utilidad = totalSales - totalPurchases - totalLosses;

  const invInicial = cycle.openingInventory || 0;
  const invFinal = cycle.closingInventory || 0;
  const pasivos = 0; // proveedores/pasivos no modelados en esta app

  // Efectivo: lo que queda en caja tras financiar el inventario final.
  const efectivo = (pasivos + invInicial + utilidad) - invFinal;

  const totalActivos = efectivo + invFinal;
  const capitalTrabajo = invInicial + utilidad;
  const totalPasivoCap = pasivos + capitalTrabajo;

  const margen = totalSales > 0 ? (utilidad / totalSales) * 100 : 0;

  return { totalPurchases, totalSales, totalLosses, utilidad, invInicial, invFinal, pasivos, efectivo, totalActivos, capitalTrabajo, totalPasivoCap, margen };
}

// ============================================================
//  PDF BALANCE GENERAL (colores profesionales)
// ============================================================
router.get('/cycle/:cycleId/balance/pdf', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });
  const b = await getBalance(cycle);

  const doc = new PDFDocument({ margin: 45, size: 'A4' });

  const gradient = '#1f3a5f';
  doc.rect(0, 0, doc.page.width, 110).fill(gradient);
  doc.rect(0, 110, doc.page.width, 6).fill('#e67e22');
  doc.fillColor('#fff').fontSize(24).font('Helvetica-Bold').text('BALANCE GENERAL', 45, 32);
  doc.fontSize(12).font('Helvetica').text(`InventariosApp · Ciclo del ${cycle.startDate} al ${cycle.endDate || '—'}`, 45, 62);
  doc.fontSize(9).fillColor('#cbd5e0').text(`Generado: ${new Date().toLocaleString('es-MX')}`, 45, 82);

  doc.fillColor('#1f3a5f');
  let y = 135;

  const sectionTitle = (txt, color) => {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(color).text(txt, 45, y);
    doc.moveTo(45, y + 14).lineTo(doc.page.width - 45, y + 14).lineWidth(1.5).strokeColor(color).stroke();
    y += 26;
  };
  const line = (label, value, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#1a1a1a');
    doc.text(label, 60, y, { width: 280 });
    doc.text(String(value), 400, y, { width: 150, align: 'right' });
    y += 17;
  };
  const total = (label, value) => {
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#1f3a5f');
    doc.text(label, 60, y, { width: 280 });
    doc.text(money(value), 400, y, { width: 150, align: 'right' });
    y += 20;
  };

  sectionTitle('ACTIVOS', '#27ae60');
  line('Caja (efectivo operativo)', money(b.efectivo));
  line('Inventario de mercancía', money(b.invFinal));
  y += 2;
  total('Total Activos', b.totalActivos);

  y += 8;
  sectionTitle('PASIVOS', '#e74c3c');
  line('Proveedores por pagar', money(b.pasivos));
  y += 2;
  total('Total Pasivos', b.pasivos);

  y += 8;
  sectionTitle('CAPITAL DE TRABAJO Y PATRIMONIO', '#2980b9');
  line('Inventario inicial (aportado)', money(b.invInicial));
  line('Utilidad del período', money(b.utilidad));
  y += 2;
  total('Total Patrimonio', b.capitalTrabajo);

  y += 6;
  total('Total Pasivo + Patrimonio', b.totalPasivoCap);

  y += 16;
  doc.rect(45, y, doc.page.width - 90, 46).fill('#fdf6ea');
  doc.fillColor('#e67e22').font('Helvetica-Bold').fontSize(11).text('RENTABILIDAD', 60, y + 8);
  doc.font('Helvetica').fillColor('#1a1a1a').fontSize(10).text(`Utilidad neta: ${money(b.utilidad)}   ·   Margen sobre ventas: ${b.margen.toFixed(2)}%`, 60, y + 24);
  doc.text(`Ventas del ciclo: ${money(b.totalSales)}  ·  Compras: ${money(b.totalPurchases)}  ·  Pérdidas: ${money(b.totalLosses)}`, 60, y + 36);

  finalize(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=balance_general_${cycle.startDate}.pdf`);
  doc.pipe(res);
  doc.end();
});

// ============================================================
//  PDF DISTRIBUCION DE SALDO
// ============================================================
router.get('/cycle/:cycleId/saldo/pdf', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });
  const b = await getBalance(cycle);

  const doc = setupDoc('Distribución de Saldo', `Ciclo del ${cycle.startDate} al ${cycle.endDate || '—'}`);
  addMarginLine(doc);

  let y = 140;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#2c3e50').text('Origen y destino del saldo del ciclo', 45, y);
  y += 24;

  const rows = [
    ['Ingresos por ventas', money(b.totalSales)],
    ['Compras del periodo', money(b.totalPurchases)],
    ['Perdidas registradas', money(b.totalLosses)],
    ['Inventario inicial', money(b.invInicial)],
    ['Inventario final (contado)', money(b.invFinal)],
    ['Saldo en caja (efectivo)', money(b.efectivo)]
  ];
  y = drawTable(doc, ['Concepto', 'Monto'], rows, y, [330, 140]);

  y += 16;
  doc.font('Helvetica-Bold').fillColor('#2c3e50').fontSize(10).text('Resultado:',
    45, y);
  doc.font('Helvetica').fontSize(10).fillColor('#000').text(
    `Utilidad neta = Ventas - Compras - Pérdidas = ${money(b.utilidad)}`,
    45, y + 18);

  finalize(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=distribucion_saldo_${cycle.startDate}.pdf`);
  doc.pipe(res);
  doc.end();
});

// ============================================================
//  PDF LISTADO DE MERCANCIA
// ============================================================
router.get('/cycle/:cycleId/mercancia/pdf', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });

  const doc = setupDoc('Listado de Mercancía', `Ciclo del ${cycle.startDate} al ${cycle.endDate || '—'}`);
  addMarginLine(doc);

  const snap = cycle.closingSnapshot || [];
  const entries = (await readData('entries')).filter(e => e.cycleId === cycle.id);
  const productsMap = await getProductsMap();

  const filas = snap.map(sn => {
    const p = productsMap[sn.productId];
    return [
      sn.productName || (p ? p.name : '-'),
      p ? (p.unit || '—') : '—',
      sn.countedQuantity || 0,
      money((sn.countedQuantity || 0) * (p ? p.avgCost : 0))
    ];
  });

  let y = drawTable(doc, ['Mercancía', 'Unidad', 'Cantidad', 'Valor estimado'], filas, 140, [200, 80, 80, 110]);

  const totalValor = snap.reduce((s, sn) => s + ((sn.countedQuantity || 0) * ((productsMap[sn.productId] ? productsMap[sn.productId].avgCost : 0))), 0);
  y += 12;
  doc.font('Helvetica-Bold').fillColor('#2c3e50').text(`Total de inventario contado: ${money(totalValor)}`, 45, y);

  finalize(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=listado_mercancia_${cycle.startDate}.pdf`);
  doc.pipe(res);
  doc.end();
});

// ============================================================
//  EXCEL: BALANCE GENERAL, DISTRIBUCION Y MERCANCIA
// ============================================================
async function writeExcel(res, rows, sheetName, filename) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InventariosApp';
  wb.created = new Date();
  const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } } };
  const ws = wb.addWorksheet(sheetName);
  ws.columns = rows[0].map(() => ({ width: 28 }));
  ws.addRow(rows[0]);
  ws.getRow(1).eachCell(c => Object.assign(c, headerStyle));
  rows.slice(1).forEach(r => ws.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

router.get('/cycle/:cycleId/balance/excel', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });
  const b = await getBalance(cycle);
  const rows = [
    ['BALANCE GENERAL', `${cycle.startDate} al ${cycle.endDate || '—'}`],
    [],
    ['ACTIVOS', ''],
    ['Caja (efectivo operativo)', b.efectivo],
    ['Inventario de mercancía', b.invFinal],
    ['Total Activos', b.totalActivos],
    [],
    ['PASIVOS', ''],
    ['Proveedores por pagar', b.pasivos],
    ['Total Pasivos', b.pasivos],
    [],
    ['PATRIMONIO', ''],
    ['Inventario inicial', b.invInicial],
    ['Utilidad del período', b.utilidad],
    ['Total Patrimonio', b.capitalTrabajo],
    [],
    ['Total Pasivo + Patrimonio', b.totalPasivoCap],
    [],
    ['Rentabilidad', ''],
    ['Margen sobre ventas (%)', b.margen.toFixed(2)]
  ];
  await writeExcel(res, rows, 'Balance General', `balance_general_${cycle.startDate}`);
});

router.get('/cycle/:cycleId/saldo/excel', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });
  const b = await getBalance(cycle);
  const rows = [
    ['DISTRIBUCIÓN DE SALDO', `${cycle.startDate} al ${cycle.endDate || '—'}`],
    ['Ingresos por ventas', b.totalSales],
    ['Compras del periodo', b.totalPurchases],
    ['Pérdidas registradas', b.totalLosses],
    ['Inventario inicial', b.invInicial],
    ['Inventario final (contado)', b.invFinal],
    ['Saldo en caja (efectivo)', b.efectivo],
    ['Utilidad neta', b.utilidad],
    ['Margen sobre ventas (%)', b.margen.toFixed(2)]
  ];
  await writeExcel(res, rows, 'Distribución de Saldo', `distribucion_saldo_${cycle.startDate}`);
});

router.get('/cycle/:cycleId/mercancia/excel', async (req, res) => {
  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.id === req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Ciclo no encontrado' });
  const snap = cycle.closingSnapshot || [];
  const productsMap = await getProductsMap();
  const rows = [['Mercancía', 'Unidad', 'Cantidad', 'Valor estimado']];
  snap.forEach(sn => {
    const p = productsMap[sn.productId];
    rows.push([sn.productName || (p ? p.name : '-'), p ? (p.unit || '—') : '—', sn.countedQuantity || 0, (sn.countedQuantity || 0) * (p ? p.avgCost : 0)]);
  });
  await writeExcel(res, rows, 'Listado de Mercancía', `listado_mercancia_${cycle.startDate}`);
});

// ============================================================
//  PDF DOCUMENTACION (indice general)
// ============================================================
router.get('/documentation/pdf', (req, res) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.rect(0, 0, doc.page.width, 120).fill('#1f3a5f');
  doc.rect(0, 120, doc.page.width, 6).fill('#e67e22');
  doc.fillColor('#fff').fontSize(26).font('Helvetica-Bold').text('InventariosApp', 50, 34);
  doc.fontSize(13).font('Helvetica').text('Documentación del sistema', 50, 68);
  doc.fontSize(9).fillColor('#cbd5e0').text(`Versión 1.0 · Generado el ${new Date().toLocaleDateString('es-MX')}`, 50, 90);

  doc.fillColor('#1f3a5f');
  let y = 145;

  const h1 = (t) => { doc.font('Helvetica-Bold').fontSize(14).fillColor('#1f3a5f').text(t, 50, y); y += 30; };
  const h2 = (t) => { doc.font('Helvetica-Bold').fontSize(11).fillColor('#e67e22').text(t, 50, y); y += 20; };
  const p = (t) => { doc.font('Helvetica').fontSize(10).fillColor('#333').text(t, 50, y, { width: doc.page.width - 100 }); y += doc.heightOfString(t, { width: doc.page.width - 100 }) + 8; };
  const bullet = (t) => { doc.font('Helvetica').fontSize(9.5).fillColor('#444').text('• ' + t, 60, y, { width: doc.page.width - 120 }); y += doc.heightOfString('• ' + t, { width: doc.page.width - 120 }) + 6; };

  h1('Índice');
  bullet('1. Introducción');
  bullet('2. Requisitos e instalación');
  bullet('3. Inicio de sesión y usuarios');
  bullet('4. Ciclos de inventario');
  bullet('5. Registro de compras, ventas y pérdidas');
  bullet('6. Captura rápida de inventario físico');
  bullet('7. Informes y reportes (PDF / Excel)');
  bullet('8. Mantenimiento de datos y copias de seguridad');

  y += 12;
  h1('1. Introducción');
  p('InventariosApp es una herramienta local para llevar el inventario de un negocio (como una cafetería) mediante "ciclos de inventario". En lugar de meses fijos, cada ciclo se abre el día del conteo, acumula compras, ventas y pérdidas, y se cierra al contar físicamente la mercancía.');

  y += 8;
  h1('2. Requisitos e instalación');
  bullet('Node.js instalado en la máquina.');
  bullet('Ejecutar el lanzador correspondiente: iniciar.sh (Linux) o iniciar.bat (Windows).');
  bullet('El lanzador instala dependencias, abre el navegador e inicia el servidor en http://localhost:3000.');

  y += 8;
  h1('3. Inicio de sesión y usuarios');
  p('El sistema es multiusuario con roles admin y consulta. El usuario administrador puede crear, editar y eliminar datos; el rol consulta solo puede ver informes.');

  y += 8;
  h1('4. Ciclos de inventario');
  p('El inventario funciona por ciclos. El stock inicial de un ciclo es el sobrante del anterior (se arrastra automáticamente). Abrir un ciclo, registrar operaciones y cerrarlo con el conteo físico es el flujo normal de trabajo.');

  y += 8;
  h1('5. Registro de compras, ventas y pérdidas');
  p('Se registran en el módulo de Registro. Cada entrada pertenece al ciclo abierto. Pueden tener producto asociado (con unidad y costo) o ser descripciones libres (p. ej. "2 zanahorias emergencia"). La ganancia neta del ciclo se calcula como: Ventas - Compras - Pérdidas.');

  y += 8;
  h1('6. Captura rápida de inventario físico');
  p('En Inventario, escriba el producto y presione Tab o Enter para autocompletar (no distingue mayúsculas ni acentos), luego la cantidad y Enter. Los productos contados salen en la columna verde y los pendientes en la roja. La lista se guarda automáticamente en el almacenamiento local del navegador para que no se pierda al recargar o reiniciar.');

  y += 8;
  h1('7. Informes y reportes');
  bullet('Resumen, detalle de compras, ventas y pérdidas de cada ciclo.');
  bullet('Comparativo entre ciclos cerrados.');
  bullet('Balance general (Activos, Pasivos, Capital de trabajo, Utilidad y margen).');
  bullet('Distribución de saldo y Listado de mercancía.');
  bullet('Todos se exportan en PDF (decorado) y Excel.');

  y += 8;
  h1('8. Mantenimiento de datos');
  p('Según el despliegue, los datos se guardan en archivos JSON (server/data) o en una base de datos PostgreSQL si se configura DATABASE_URL. En la versión local haga una copia de seguridad copiando la carpeta server/data. Para dejar la app en cero conservando el usuario admin, use el script limpiar.sh o limpiar.bat.');

  finalize(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=documentacion_inventariosapp.pdf');
  doc.pipe(res);
  doc.end();
});

module.exports = router;
