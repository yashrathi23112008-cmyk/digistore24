// routes/admin.js
const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db, nowISO } = require('../db');
const { requireAuth, requireAdmin } = require('../lib/auth');

const router = express.Router();

// Every route here requires BOTH a valid login AND is_admin = 1.
// A normal user hitting these URLs gets a 403, and the admin.html page itself
// checks /api/auth/me on load and redirects non-admins away.
router.use(requireAuth, requireAdmin);

router.get('/users', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, email, address, phone, credits, expiry_date, created_at
    FROM users
    WHERE is_admin = 0
    ORDER BY created_at DESC
  `).all();
  res.json({ users: rows });
});

router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 0').get().c;
  const totalCreditsRemaining = db.prepare('SELECT COALESCE(SUM(credits),0) s FROM users WHERE is_admin = 0').get().s;
  const totalGenerations = db.prepare('SELECT COUNT(*) c FROM generations').get().c;
  res.json({ totalUsers, totalCreditsRemaining, totalGenerations });
});

// Lets you actually SEE whether Digistore24 (or any other webhook source) is
// reaching your server and whether the signature check is passing — instead of
// guessing from Railway's raw logs. status starting with "ok" = worked.
// "rejected_bad_signature" = the sha_sign check failed (wrong passphrase, or
// Digistore24 changed their field/algorithm again). "rejected_no_passphrase" =
// DIGISTORE24_IPN_PASSPHRASE isn't set on the server.
router.get('/webhooks', (req, res) => {
  const rows = db.prepare(`
    SELECT id, source, status, payload, created_at
    FROM webhook_log
    ORDER BY created_at DESC
    LIMIT 50
  `).all();
  res.json({ webhooks: rows });
});

// Manually generates a new password for a user and returns it in the response,
// ONE TIME, so you can relay it to a customer yourself (WhatsApp, email, etc.)
// This is a stopgap for as long as lib/mailer.js is still a stub that only
// prints emails to your server logs instead of actually sending them — once
// you wire up a real email provider there, customers won't need this.
router.post('/users/:id/reset-password', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_admin = 0').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const hash = bcrypt.hashSync(tempPassword, 12);

  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hash, nowISO(), user.id);

  res.json({ email: user.email, tempPassword });
});

module.exports = router;
