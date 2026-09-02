// Capa de persistencia de InventariosApp.
//
// Si la variable de entorno DATABASE_URL está definida, usa PostgreSQL
// (modelo: una tabla por colección con una columna de datos JSON).
// Si no, cae al filesystem local (carpeta server/data), igual que la
// versión local de la app.
//
// Exponemos readData/file y writeData ante la lógica del negocio es muy
// similar a la versión local: lee/escribe una colección entera como JSON.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

const COLLECTIONS = ['users', 'products', 'entries', 'cycles', 'suppliers'];

const DATABASE_URL = process.env.DATABASE_URL || '';

// Inicialización temprana: si hay DATABASE_URL, conectamos el driver.
function getPool() {
  if (!DATABASE_URL) return null;
  // Cargamos pg bajo demanda para no romper la instalación local.
  const { Pool } = require('pg');
  return new Pool({ connectionString: DATABASE_URL, ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : undefined });
}

// Caché de consultas a nivel módulo (evita crear pool por llamada).
let pool = null;

async function ensureTables() {
  if (!pool) pool = getPool();
  if (!pool) return;
  for (const name of COLLECTIONS) {
    await pool.query(`CREATE TABLE IF NOT EXISTS ${name} (key TEXT PRIMARY KEY, id TEXT, data JSONB)`);
    // Índice sobre el id para búsquedas directas
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${name}_id ON ${name}(id)`);
  }
}

// Normaliza la columna para persistir el id interno como clave sobre el json
function filterKeys(name) {
  return ['id'];
}

async function readCollection(name) {
  if (!pool) pool = getPool();
  if (!pool) {
    // Mode local (filesystem)
    const fp = path.join(DATA_DIR, `${name}.json`);
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') {
        fs.writeFileSync(fp, '[]', 'utf8');
        return [];
      }
      throw e;
    }
  }
  // Mode PostgreSQL
  const { rows } = await pool.query(`SELECT data FROM ${name}`);
  return rows.map(r => r.data);
}

async function writeCollection(name, records) {
  if (!pool) pool = getPool();
  if (!pool) {
    const fp = path.join(DATA_DIR, `${name}.json`);
    fs.writeFileSync(fp, JSON.stringify(records, null, 2), 'utf8');
    return;
  }
  // Mode PostgreSQL: reemplazamos la colección completa (truncate + insert).
  await pool.query(`TRUNCATE ${name}`);
  for (const record of records) {
    const key = record.id ? String(record.id) : `${name}_${Math.random().toString(36).slice(2)}`;
    await pool.query(`INSERT INTO ${name} (key, id, data) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [key, record.id || null, record]);
  }
}

// ============================================================
// API pública con firma equivalente a la versión local
// ============================================================

async function readData(file) {
  return readCollection(file);
}

async function writeData(file, data) {
  return writeCollection(file, data);
}

// Para los scripts de arranque / operaciones puntuales
async function init() {
  if (DATABASE_URL) {
    if (!pool) pool = getPool();
    await ensureTables();
  } else {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const name of COLLECTIONS) {
      const fp = path.join(DATA_DIR, `${name}.json`);
      if (!fs.existsSync(fp)) fs.writeFileSync(fp, '[]', 'utf8');
    }
  }
}

module.exports = { readData, writeData, init, readCollection, writeCollection };