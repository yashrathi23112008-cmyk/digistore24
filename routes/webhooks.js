// routes/webhooks.js
//
// IMPORTANT: Digistore24 occasionally adjusts the exact IPN field names/signing
// method. The logic below follows their commonly documented scheme, but BEFORE
// going live you must open your Digistore24 account's IPN documentation and
// confirm the parameter names and signing method still match this code.
// Test with their "send test IPN" button first.

const express = require('express');
const crypto = require('node:crypto');
const { db, uuid, nowISO } = require('../db');
const { grantOrRenewPlan } = require('../lib/billing');

const router = express.Router();

function logWebhook(source, payload, status) {
  db.prepare('INSERT INTO webhook_log (id, source, payload, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), source, JSON.stringify(payload).slice(0, 5000), status, nowISO());
}

// ---------------------------------------------------------------------------
// Digistore24 IPN
// Digistore24 sends form-encoded POST data including an "sha_sign" field.
// Verification: sort all other received fields alphabetically by key, join
// their VALUES, append your IPN passphrase, then SHA-512 the result (uppercase
// hex) and compare it to "sha_sign". Confirm this against your Digistore24
// account's current IPN documentation before relying on it in production.
// ---------------------------------------------------------------------------
router.post('/digistore24', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const body = req.body || {};
    const passphrase = process.env.DIGISTORE24_IPN_PASSPHRASE;
    const receivedSign = body.sha_sign;

    if (!passphrase) {
      console.error('DIGISTORE24_IPN_PASSPHRASE is not set — rejecting webhook.');
      logWebhook('digistore24', body, 'rejected_no_passphrase');
      return res.status(500).send('Server not configured.');
    }
    if (!receivedSign) {
      logWebhook('digistore24', body, 'rejected_no_signature');
      return res.status(400).send('Missing signature.');
    }

    const keys = Object.keys(body).filter(k => k !== 'sha_sign').sort();
    const valueString = keys.map(k => body[k]).join('');
    const expectedSign = crypto
      .createHash('sha512')
      .update(valueString + passphrase)
      .digest('hex')
      .toUpperCase();

    if (expectedSign !== String(receivedSign).toUpperCase()) {
      logWebhook('digistore24', body, 'rejected_bad_signature');
      return res.status(401).send('Invalid signature.');
    }

    // Only react to events that mean "money received" — adjust to the event
    // names shown in your Digistore24 IPN settings if they differ.
    const okEvents = ['on_payment', 'on_rebill_payment', 'connection_test'];
    if (!okEvents.includes(body.event)) {
      logWebhook('digistore24', body, `ignored_event_${body.event}`);
      return res.status(200).send('OK'); // acknowledge, but do nothing
    }

    const allowedProducts = (process.env.DIGISTORE24_PRODUCT_IDS || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (allowedProducts.length && !allowedProducts.includes(String(body.product_id))) {
      logWebhook('digistore24', body, 'ignored_wrong_product');
      return res.status(200).send('OK');
    }

    if (body.event !== 'connection_test') {
      await grantOrRenewPlan({
        name: [body.first_name, body.last_name].filter(Boolean).join(' '),
        email: body.email,
        phone: body.phone_no,
        address: [body.street, body.city, body.state, body.zipcode, body.country].filter(Boolean).join(', '),
        source: 'digistore24',
      });
    }

    logWebhook('digistore24', body, 'ok');
    res.status(200).send('OK');
  } catch (err) {
    console.error('Digistore24 webhook error:', err);
    logWebhook('digistore24', req.body, 'error_' + err.message);
    res.status(500).send('Error');
  }
});

module.exports = router;
