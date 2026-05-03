const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../db/database');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const AVATAR_COLORS = ['#6366f1','#ec4899','#14b8a6','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4'];

// POST /api/auth/signup
router.post('/signup', [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['admin', 'member']).withMessage('Role must be admin or member'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, password, role = 'member' } = req.body;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hashedPassword = bcrypt.hashSync(password, 10);
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  const result = db.prepare(
    'INSERT INTO users (name, email, password, role, avatar_color) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, hashedPassword, role, avatarColor);

  const user = db.prepare('SELECT id, name, email, role, avatar_color FROM users WHERE id = ?').get(result.lastInsertRowid);
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({ user, token });
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...safeUser } = user;

  res.json({ user: safeUser, token });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// GET /api/auth/users - list all users (for assignment dropdowns)
router.get('/users', authenticate, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, avatar_color FROM users ORDER BY name').all();
  res.json({ users });
});

module.exports = router;
