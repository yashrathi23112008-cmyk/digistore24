// routes/auth.js
const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db, uuid, nowISO } = require('../db');
const { setSessionCookie, clearSessionCookie, requireAuth, publicUser } = require('../lib/auth');
const { sendEmail } = require('../lib/mailer');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  setSessionCookie(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Step 1: user requests a reset link
router.post('/forgot-password', async (req, res) => {
  const email = String((req.body || {}).email || '').toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // Always respond the same way, whether or not the account exists,
  // so an attacker can't use this endpoint to discover valid emails.
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?')
      .run(token, expiry, user.id);

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/login.html?reset=${token}`;
    await sendEmail(user.email, 'Reset your password',
      `Click this link to set a new password (valid 1 hour):\n${resetUrl}`);
  }

  res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
});

// Step 2: user submits new password with the token from the email
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'A valid token and a password of at least 8 characters are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
  if (!user || !user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL, updated_at = ? WHERE id = ?')
    .run(hash, nowISO(), user.id);

  res.json({ ok: true });
});

module.exports = router;
