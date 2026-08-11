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

module.exports = router;
