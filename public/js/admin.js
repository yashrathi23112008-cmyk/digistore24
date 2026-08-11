// public/js/admin.js

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

async function guardAdmin() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) { window.location.href = '/login.html'; return false; }
  const data = await res.json();
  if (!data.user.isAdmin) { window.location.href = '/index.html'; return false; }
  return true;
}

async function loadUsers() {
  const res = await fetch('/api/admin/users');
  if (!res.ok) return;
  const { users } = await res.json();
  const tbody = document.getElementById('users-tbody');

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">No users yet.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.address) || '<span class="muted">—</span>'}</td>
      <td>${escapeHtml(u.phone) || '<span class="muted">—</span>'}</td>
      <td>${u.credits}</td>
      <td>${u.expiry_date ? new Date(u.expiry_date).toLocaleDateString() : '<span class="muted">—</span>'}</td>
    </tr>
  `).join('');
}

async function loadStats() {
  const res = await fetch('/api/admin/stats');
  if (!res.ok) return;
  const stats = await res.json();
  document.getElementById('stat-users').textContent = stats.totalUsers;
  document.getElementById('stat-credits').textContent = stats.totalCreditsRemaining;
  document.getElementById('stat-generations').textContent = stats.totalGenerations;
}

async function refreshAll() {
  await Promise.all([loadUsers(), loadStats()]);
}

document.getElementById('back-btn').addEventListener('click', () => { window.location.href = '/index.html'; });
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

(async () => {
  const ok = await guardAdmin();
  if (!ok) return;
  await refreshAll();
  setInterval(refreshAll, 15000); // auto-update every 15 seconds
})();
