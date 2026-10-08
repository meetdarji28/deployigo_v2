// Admin login never redirects into customer /app/ and never uses frontend/auth.js.
'use strict';
const config = window.DIG_PORTAL || { customerPort: 4300 };
document.querySelector('#customer-portal').href = `${location.protocol}//${location.hostname}:${config.customerPort}/login.html`;
(async () => {
  try {
    const response = await fetch('/api/admin/summary', { cache: 'no-store' });
    if (response.ok) location.replace('/admin/');
  } catch { /* Show the form if API unavailable. */ }
})();
document.querySelector('#admin-login').addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('#submit');
  const message = document.querySelector('#message');
  button.disabled = true; message.textContent = '';
  try {
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
    const data = await response.json();
    if (!response.ok || !data.user?.isAdmin) { message.textContent = data.error || 'Admin access denied.'; return; }
    location.replace('/admin/');
  } catch { message.textContent = 'Cannot reach admin API. Verify the service is running.'; }
  finally { button.disabled = false; }
});
