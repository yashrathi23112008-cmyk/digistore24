// server.js
require('dotenv').config();

const express = require('express');
const path = require('node:path');
const cookieParser = require('cookie-parser');

const { attachUser } = require('./lib/auth');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const generateRoutes = require('./routes/generate');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

// --- Webhooks MUST be mounted before express.json() runs on their paths,
// because Digistore24/Whop verification needs the original form/raw body. ---
app.use('/webhook', webhookRoutes);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser);

// --- API routes ---
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
