// routes/admin.js
const express = require('express');
const { db } = require('../db');
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

module.exports = router;
