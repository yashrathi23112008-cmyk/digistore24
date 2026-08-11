// lib/mailer.js
//
// Sends real email via Resend (https://resend.com) whenever RESEND_API_KEY and
// MAIL_FROM are set. This is what actually delivers the "here's your password"
// email to a customer after a successful Digistore24 purchase (see
// lib/billing.js -> grantOrRenewPlan(), which calls sendEmail() with the
// temporary password in the message body).
//
// If RESEND_API_KEY or MAIL_FROM is missing (e.g. you're developing locally
// and haven't set them), it falls back to printing the email to the console
// instead of crashing — so `npm start` still works without any email
// provider configured.
//
// ---------------------------------------------------------------------------
// ONE-TIME SETUP (takes about 5 minutes):
//   1. Create a free account at https://resend.com
//   2. Settings -> Domains -> Add Domain. Add the DNS records Resend gives you
//      to your domain's DNS (at your domain registrar / Railway custom domain
//      setup). This can take a few minutes to a few hours to verify.
//      (For quick testing before your domain verifies, Resend lets you send
//      from "onboarding@resend.dev" to ONLY your own Resend account email —
//      fine for testing the flow, not for real customers.)
//   3. Settings -> API Keys -> Create API Key. Copy it (starts with "re_").
//   4. On Railway, add these two variables:
//        RESEND_API_KEY = re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//        MAIL_FROM      = orders@yourverifieddomain.com
//      (MAIL_FROM must be an address at the domain you verified in step 2.)
//   5. Redeploy. That's it — grantOrRenewPlan() and the password-reset flow
//      will now send real emails automatically, no other code changes needed.
// ---------------------------------------------------------------------------

const { Resend } = require('resend');

async function sendEmailStub(to, subject, text) {
  console.log('\n===== EMAIL (stub - RESEND_API_KEY / MAIL_FROM not set) =====');
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log('Body:\n' + text);
  console.log('===============================================================\n');
  return true;
}

async function sendEmail(to, subject, text) {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.MAIL_FROM || '').trim();

  if (!apiKey || !from) {
    return sendEmailStub(to, subject, text);
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to, subject, text });

    if (error) {
      throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
    }

    console.log(`[mailer] Email sent to ${to} (id: ${data && data.id})`);
    return true;
  } catch (err) {
    // Never let an email failure break account creation / password resets —
    // log it clearly (so you can see it in Railway logs and fix the Resend
    // setup) and fall back to printing the email so the info isn't lost.
    console.error(`[mailer] Resend send to ${to} failed:`, err.message);
    await sendEmailStub(to, subject, text);
    return false;
  }
}

module.exports = { sendEmail };
