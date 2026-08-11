// routes/webhooks.js
//
// IMPORTANT: Payment providers change their exact signature/verification method
// from time to time. The logic below follows each provider's commonly documented
// scheme, but BEFORE going live you must open your Digistore24 / Whop dashboard
// docs and confirm the parameter names and signing method still match this code.
// Test with their "send test webhook" button first.

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

// ---------------------------------------------------------------------------
// Whop webhook
// Whop signs the RAW request body with HMAC-SHA256 using your webhook signing
// secret, sent in a header (commonly "whop-signature" or "x-whop-signature").
// Confirm the exact header name and scheme in your Whop developer dashboard.
// ---------------------------------------------------------------------------
router.post('/whop', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const secret = process.env.WHOP_WEBHOOK_SECRET;
    const signatureHeader = req.headers['whop-signature'] || req.headers['x-whop-signature'];

    if (!secret) {
      console.error('WHOP_WEBHOOK_SECRET is not set — rejecting webhook.');
      logWebhook('whop', {}, 'rejected_no_secret');
      return res.status(500).send('Server not configured.');
    }
    if (!signatureHeader) {
      logWebhook('whop', {}, 'rejected_no_signature');
      return res.status(400).send('Missing signature.');
    }

    const rawBody = req.body; // Buffer, because of express.raw() above
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const providedSig = String(signatureHeader).replace(/^sha256=/, '');
    const validSig = expected.length === providedSig.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedSig));

    if (!validSig) {
      logWebhook('whop', {}, 'rejected_bad_signature');
      return res.status(401).send('Invalid signature.');
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    logWebhook('whop', event, 'received');

    // Adjust these event-type checks to match what Whop actually sends for
    // "membership went valid / payment succeeded" in your dashboard's docs.
    const okTypes = ['membership.went_valid', 'payment.succeeded'];
    if (!okTypes.includes(event.type)) {
      return res.status(200).send('OK');
    }

    const data = event.data || {};
    await grantOrRenewPlan({
      name: data.user?.name || data.name,
      email: data.user?.email || data.email,
      phone: data.user?.phone || '',
      address: data.user?.address || '',
      source: 'whop',
    });

    res.status(200).send('OK');
  } catch (err) {
    console.error('Whop webhook error:', err);
    logWebhook('whop', {}, 'error_' + err.message);
    res.status(500).send('Error');
  }
});

module.exports = router;
