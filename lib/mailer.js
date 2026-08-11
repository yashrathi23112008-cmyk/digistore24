// lib/mailer.js
// This is a STUB. It does not actually send email yet — it just logs the link/message
// to the server console so you can test the flow end to end.
//
// Before going live, replace the body of sendEmail() with a real provider call, e.g.:
//
//   Resend (https://resend.com):
//     const { Resend } = require('resend');
//     const resend = new Resend(process.env.RESEND_API_KEY);
//     await resend.emails.send({ from: 'you@yourdomain.com', to, subject, text });
//
//   SendGrid (https://sendgrid.com):
//     const sgMail = require('@sendgrid/mail');
//     sgMail.setApiKey(process.env.SENDGRID_API_KEY);
//     await sgMail.send({ to, from: 'you@yourdomain.com', subject, text });
//
// Add the chosen provider's API key to your .env file (never hard-code it here).

async function sendEmail(to, subject, text) {
  console.log('\n===== EMAIL (stub - not actually sent) =====');
  console.log('To:', to);
  console.log('Subject:', subject);
  console.log('Body:\n' + text);
  console.log('==============================================\n');
  return true;
}

module.exports = { sendEmail };
