// server.js
require('dotenv').config();

const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const cookieParser = require('cookie-parser');

// --- Trim env vars: platforms like Railway sometimes carry a trailing newline
// or space when a value is pasted in, which silently breaks a strict === check. ---
function cleanEnv(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : v;
}

// --- Startup diagnostics: prints WHICH required variables are visible to this
// process, without ever printing their actual values, so you can immediately
// tell a missing/misnamed variable apart from a code bug in the deploy logs. ---
function logEnvStatus() {
  const required = ['JWT_SECRET', 'OPENROUTER_API_KEY'];
  const optional = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'DIGISTORE24_IPN_PASSPHRASE', 'APP_URL'];
  console.log('--- Environment check ---');
  [...required, ...optional].forEach((name) => {
    const val = cleanEnv(name);
    const label = required.includes(name) ? 'required' : 'optional';
    console.log(`  ${name} (${label}): ${val ? `set (${val.length} chars)` : 'NOT SET'}`);
  });
  console.log('-------------------------');
}
logEnvStatus();

// JWT_SECRET signs every login session. If it's genuinely missing, we do NOT
// crash the container (Railway will just restart it forever into the same
// error). Instead we generate a temporary one for this run so the app comes
// up and you can see the rest of the logs / reach the site, and we print a
// loud, repeated warning so it's impossible to miss.
let jwtSecret = cleanEnv('JWT_SECRET');
if (!jwtSecret) {
  jwtSecret = crypto.randomBytes(48).toString('hex');
  process.env.JWT_SECRET = jwtSecret;
  console.warn('\n=================== WARNING ===================');
  console.warn('JWT_SECRET was not found in this environment.');
  console.warn('A TEMPORARY secret was generated so the app can start,');
  console.warn('but every login session will be logged out on the next restart/deploy.');
  console.warn('');
  console.warn('To fix this permanently on Railway:');
  console.warn('  1. Open your service -> Variables tab (not "Shared Variables" unless referenced).');
  console.warn('  2. Add JWT_SECRET with a long random value (no quotes, no trailing space).');
  console.warn('     Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  console.warn('  3. Make sure it is added to the SAME environment this service deploys to.');
  console.warn('  4. Click "Deploy" again — adding a variable does not always trigger a redeploy by itself.');
  console.warn('=================================================\n');
} else {
  process.env.JWT_SECRET = jwtSecret; // store the trimmed value back
}

const { attachUser } = require('./lib/auth');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const generateRoutes = require('./routes/generate');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');

const app = express();
app.disable('x-powered-by');

// --- Webhooks MUST be mounted before express.json() runs on their paths,
// because Digistore24's IPN signature verification needs the original form body. ---
app.use('/webhook', webhookRoutes);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser);

// --- API routes ---
app.get('/healthz', (req, res) => res.status(200).send('ok'));
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/admin', adminRoutes);

// --- Static frontend ---
app.use(express.static(path.join(__dirname, 'public')));

// Fallback 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Script Generator running at http://localhost:${PORT}`);
});
