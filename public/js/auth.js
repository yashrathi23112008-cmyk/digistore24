// public/js/auth.js
const loginPanel = document.getElementById('login-panel');
const forgotPanel = document.getElementById('forgot-panel');
const resetPanel = document.getElementById('reset-panel');

function showPanel(panel) {
  [loginPanel, forgotPanel, resetPanel].forEach(p => p.style.display = 'none');
  panel.style.display = 'block';
}

// If arriving from a password-reset email link (?reset=TOKEN), show the reset form.
const urlParams = new URLSearchParams(window.location.search);
const resetToken = urlParams.get('reset');
if (resetToken) showPanel(resetPanel);

document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    window.location.href = '/index.html';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('forgot-link').addEventListener('click', (e) => {
  e.preventDefault();
  showPanel(forgotPanel);
});
document.getElementById('back-to-login').addEventListener('click', (e) => {
  e.preventDefault();
  showPanel(loginPanel);
});

document.getElementById('forgot-btn').addEventListener('click', async () => {
  const email = document.getElementById('forgot-email').value.trim();
  const msg = document.getElementById('forgot-msg');
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    msg.style.display = 'block';
    msg.textContent = data.message || 'If that email exists, a reset link has been sent.';
  } catch (err) {
    msg.style.display = 'block';
    msg.textContent = 'Something went wrong. Please try again.';
  }
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  const newPassword = document.getElementById('new-password').value;
  const msg = document.getElementById('reset-msg');
  msg.style.display = 'none';
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not reset password.');
    msg.style.color = 'var(--success)';
    msg.style.display = 'block';
    msg.textContent = 'Password updated! Redirecting to login…';
    setTimeout(() => { window.location.href = '/login.html'; }, 1500);
  } catch (err) {
    msg.style.color = 'var(--danger)';
    msg.style.display = 'block';
    msg.textContent = err.message;
  }
});
