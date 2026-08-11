// lib/auth.js
const jwt = require('jsonwebtoken');
const { db } = require('../db');

const COOKIE_NAME = 'session';

function signToken(user) {
  return jwt.sign(
    { uid: user.id, isAdmin: !!user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function setSessionCookie(res, user) {
  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,               // JavaScript in the browser can NOT read this cookie
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Attaches req.user if a valid session cookie is present. Does not block the request.
function attachUser(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (user) req.user = user;
  } catch (err) {
    // invalid/expired token -> treat as logged out
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admins only.' });
  }
  next();
}

// Never send the password hash or reset token to the browser.
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    address: u.address,
    avatarUrl: u.avatar_url,
    credits: u.credits,
    expiryDate: u.expiry_date,
    isAdmin: !!u.is_admin,
  };
}

module.exports = {
  COOKIE_NAME,
  signToken,
  setSessionCookie,
  clearSessionCookie,
  attachUser,
  requireAuth,
  requireAdmin,
  publicUser,
};
