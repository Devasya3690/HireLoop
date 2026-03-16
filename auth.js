const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../services/db');
const { JWT_SECRET } = require('../middleware/auth');
const { validateEmail } = require('../services/validation');

const router = express.Router();
const SALT_ROUNDS = 10;

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ message: emailValidation.message });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const db = getDb();
    const normalizedEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = db
      .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .run(normalizedEmail, hash);

    const token = jwt.sign({ id: result.lastInsertRowid, email: normalizedEmail }, JWT_SECRET, {
      expiresIn: '7d',
    });

    res.status(201).json({ token, user: { id: result.lastInsertRowid, email: normalizedEmail } });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const db = getDb();
    const normalizedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordHash = user.password_hash || user.password;
    if (!passwordHash) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, passwordHash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
