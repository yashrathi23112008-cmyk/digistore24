// routes/webhooks.js
//
// Digistore24 IPN handler.
//
// FIXED (see comments below):
//   1. The SHA-512 signature algorithm was wrong. Digistore24's real algorithm
//      hashes "key=value" + passphrase for EVERY parameter concatenated together
//      (sorted, case-insensitive, skipping empty values) — not just the values
//      joined together with the passphrase appended once at the end. With the old
//      algorithm every signature check failed, so every real purchase was silently
//      rejected as "invalid signature" and no account was ever created.
//   2. The buyer's name/phone/address fields were being read under the wrong keys
//      (first_name, last_name, phone_no, street, city, state, zipcode, country).
//      Digistore24 actually sends these prefixed with "address_" (address_first_name,
//      address_last_name, address_phone_no, address_street, address_city,
//      address_state, address_zipcode, address_country). The old code was reading
//      fields that don't exist, so name/phone/address always came back empty.
//   3. Added handling for on_refund / on_chargeback / last_paid_day so a refunded
//      or charged-back purchase actually revokes the credits it granted, instead of
//      leaving the customer with credits after Digistore24 has taken the money back.
//
// Reference: https://dev.digistore24.com/hc/en-us/articles/32480561422353-Events
//
// IMPORTANT: Digistore24 can adjust field names/algorithm over time. Before going
// live, use the "Send test IPN" / "Test connection" button in your Digistore24
// IPN settings and check the Admin panel's Webhook Log (see routes/admin.js) to
// confirm you're getting "ok" rows, not "rejected_bad_signature" ones.

const express = require('express');
const crypto = require('node:crypto');
const { db, uuid, nowISO } = require('../db');
const { grantOrRenewPlan, revokePlan } = require('../lib/billing');

const router = express.Router();

function logWebhook(source, payload, status) {
  db.prepare('INSERT INTO webhook_log (id, source, payload, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), source, JSON.stringify(payload).slice(0, 5000), status, nowISO());
}

// ---------------------------------------------------------------------------
// Digistore24's official SHA-512 signature algorithm (as of their current
// developer docs):
//   1. Take every parameter EXCEPT "sha_sign".
//   2. Sort the parameter names alphabetically, case-INsensitive.
//   3. Skip any parameter whose value is empty/missing.
//   4. For each remaining parameter, append the literal string "key=value"
//      followed immediately by your IPN passphrase — do this for EVERY
//      parameter (the passphrase appears once per parameter, not once total).
//   5. SHA-512 hash the resulting concatenated string, output as uppercase hex.
// ---------------------------------------------------------------------------
function computeDigistoreSignature(params, passphrase) {
  const keys = Object.keys(params).filter(k => k.toLowerCase() !== 'sha_sign');
  keys.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  let toHash = '';
  for (const key of keys) {
    const value = params[key];
    const isEmpty = value === undefined || value === null || value === '';
    if (isEmpty) continue;
    toHash += `${key}=${value}${passphrase}`;
  }

  return crypto.createHash('sha512').update(toHash, 'utf8').digest('hex').toUpperCase();
}

function signaturesMatch(expectedHex, receivedHex) {
  if (!receivedHex || typeof receivedHex !== 'string') return false;
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(String(receivedHex).toUpperCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.post('/digistore24', express.urlencoded({ extended: true }), async (req, res) => {
  const body = req.body || {};
  try {
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

    const expectedSign = computeDigistoreSignature(body, passphrase);
    if (!signaturesMatch(expectedSign, receivedSign)) {
      logWebhook('digistore24', body, 'rejected_bad_signature');
      return res.status(401).send('Invalid signature.');
    }

    const allowedProducts = (process.env.DIGISTORE24_PRODUCT_IDS || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (allowedProducts.length && !allowedProducts.includes(String(body.product_id))) {
      logWebhook('digistore24', body, 'ignored_wrong_product');
      return res.status(200).send('OK');
    }

    const event = body.event;

    switch (event) {
      case 'connection_test':
        logWebhook('digistore24', body, 'ok_connection_test');
        return res.status(200).send('OK');

      // A successful payment — first purchase OR a rebill/renewal (Digistore24
      // sends this same event for both; there is no separate "rebill" event).
      case 'on_payment': {
        await grantOrRenewPlan({
          name: [body.address_first_name, body.address_last_name].filter(Boolean).join(' '),
          email: body.email,
          phone: body.address_phone_no,
          address: [body.address_street, body.address_city, body.address_state, body.address_zipcode, body.address_country_name || body.address_country]
            .filter(Boolean).join(', '),
          source: 'digistore24',
        });
        logWebhook('digistore24', body, 'ok_granted');
        return res.status(200).send('OK');
      }

      // Money was taken back — revoke the credits/plan we granted for this purchase.
      case 'on_refund':
      case 'on_chargeback':
      case 'last_paid_day': {
        if (body.email) {
          await revokePlan({ email: body.email, reason: event });
        }
        logWebhook('digistore24', body, `ok_revoked_${event}`);
        return res.status(200).send('OK');
      }

      default:
        logWebhook('digistore24', body, `ignored_event_${event}`);
        return res.status(200).send('OK'); // acknowledge, but do nothing
    }
  } catch (err) {
    console.error('Digistore24 webhook error:', err);
    logWebhook('digistore24', body, 'error_' + err.message);
    res.status(500).send('Error');
  }
});

module.exports = router;
