const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../db');

router.get('/', async (req, res) => {
  const suppliers = await readData('suppliers');
  res.json(suppliers);
});

router.post('/', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre del proveedor es requerido' });

  const suppliers = await readData('suppliers');
  const existing = suppliers.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) return res.status(409).json({ error: 'Ya existe un proveedor con ese nombre' });

  const newSupplier = {
    id: `sup_${uuidv4().slice(0, 8)}`,
    name: name.trim(),
    phone: req.body.phone || '',
    products: req.body.products || [],
    notes: req.body.notes || '',
    createdAt: new Date().toISOString()
  };

  suppliers.push(newSupplier);
  await writeData('suppliers', suppliers);
  res.status(201).json(newSupplier);
});

router.put('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const suppliers = await readData('suppliers');
  const idx = suppliers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Proveedor no encontrado' });

  const allowed = ['name', 'phone', 'products', 'notes'];
  allowed.forEach(field => {
    if (req.body[field] !== undefined) suppliers[idx][field] = req.body[field];
  });

  await writeData('suppliers', suppliers);
  res.json(suppliers[idx]);
});

router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  let suppliers = await readData('suppliers');
  const idx = suppliers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Proveedor no encontrado' });

  suppliers.splice(idx, 1);
  await writeData('suppliers', suppliers);
  res.json({ message: 'Proveedor eliminado' });
});

module.exports = router;
