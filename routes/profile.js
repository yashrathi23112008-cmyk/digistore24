// routes/profile.js
const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { db, nowISO } = require('../db');
const { requireAuth, publicUser } = require('../lib/auth');

const router = express.Router();

// --- avatar upload setup ---
const AVATAR_DIR = path.join(__dirname, '..', 'public', 'uploads');
const upload = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.user.id}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Only PNG, JPG, WEBP or GIF images are allowed.'), ok);
  },
});

// A logged-in user can only ever read/edit the row that matches req.user.id —
// there is no route anywhere that accepts a different user's id from the client.
router.get('/', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/', requireAuth, (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name cannot be empty.' });

  db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?')
    .run(name.trim(), nowISO(), req.user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(updated) });
});

router.post('/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

  const url = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?')
    .run(url, nowISO(), req.user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(updated) });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Current password and a new password (8+ characters) are required.' });
  }
  if (!bcrypt.compareSync(currentPassword, req.user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hash, nowISO(), req.user.id);

  res.json({ ok: true });
});

module.exports = router;
