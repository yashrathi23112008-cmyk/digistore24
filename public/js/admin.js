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

function statusColor(status) {
  if (status.startsWith('ok')) return 'var(--success)';
  if (status.startsWith('rejected') || status.startsWith('error')) return 'var(--danger)';
  return 'var(--text-dim)';
}

async function loadWebhooks() {
  const res = await fetch('/api/admin/webhooks');
  if (!res.ok) return;
  const { webhooks } = await res.json();
  const tbody = document.getElementById('webhooks-tbody');

  if (!webhooks.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">No webhook calls received yet.</td></tr>';
    return;
  }

  tbody.innerHTML = webhooks.map((w, i) => `
    <tr style="cursor:pointer;" onclick="document.getElementById('wh-payload-${i}').style.display = document.getElementById('wh-payload-${i}').style.display === 'none' ? 'block' : 'none';">
      <td>${new Date(w.created_at).toLocaleString()}</td>
      <td>${escapeHtml(w.source)}</td>
      <td style="color:${statusColor(w.status)}; font-weight:600;">${escapeHtml(w.status)}</td>
      <td>
        <span class="muted" style="font-size:12px;">click to toggle</span>
        <div id="wh-payload-${i}" style="display:none; margin-top:8px; font-size:12px; white-space:pre-wrap; word-break:break-all; color:var(--text-dim); max-width:500px;">${escapeHtml(w.payload)}</div>
      </td>
    </tr>
  `).join('');
}

async function refreshAll() {
  await Promise.all([loadUsers(), loadStats(), loadWebhooks()]);
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
