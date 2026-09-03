const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../db');

router.get('/', async (req, res) => {
  let entries = await readData('entries');
  const { cycleId, date, type } = req.query;

  if (cycleId) entries = entries.filter(e => e.cycleId === cycleId);
  if (date) entries = entries.filter(e => e.date === date);
  if (type) entries = entries.filter(e => e.type === type);

  entries.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt.localeCompare(b.createdAt));
  res.json(entries);
});

router.post('/', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const cycles = await readData('cycles');
  const openCycle = cycles.find(c => c.status === 'abierto');
  if (!openCycle) return res.status(400).json({ error: 'No hay un ciclo de inventario abierto. Crea uno primero.' });

  const { type } = req.body;
  if (!['purchase', 'sale', 'loss'].includes(type)) return res.status(400).json({ error: 'Tipo inválido' });

  const newEntry = {
    id: `ent_${uuidv4().slice(0, 8)}`,
    cycleId: openCycle.id,
    date: req.body.date || new Date().toISOString().split('T')[0],
    type,
    productId: req.body.productId || '',
    description: req.body.description || '',
    quantity: req.body.quantity !== undefined ? Number(req.body.quantity) : 0,
    unit: req.body.unit || '',
    unitCost: req.body.unitCost !== undefined ? Number(req.body.unitCost) : 0,
    totalCost: req.body.totalCost !== undefined ? Number(req.body.totalCost) : 0,
    totalSale: req.body.totalSale !== undefined ? Number(req.body.totalSale) : 0,
    hasInvoice: !!req.body.hasInvoice,
    invoiceRef: req.body.invoiceRef || '',
    isDaySale: !!req.body.isDaySale,
    supplierId: req.body.supplierId || '',
    lossReason: req.body.lossReason || '',
    notes: req.body.notes || '',
    createdAt: new Date().toISOString()
  };

  if (newEntry.description && req.body.productId) {
    const products = await readData('products');
    const p = products.find(x => x.id === req.body.productId);
    if (p && !newEntry.description) newEntry.description = p.name;
  }

  const entries = await readData('entries');
  entries.push(newEntry);
  await writeData('entries', entries);
  res.status(201).json(newEntry);
});

router.put('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const entries = await readData('entries');
  const idx = entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Registro no encontrado' });

  const allowed = ['date', 'type', 'productId', 'description', 'quantity', 'unit', 'unitCost', 'totalCost', 'totalSale', 'hasInvoice', 'invoiceRef', 'supplierId', 'lossReason', 'notes', 'isDaySale'];
  allowed.forEach(field => {
    if (req.body[field] !== undefined) entries[idx][field] = req.body[field];
  });

  await writeData('entries', entries);
  res.json(entries[idx]);
});

router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  let entries = await readData('entries');
  const idx = entries.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Registro no encontrado' });

  entries.splice(idx, 1);
  await writeData('entries', entries);
  res.json({ message: 'Registro eliminado' });
});

module.exports = router;
