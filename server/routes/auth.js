const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { readData, writeData } = require('../db');

function readUsers() {
  return readData('users');
}

function writeUsers(users) {
  return writeData('users', users);
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const users = await readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

router.get('/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
  const users = (await readUsers()).map(u => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }));
  res.json(users);
});

router.post('/users', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });

  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const users = await readUsers();
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'El usuario ya existe' });
  }

  const newUser = {
    id: `usr_${uuidv4().slice(0, 8)}`,
    username,
    password: bcrypt.hashSync(password, 10),
    role: role || 'consulta',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  await writeUsers(users);
  res.status(201).json({ id: newUser.id, username: newUser.username, role: newUser.role });
});

router.delete('/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });

  let users = await readUsers();
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });

  users.splice(idx, 1);
  await writeUsers(users);
  res.json({ message: 'Usuario eliminado' });
});

module.exports = router;
