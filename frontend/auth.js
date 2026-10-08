// Preserve an explicitly requested admin destination through the login page.
// Only allow known local paths to avoid open redirects.
const requestedPath = new URLSearchParams(location.search).get('next');
const destination = requestedPath === '/admin/' ? '/admin/' : '/app/';

async function checkSession() {
  const res = await fetch('/api/me');
  if (res.ok) location.replace(destination);
}
checkSession();

async function submitForm(event, path) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#message');
  const data = Object.fromEntries(new FormData(form));
  const response = await fetch('/api/auth/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) { message.textContent = result.error; return; }
  location.replace(destination);
}
document.querySelector('#login')?.addEventListener('submit', event => submitForm(event, 'login'));
document.querySelector('#signup')?.addEventListener('submit', event => submitForm(event, 'signup'));
