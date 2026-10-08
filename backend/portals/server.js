/** Standalone customer/admin website, reverse-proxying /api and /local to the isolated API process. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
for (const line of (fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n')) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}
const portal = process.argv[2];
if (!['customer', 'admin'].includes(portal)) throw new Error('Expected customer or admin');
const customerPort = Number(process.env.CUSTOMER_PORT || process.env.PORT || 4300);
const adminPort = Number(process.env.ADMIN_PORT || 4301);
const apiPort = Number(process.env.API_PORT || 4302);
const port = portal === 'admin' ? adminPort : customerPort;
const apiHost = process.env.API_BIND && process.env.API_BIND !== '0.0.0.0' ? process.env.API_BIND : '127.0.0.1';
const send = (res, status, body, type = 'text/plain; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(body); };
const redirect = (res, location, status = 302) => { res.writeHead(status, { Location: location, 'Cache-Control': 'no-store' }); res.end(); };
function proxy(req, res) {
  const upstream = http.request({ hostname: apiHost, port: apiPort, path: req.url, method: req.method,
    headers: { ...req.headers, host: req.headers.host || `localhost:${apiPort}` } }, target => {
    const safeHeaders = { ...target.headers };
    delete safeHeaders['connection']; delete safeHeaders['transfer-encoding'];
    res.writeHead(target.statusCode, safeHeaders); target.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) send(res, 502, 'API unavailable. Run npm start (all services), or npm run start:api.'); else res.destroy(); });
  req.pipe(upstream);
}
function authStatus(req) {
  return new Promise(resolve => {
    const request = http.request({ hostname: apiHost, port: apiPort, path: '/api/admin/summary', method: 'GET', headers: { cookie: req.headers.cookie || '' } }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('error', () => resolve(503)); request.end();
  });
}
function file(res, relative) {
  // Only fixed allowlisted frontend assets are ever served (no arbitrary path traversal).
  const actual = path.join(ROOT, relative);
  fs.readFile(actual, (error, bytes) => {
    if (error) return send(res, 404, 'Not found');
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    send(res, 200, bytes, types[path.extname(actual)] || 'application/octet-stream');
  });
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const target = url.pathname;
    if (target === '/portal-config.js') {
      const config = `window.DIG_PORTAL=Object.freeze({customerPort:${customerPort},adminPort:${adminPort}});`;
      return send(res, 200, config, 'text/javascript; charset=utf-8');
    }
    if (target.startsWith('/api/') || (portal === 'customer' && target.startsWith('/local/'))) {
      // Restrict each site's proxy surface. API still enforces role checks on every request.
      if (portal === 'customer' && target.startsWith('/api/admin/')) return send(res, 404, 'Use the admin portal.');
      if (portal === 'admin' && !(target.startsWith('/api/admin/') || target === '/api/admin/logout' || target === '/api/health'))
        return send(res, 404, 'Admin portal API route not available.');
      return proxy(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    if (portal === 'admin') {
      if (target === '/') return redirect(res, '/admin/');
      if (target === '/login' || target === '/login.html') return file(res, 'admin/login.html');
      if (target === '/admin' || target === '/admin/index.html') return redirect(res, '/admin/', 308);
      if (target === '/admin/') {
        const status = await authStatus(req);
        if (status === 401) return redirect(res, '/login');
        if (status === 403) return send(res, 403, '<h1>Admin access required</h1><p>Sign in with an administrator account.</p><a href="/login">Admin login</a>', 'text/html; charset=utf-8');
        if (status !== 200) return send(res, 503, 'Admin API unavailable. Check the API server.');
        return file(res, 'admin/index.html');
      }
      if (target === '/admin/admin.js') return file(res, 'admin/admin.js');
      if (target === '/admin/admin-auth.js') return file(res, 'admin/admin-auth.js');
      if (target === '/admin/styles.css') return file(res, 'admin/styles.css');
      return send(res, 404, 'Admin portal: page not found.');
    }
    if (target === '/') return file(res, 'frontend/index.html');
    if (target === '/login' || target === '/login.html') return file(res, 'frontend/login.html');
    if (target === '/signup.html') return file(res, 'frontend/signup.html');
    if (target === '/app' || target === '/app/index.html') return redirect(res, '/app/');
    if (target === '/app/') return file(res, 'frontend/app.html');
    if (['/frontend/app.js', '/frontend/auth.js', '/frontend/styles.css'].includes(target)) return file(res, target.slice(1));
    return send(res, 404, 'Customer portal: page not found.');
  } catch (error) { console.error(error); return send(res, 500, 'Internal portal error'); }
});
server.listen(port, process.env.PORTAL_BIND || '127.0.0.1', () => console.log(`${portal === 'admin' ? 'DIG Admin' : 'DIG Customer'}: http://localhost:${port}${portal === 'admin' ? '/admin/' : '/app/'}`));
