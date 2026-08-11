// db.js
// Uses Node's built-in "node:sqlite" module (available in Node 22.5+), so there is
// NO native module to compile and NO separate database server to install or pay for.
// The whole database lives in one file: data/app.db

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    credits INTEGER NOT NULL DEFAULT 0,
    expiry_date TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    reset_token TEXT,
    reset_token_expiry TEXT,
    last_purchase_source TEXT,
    last_purchase_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tone TEXT,
    duration TEXT,
    language TEXT,
    video_type TEXT,
    image_prompts INTEGER NOT NULL DEFAULT 0,
    cost INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS webhook_log (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    payload TEXT,
    status TEXT,
    created_at TEXT NOT NULL
  );
`);

function uuid() {
  return crypto.randomUUID();
}

function nowISO() {
  return new Date().toISOString();
}

// --- bootstrap the admin account from .env, if it doesn't exist yet ---
function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id);
    return;
  }

  const hash = bcrypt.hashSync(password, 12);
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, credits, expiry_date, is_admin, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, NULL, 1, ?, ?)
  `).run(uuid(), process.env.ADMIN_NAME || 'Admin', email, hash, nowISO(), nowISO());

  console.log(`[db] Admin account created for ${email}`);
}

ensureAdmin();

module.exports = { db, uuid, nowISO };
