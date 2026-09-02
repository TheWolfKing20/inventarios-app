const express = require('express');
const path = require('path');

const db = require('./db');
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const suppliersRoutes = require('./routes/suppliers');
const entriesRoutes = require('./routes/entries');
const cyclesRoutes = require('./routes/cycles');
const reportsRoutes = require('./routes/reports');
const demoRoutes = require('./routes/demo');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS para orígenes distintos (necesario en despliegues con frontend separado o APK)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/products', authenticateToken, productsRoutes);
app.use('/api/suppliers', authenticateToken, suppliersRoutes);
app.use('/api/entries', authenticateToken, entriesRoutes);
app.use('/api/cycles', authenticateToken, cyclesRoutes);
app.use('/api/reports', authenticateToken, reportsRoutes);
app.use('/api/demo', authenticateToken, demoRoutes);

app.get('/api/dashboard', authenticateToken, async (req, res) => {
  const cycles = await db.readData('cycles');
  const entries = await db.readData('entries');

  const openCycle = cycles.find(c => c.status === 'abierto') || null;

  let totals = { purchases: 0, sales: 0, losses: 0, entries: [] };
  if (openCycle) {
    const cycleEntries = entries.filter(e => e.cycleId === openCycle.id);
    totals.purchases = cycleEntries.filter(e => e.type === 'purchase').reduce((s, e) => s + (e.totalCost || 0), 0);
    totals.sales = cycleEntries.filter(e => e.type === 'sale').reduce((s, e) => s + (e.totalSale || 0), 0);
    totals.losses = cycleEntries.filter(e => e.type === 'loss').reduce((s, e) => s + (e.totalCost || 0), 0);
    totals.entries = cycleEntries.slice(-10).reverse();
  }

  const products = await db.readData('products');

  res.json({
    openCycle,
    totals,
    cycleCount: cycles.length,
    closedCycles: cycles.filter(c => c.status === 'cerrado').length,
    productCount: products.length
  });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

async function start() {
  // Inicializa tablas (PostgreSQL) o archivos (local)
  await db.init();

  // Seed del usuario admin si no existe (tanto local como PostgreSQL)
  const users = await db.readData('users');
  if (!users.some(u => u.username === 'admin')) {
    const bcrypt = require('bcryptjs');
    users.push({
      id: 'usr_001',
      username: 'admin',
      password: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    await db.writeData('users', users);
    console.log('Usuario admin garantizado.');
  }

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });
}

start().catch(err => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
