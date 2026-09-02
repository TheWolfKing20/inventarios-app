const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../db');

const DAY = 86400000;
const daysAgo = (n, withTime) => new Date(Date.now() - n * DAY + (withTime ? Math.floor(Math.random() * 3600000 * 8) : 0));

// ==================== PRODUCTOS DE CAFETERÍA ====================
const CATALOGO = [
  ['Café molido', 'perecedero', 'kg', 220, 350, 2],
  ['Leche entera', 'perecedero', 'litro', 18, 30, 10],
  ['Azúcar', 'no_perecedero', 'kg', 24, 40, 5],
  ['Pan para sandwich', 'perecedero', 'pieza', 3.5, 7, 30],
  ['Pollo desmenuzado', 'perecedero', 'kg', 65, 120, 3],
  ['Queso amarillo', 'perecedero', 'kg', 110, 180, 2],
  ['Jamón', 'perecedero', 'kg', 95, 160, 2],
  ['Vasos plásticos #12', 'no_perecedero', 'caja', 45, null, 4],
  ['Vasos térmicos', 'no_perecedero', 'caja', 120, null, 2],
  ['Servilletas', 'no_perecedero', 'paquete', 30, null, 5],
  ['Agua embotellada', 'no_perecedero', 'botella', 8, 15, 20],
  ['Jugo de naranja', 'perecedero', 'litro', 35, 55, 5],
  ['Refrescos', 'no_perecedero', 'lata', 10, 18, 24],
  ['Galletas', 'no_perecedero', 'paquete', 22, 35, 8],
  ['Bolsas de té', 'no_perecedero', 'caja', 60, 90, 3],
  ['Crema para café', 'perecedero', 'frasco', 40, null, 4]
];

function isoDate(d) { return d.toISOString().split('T')[0]; }

function buildProducts() {
  const now = Date.now();
  return CATALOGO.map(([name, category, unit, avgCost, salePrice, minStock], i) => ({
    id: `prod_${String(i + 1).padStart(2, '0')}`,
    name,
    category,
    unit,
    avgCost,
    salePrice: salePrice !== null ? salePrice : null,
    minStock,
    active: true,
    notes: '',
    createdAt: new Date(now - (CATALOGO.length - i) * DAY).toISOString(),
    updatedAt: new Date(now - (CATALOGO.length - i) * DAY).toISOString()
  }));
}

// ==================== GENERADOR DE CICLO ====================
// Modo indica qué balance queremos:
//  'ganancia'  -> muchas ventas, pocas pérdidas  (netProfit positivo)
//  'perdida'   -> ventas flojas + pérdidas        (netProfit negativo leve)
function buildCycle(opts) {
  const { cicloId, mes, year, openingInventory, openingSnapshot, products, modo } = opts;
  const entries = [];
  const startDate = isoDate(new Date(Date.UTC(year, mes - 1, 1)));
  const endDate = isoDate(new Date(Date.UTC(year, mes - 1, 28)));
  const totalDays = 28;

  // Productos con actividad. Los perecederos rotan más (compras pequeñas y frecuentes)
  const activos = products.filter(p => p.active);

  let totalPurchases = 0, totalSales = 0, totalLosses = 0;

  // Distribución por producto: cada uno compra, vende y a veces pierde en días distintos
  activos.forEach((p, i) => {
    const esPerecedero = p.category === 'perecedero';
    const compras = esPerecedero ? 5 : 3;   // perecederos se compran seguido (poco a poco)
    for (let c = 0; c < compras; c++) {
      const dia = 1 + Math.floor((i * 7 + c * (totalDays / compras)) % totalDays);
      const qty = esPerecedero ? (3 + Math.floor(Math.random() * 8)) : (2 + Math.floor(Math.random() * 5));
      const total = qty * p.avgCost;
      const date = new Date(Date.UTC(year, mes - 1, dia, 9 + Math.floor(Math.random() * 6)));
      entries.push({
        id: `ent_${uuidv4().slice(0, 8)}`,
        cycleId: cicloId,
        date: isoDate(date),
        type: 'purchase',
        productId: p.id,
        description: p.name,
        quantity: qty,
        unit: p.unit,
        unitCost: p.avgCost,
        totalCost: total,
        totalSale: 0,
        hasInvoice: c % 2 === 0,
        invoiceRef: c % 2 === 0 ? `F-${mes}${String(dia).padStart(2, '0')}${String(i).padStart(2, '0')}` : '',
        supplierId: '',
        lossReason: '',
        notes: '',
        createdAt: date.toISOString()
      });
      totalPurchases += total;
    }

    // Ventas: más en modo ganancia
    const ventas = modo === 'ganancia' ? (esPerecedero ? 7 : 4) : (esPerecedero ? 4 : 2);
    for (let v = 0; v < ventas; v++) {
      const dia = 1 + ((i * 5 + v * (totalDays / ventas)) % totalDays);
      // precio de venta unitario (si no tiene salePrice, margen sobre costo)
      const precio = p.salePrice || (p.avgCost * 1.6);
      const qty = 1 + Math.floor(Math.random() * 4);
      const total = qty * precio;
      const date = new Date(Date.UTC(year, mes - 1, dia, 8 + Math.floor(Math.random() * 12)));
      entries.push({
        id: `ent_${uuidv4().slice(0, 8)}`,
        cycleId: cicloId,
        date: isoDate(date),
        type: 'sale',
        productId: p.id,
        description: p.name,
        quantity: qty,
        unit: p.unit,
        unitCost: 0,
        totalCost: 0,
        totalSale: total,
        hasInvoice: false,
        invoiceRef: '',
        supplierId: '',
        lossReason: '',
        notes: '',
        createdAt: date.toISOString()
      });
      totalSales += total;
    }

    // Pérdidas: cada 4º producto (más en modo perdida)
    const pierde = modo === 'perdida' ? i % 3 === 0 : i % 4 === 0;
    if (pierde) {
      const dia = 5 + Math.floor(Math.random() * 20);
      const qty = 1 + Math.floor(Math.random() * 3);
      const total = qty * p.avgCost;
      const date = new Date(Date.UTC(year, mes - 1, dia, 18));
      const motivos = esPerecedero ? ['Se echó a perder', 'Se venció', 'Se cayó el producto'] : ['Paquete dañado', 'Se rompió el envase'];
      entries.push({
        id: `ent_${uuidv4().slice(0, 8)}`,
        cycleId: cicloId,
        date: isoDate(date),
        type: 'loss',
        productId: p.id,
        description: p.name,
        quantity: qty,
        unit: p.unit,
        unitCost: p.avgCost,
        totalCost: total,
        totalSale: 0,
        hasInvoice: false,
        invoiceRef: '',
        supplierId: '',
        lossReason: motivos[Math.floor(Math.random() * motivos.length)],
        notes: '',
        createdAt: date.toISOString()
      });
      totalLosses += total;
    }
  });

  // Un par de ventas globales (caja) y una pérdida global sin producto
  const caja = new Date(Date.UTC(year, mes - 1, modo === 'ganancia' ? 20 : 10, 20));
  const ventaGlobal = modo === 'ganancia' ? 3500 : 1200;
  entries.push({
    id: `ent_${uuidv4().slice(0, 8)}`,
    cycleId: cicloId,
    date: isoDate(caja),
    type: 'sale',
    productId: '',
    description: 'Venta general de caja',
    quantity: 0,
    unit: '',
    unitCost: 0,
    totalCost: 0,
    totalSale: ventaGlobal,
    hasInvoice: false,
    invoiceRef: '',
    supplierId: '',
    lossReason: '',
    notes: 'Caja del día',
    createdAt: caja.toISOString()
  });
  totalSales += ventaGlobal;

  if (modo === 'perdida') {
    const perdFecha = new Date(Date.UTC(year, mes - 1, 22, 17));
    entries.push({
      id: `ent_${uuidv4().slice(0, 8)}`,
      cycleId: cicloId,
      date: isoDate(perdFecha),
      type: 'loss',
      productId: '',
      description: 'Merma por caducidad',
      quantity: 0,
      unit: '',
      unitCost: 0,
      totalCost: 350,
      totalSale: 0,
      hasInvoice: false,
      invoiceRef: '',
      supplierId: '',
      lossReason: 'Productos vencidos en almacén',
      notes: '',
      createdAt: perdFecha.toISOString()
    });
    totalLosses += 350;
  }

  // Ordenar entradas por createdAt (historial de agregado poco a poco)
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Conteo final: stock físico realista (lo que queda tras compras/ventas)
  const closingSnapshot = [];
  let closingInventory = 0;
  activos.forEach((p, i) => {
    const queda = 10 + (i % 6) * 3;
    closingSnapshot.push({
      productId: p.id,
      productName: p.name,
      countedQuantity: queda
    });
    closingInventory += queda;
  });

  const estimatedProfit = totalSales - totalPurchases;
  let netProfit = totalSales - totalPurchases - totalLosses;
  let finalSales = totalSales;

  // Garantizar el resultado deseado según el modo
  if (modo === 'ganancia' && netProfit <= 0) {
    const faltante = Math.abs(netProfit) + (totalSales * 0.15); // margen de ganancia de al menos 15% sobre ventas
    const corrective = new Date(Date.UTC(year, mes - 1, 27, 20));
    entries.push({
      id: `ent_${uuidv4().slice(0, 8)}`,
      cycleId: cicloId,
      date: isoDate(corrective),
      type: 'sale',
      productId: '',
      description: 'Venta general de caja',
      quantity: 0, unit: '', unitCost: 0, totalCost: 0,
      totalSale: faltante,
      hasInvoice: false, invoiceRef: '', supplierId: '', lossReason: '', notes: 'Cierre de caja',
      createdAt: corrective.toISOString()
    });
    finalSales += faltante;
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    netProfit = finalSales - totalPurchases - totalLosses;
  } else if (modo === 'perdida' && netProfit >= 0) {
    // Asegurar ligera pérdida: incrementar merma si hiciera falta
    const faltante = netProfit + 200;
    const corrective = new Date(Date.UTC(year, mes - 1, 27, 20));
    entries.push({
      id: `ent_${uuidv4().slice(0, 8)}`,
      cycleId: cicloId,
      date: isoDate(corrective),
      type: 'loss',
      productId: '',
      description: 'Merma por caducidad',
      quantity: 0, unit: '', unitCost: 0,
      totalCost: faltante,
      totalSale: 0,
      hasInvoice: false, invoiceRef: '', supplierId: '', lossReason: 'Ajuste de merma en cierre', notes: '',
      createdAt: corrective.toISOString()
    });
    entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    totalLosses += faltante;
    netProfit = finalSales - totalPurchases - totalLosses;
  }

  const cycle = {
    id: cicloId,
    status: 'cerrado',
    startDate,
    endDate,
    openingInventory,
    openingSnapshot: openingSnapshot || [],
    closingInventory,
    closingSnapshot,
    notes: modo === 'ganancia' ? 'Ciclo de prueba: período con ganancia' : 'Ciclo de prueba: período con ligera pérdida',
    openedBy: 'admin',
    createdAt: new Date(Date.UTC(year, mes - 1, 1, 8)).toISOString(),
    totalPurchases,
    totalSales: finalSales,
    totalLosses,
    estimatedProfit: finalSales - totalPurchases,
    netProfit,
    closedBy: 'admin',
    closedAt: new Date(Date.UTC(year, mes - 1, 28, 20)).toISOString()
  };

  return { cycle, entries };
}

// ==================== ENDPOINT: CARGAR ====================
router.post('/load', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const products = buildProducts();
  const now = new Date();
  const month = now.getMonth() + 1;   // 1-12
  const year = now.getFullYear();

  // Ciclos: mes-1 (hace 2 meses) y mes-2 (hace 3 meses), año ajustado
  function mesAnio(offsetMonthsBack) {
    const d = new Date(year, month - 1 - offsetMonthsBack, 1);
    return { m: d.getMonth() + 1, y: d.getFullYear() };
  }

  const c1 = mesAnio(2); // hace 2 meses
  const c2 = mesAnio(3); // hace 3 meses

  // Ciclo 2 (hace 3 meses) en GANANCIA
  const r2 = buildCycle({ cicloId: 'cyc_demo_ganancia', mes: c2.m, year: c2.y, openingInventory: 8000, openingSnapshot: [], products, modo: 'ganancia' });
  // Ciclo 1 (hace 2 meses) en LIGERA PERDIDA
  const r1 = buildCycle({ cicloId: 'cyc_demo_perdida', mes: c1.m, year: c1.y, openingInventory: r2.cycle.closingInventory, openingSnapshot: r2.cycle.closingSnapshot, products, modo: 'perdida' });

  // Ciclo abierto actual
  const openCycle = {
    id: 'cyc_demo_abierto',
    status: 'abierto',
    startDate: isoDate(new Date(Date.now() - 20 * DAY)),
    endDate: null,
    openingInventory: r1.cycle.closingInventory,
    openingSnapshot: r1.cycle.closingSnapshot,
    closingInventory: null,
    closingSnapshot: [],
    notes: 'Ciclo actual de prueba — registra operaciones y haz el conteo',
    openedBy: 'admin',
    createdAt: new Date(Date.now() - 20 * DAY).toISOString(),
    closedAt: null
  };

  const cycles = [r2.cycle, r1.cycle, openCycle];
  const entries = [r2.entries, r1.entries].flat();

  // Reunir el usuario admin actual (se conserva del archivo)
  const writeProducts = products.map(p => ({ ...p }));

  await writeData('products', writeProducts);
  await writeData('cycles', cycles);
  await writeData('entries', entries);
  await writeData('suppliers', []);

  res.json({
    message: 'Datos de prueba cargados',
    products: writeProducts.length,
    cycles: cycles.length,
    entries: entries.length,
    ganancia: { netProfit: r2.cycle.netProfit, ventas: r2.cycle.totalSales },
    perdida: { netProfit: r1.cycle.netProfit, ventas: r1.cycle.totalSales }
  });
});

// ==================== ENDPOINT: LIMPIAR ====================
router.post('/clear', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
  await writeData('products', []);
  await writeData('cycles', []);
  await writeData('entries', []);
  await writeData('suppliers', []);
  res.json({ message: 'Datos de prueba eliminados. La app quedó en cero.' });
});

module.exports = router;
