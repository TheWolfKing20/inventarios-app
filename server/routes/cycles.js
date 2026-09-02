const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../db');

function computeCycle(cycle, entries) {
  const cycleEntries = entries.filter(e => e.cycleId === cycle.id);
  const totalPurchases = cycleEntries.filter(e => e.type === 'purchase').reduce((s, e) => s + (e.totalCost || 0), 0);
  const totalSales = cycleEntries.filter(e => e.type === 'sale').reduce((s, e) => s + (e.totalSale || 0), 0);
  const totalLosses = cycleEntries.filter(e => e.type === 'loss').reduce((s, e) => s + (e.totalCost || 0), 0);

  return {
    ...cycle,
    entryCount: cycleEntries.length,
    totalPurchases,
    totalSales,
    totalLosses,
    estimatedProfit: totalSales - totalPurchases,
    netProfit: totalSales - totalPurchases - totalLosses
  };
}

router.get('/', async (req, res) => {
  const cycles = await readData('cycles');
  const entries = await readData('entries');
  const enriched = cycles.map(c => computeCycle(c, entries));
  enriched.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || 0);
  res.json(enriched);
});

router.get('/current', async (req, res) => {
  const cycles = await readData('cycles');
  const entries = await readData('entries');
  const openCycle = cycles.find(c => c.status === 'abierto');
  if (!openCycle) return res.json(null);
  res.json(computeCycle(openCycle, entries));
});

router.post('/open', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const cycles = await readData('cycles');
  if (cycles.some(c => c.status === 'abierto')) {
    return res.status(400).json({ error: 'Ya hay un ciclo de inventario abierto' });
  }

  const lastClosed = [...cycles].filter(c => c.status === 'cerrado').sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0];

  const newCycle = {
    id: `cyc_${uuidv4().slice(0, 8)}`,
    status: 'abierto',
    startDate: req.body.startDate || new Date().toISOString().split('T')[0],
    endDate: null,
    openingInventory: lastClosed ? lastClosed.closingInventory : (Number(req.body.openingInventory) || 0),
    openingSnapshot: lastClosed ? lastClosed.closingSnapshot : [],
    closingInventory: null,
    closingSnapshot: [],
    notes: req.body.notes || '',
    openedBy: req.user.username,
    createdAt: new Date().toISOString(),
    closedAt: null
  };

  cycles.push(newCycle);
  await writeData('cycles', cycles);
  res.status(201).json(newCycle);
});

async function buildClosingSnapshot(productIds, countedMap) {
  const products = await readData('products');
  return productIds.map(id => {
    const p = products.find(x => x.id === id);
    return {
      productId: id,
      productName: p ? p.name : 'Producto',
      countedQuantity: countedMap[id] !== undefined ? Number(countedMap[id]) : 0
    };
  });
}

router.post('/close', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const cycles = await readData('cycles');
  const cycle = cycles.find(c => c.status === 'abierto');
  if (!cycle) return res.status(400).json({ error: 'No hay un ciclo abierto' });

  const entries = await readData('entries');
  const cycleEntries = entries.filter(e => e.cycleId === cycle.id);

  const totalPurchases = cycleEntries.filter(e => e.type === 'purchase').reduce((s, e) => s + (e.totalCost || 0), 0);
  const totalSales = cycleEntries.filter(e => e.type === 'sale').reduce((s, e) => s + (e.totalSale || 0), 0);
  const totalLosses = cycleEntries.filter(e => e.type === 'loss').reduce((s, e) => s + (e.totalCost || 0), 0);

  const products = await readData('products');
  const openingMap = {};
  (cycle.openingSnapshot || []).forEach(s => { openingMap[s.productId] = s.countedQuantity; });

  const involvedProductIds = new Set([
    ...Object.keys(openingMap),
    ...cycleEntries.map(e => e.productId).filter(Boolean)
  ]);

  const closingSnapshot = await buildClosingSnapshot([...involvedProductIds], req.body.countedQuantities || {});
  const closingInventory = closingSnapshot.reduce((sum, s) => sum + (s.countedQuantity || 0), 0);

  cycle.status = 'cerrado';
  cycle.endDate = req.body.endDate || new Date().toISOString().split('T')[0];
  cycle.closingInventory = typeof req.body.closingInventory === 'number' ? req.body.closingInventory : closingInventory;
  cycle.closingSnapshot = closingSnapshot;
  cycle.totalPurchases = totalPurchases;
  cycle.totalSales = totalSales;
  cycle.totalLosses = totalLosses;
  cycle.estimatedProfit = totalSales - totalPurchases;
  cycle.netProfit = totalSales - totalPurchases - totalLosses;
  cycle.notes = req.body.notes || cycle.notes;
  cycle.closedBy = req.user.username;
  cycle.closedAt = new Date().toISOString();

  const idx = cycles.findIndex(c => c.id === cycle.id);
  cycles[idx] = cycle;
  await writeData('cycles', cycles);

  res.json(computeCycle(cycle, entries));
});

router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const cycles = await readData('cycles');
  const idx = cycles.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Ciclo no encontrado' });

  const cycle = cycles[idx];
  if (cycle.status === 'abierto') {
    const entries = await readData('entries');
    const remaining = entries.filter(e => e.cycleId !== cycle.id);
    await writeData('entries', remaining);
    cycles.splice(idx, 1);
    await writeData('cycles', cycles);
    return res.json({ message: 'Ciclo abierto eliminado junto con sus registros' });
  }

  cycles.splice(idx, 1);
  await writeData('cycles', cycles);
  res.json({ message: 'Ciclo eliminado' });
});

module.exports = router;
