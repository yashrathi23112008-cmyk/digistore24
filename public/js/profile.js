// public/js/profile.js

let currentUser = null;

async function loadProfile() {
  const res = await fetch('/api/profile');
  if (!res.ok) { window.location.href = '/login.html'; return; }
  const data = await res.json();
  currentUser = data.user;
  render();
}

function render() {
  document.getElementById('profile-name').textContent = currentUser.name;
  document.getElementById('profile-email').textContent = currentUser.email;
  document.getElementById('profile-credits').textContent = currentUser.credits;
  document.getElementById('profile-expiry').textContent = currentUser.expiryDate
    ? new Date(currentUser.expiryDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'No active plan';

  const avatarImg = document.getElementById('avatar-img');
  avatarImg.src = currentUser.avatarUrl || defaultAvatarDataUri(currentUser.name);
}

function defaultAvatarDataUri(name) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#181b26"/><text x="50%" y="54%" font-size="36" fill="#7c5cff" text-anchor="middle" dominant-baseline="middle" font-family="Inter, sans-serif">${initial}</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

document.getElementById('back-btn').addEventListener('click', () => { window.location.href = '/index.html'; });
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// --- Avatar upload ---
const avatarInput = document.getElementById('avatar-input');
document.getElementById('avatar-edit-btn').addEventListener('click', () => avatarInput.click());
document.getElementById('open-avatar-btn').addEventListener('click', () => avatarInput.click());

avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('avatar', file);

  const msg = document.getElementById('profile-msg');
  try {
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed.');
    currentUser = data.user;
    render();
    msg.innerHTML = '<div class="success-text">Profile image updated.</div>';
  } catch (err) {
    msg.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
});

// --- Change name modal ---
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.getElementById('open-name-btn').addEventListener('click', () => {
  document.getElementById('new-name').value = currentUser.name;
  document.getElementById('name-error').style.display = 'none';
  openModal('name-modal');
});

document.getElementById('save-name-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-name').value.trim();
  const errorEl = document.getElementById('name-error');
  try {
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not update name.');
    currentUser = data.user;
    render();
    closeModal('name-modal');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

// --- Change password modal ---
document.getElementById('open-password-btn').addEventListener('click', () => {
  document.getElementById('current-password').value = '';
  document.getElementById('new-password-2').value = '';
  document.getElementById('password-error').style.display = 'none';
  openModal('password-modal');
});

document.getElementById('save-password-btn').addEventListener('click', async () => {
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password-2').value;
  const errorEl = document.getElementById('password-error');
  try {
    const res = await fetch('/api/profile/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not update password.');
    closeModal('password-modal');
    document.getElementById('profile-msg').innerHTML = '<div class="success-text">Password updated.</div>';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

// --- Forgot password (emails a reset link even while logged in) ---
document.getElementById('forgot-password-btn').addEventListener('click', async () => {
  const msg = document.getElementById('profile-msg');
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser.email }),
    });
    const data = await res.json();
    msg.innerHTML = `<div class="success-text">${data.message}</div>`;
  } catch (err) {
    msg.innerHTML = '<div class="error-text">Something went wrong. Please try again.</div>';
  }
});

loadProfile();
