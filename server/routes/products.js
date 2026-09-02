const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('../db');

router.get('/', async (req, res) => {
  let products = await readData('products');
  const { category, search, active } = req.query;

  if (category) products = products.filter(p => p.category === category);
  if (active === 'true') products = products.filter(p => p.active);
  if (search) {
    const s = search.toLowerCase();
    products = products.filter(p => p.name.toLowerCase().includes(s));
  }

  res.json(products);
});

router.post('/', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const { name } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre del producto es requerido' });

  const products = await readData('products');
  const existing = products.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
  if (existing) return res.status(409).json({ error: 'Ya existe un producto con ese nombre', product: existing });

  const newProduct = {
    id: `prod_${uuidv4().slice(0, 8)}`,
    name: name.trim(),
    category: req.body.category || '',
    unit: req.body.unit || '',
    avgCost: req.body.avgCost !== undefined ? Number(req.body.avgCost) : 0,
    salePrice: req.body.salePrice !== undefined ? Number(req.body.salePrice) : null,
    minStock: req.body.minStock !== undefined ? Number(req.body.minStock) : 0,
    active: req.body.active !== false,
    notes: req.body.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  products.push(newProduct);
  await writeData('products', products);
  res.status(201).json(newProduct);
});

router.put('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const products = await readData('products');
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Producto no encontrado' });

  const allowed = ['name', 'category', 'unit', 'avgCost', 'salePrice', 'minStock', 'active', 'notes'];
  allowed.forEach(field => {
    if (req.body[field] !== undefined) products[idx][field] = req.body[field];
  });
  products[idx].updatedAt = new Date().toISOString();

  await writeData('products', products);
  res.json(products[idx]);
});

router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const entries = await readData('entries');
  const used = entries.some(e => e.productId === req.params.id);
  if (used) return res.status(400).json({ error: 'No se puede eliminar un producto con registros. Mejor desactívalo.' });

  let products = await readData('products');
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Producto no encontrado' });

  products.splice(idx, 1);
  await writeData('products', products);
  res.json({ message: 'Producto eliminado' });
});

module.exports = router;
