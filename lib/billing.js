// lib/billing.js
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db, uuid, nowISO } = require('../db');
const { sendEmail } = require('./mailer');

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function randomPassword() {
  return crypto.randomBytes(9).toString('base64url'); // e.g. "kZ3f9QeR2mA"
}

// Called by BOTH the Digistore24 and Whop webhook handlers whenever a purchase
// (first purchase OR repurchase/renewal) is confirmed.
//
// - New email -> creates the account, generates a temporary password, emails a
//   "set your password" link (via the mailer stub).
// - Existing email -> tops up credits and pushes the expiry date forward,
//   exactly like a renewal.
async function grantOrRenewPlan({ name, email, phone, address, source }) {
  email = (email || '').toLowerCase().trim();
  if (!email) throw new Error('Webhook payload had no email address.');

  const planCredits = Number(process.env.PLAN_CREDITS || 900);
  const planDays = Number(process.env.PLAN_DURATION_DAYS || 30);

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const now = nowISO();
  const newExpiry = addDays(now, planDays);

  if (existing) {
    db.prepare(`
      UPDATE users
      SET credits = ?, expiry_date = ?, last_purchase_source = ?, last_purchase_at = ?,
          name = COALESCE(NULLIF(?, ''), name),
          phone = COALESCE(NULLIF(?, ''), phone),
          address = COALESCE(NULLIF(?, ''), address),
          updated_at = ?
      WHERE id = ?
    `).run(planCredits, newExpiry, source, now, name || '', phone || '', address || '', now, existing.id);

    await sendEmail(email, 'Your plan has been renewed',
      `Hi ${existing.name},\n\nYour plan was renewed: you now have ${planCredits} credits, valid until ${newExpiry}.\n`);

    return { id: existing.id, created: false };
  }

  const id = uuid();
  const tempPassword = randomPassword();
  const hash = bcrypt.hashSync(tempPassword, 12);

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, phone, address, credits, expiry_date,
                        is_admin, last_purchase_source, last_purchase_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `).run(id, name || email, email, hash, phone || '', address || '', planCredits, newExpiry, source, now, now, now);

  const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/login.html`;
  await sendEmail(email, 'Welcome! Your account is ready',
    `Hi ${name || ''},\n\nThanks for your purchase. You have ${planCredits} credits, valid until ${newExpiry}.\n\n` +
    `Log in here: ${loginUrl}\nEmail: ${email}\nTemporary password: ${tempPassword}\n\n` +
    `Please log in and use "Reset password" on your profile page to set your own password.`);

  return { id, created: true };
}

module.exports = { grantOrRenewPlan, addDays };
