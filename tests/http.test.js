'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');

async function availablePort() { return new Promise(resolve => { const sock = net.createServer(); sock.listen(0, '127.0.0.1', () => { const { port } = sock.address(); sock.close(() => resolve(port)); }); }); }
async function environment() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dig-server-'));
  for (const part of ['backend', 'frontend', 'admin']) fs.cpSync(path.join(__dirname, '..', part), path.join(dir, part), { recursive: true });
  const customerPort = await availablePort();
  const adminPort = await availablePort();
  const apiPort = await availablePort();
  const env = { ...process.env, CUSTOMER_PORT: String(customerPort), ADMIN_PORT: String(adminPort), API_PORT: String(apiPort), DEPLOY_TARGET: 'local-preview', API_BIND: '127.0.0.1', PORTAL_BIND: '127.0.0.1' };
  const procs = [
    spawn(process.execPath, [path.join(dir, 'backend/api/server.js')], { env, stdio: 'ignore' }),
    spawn(process.execPath, [path.join(dir, 'backend/portals/server.js'), 'customer'], { env, stdio: 'ignore' }),
    spawn(process.execPath, [path.join(dir, 'backend/portals/server.js'), 'admin'], { env, stdio: 'ignore' }),
  ];
  const origin = `http://127.0.0.1:${customerPort}`;
  const adminOrigin = `http://127.0.0.1:${adminPort}`;
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  for (let n = 0; n < 100; n++) {
    if (procs.some(proc => proc.exitCode !== null)) throw new Error('Test service exited unexpectedly');
    try {
      const checks = await Promise.all([fetch(origin + '/'), fetch(adminOrigin + '/login'), fetch(apiOrigin + '/api/health')]);
      if (checks.every(x => x.ok)) break;
    } catch { /* service startup */ }
    await new Promise(r => setTimeout(r, 35));
  }
  async function call(route, method = 'GET', body, cookie) {
    const base = route.startsWith('/api/admin/') ? adminOrigin : origin;
    const res = await fetch(base + route, { method, headers: { ...(cookie ? { cookie } : {}), ...(typeof body === 'object' && body !== null && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  async function shutdown() { for (const proc of procs) proc.kill('SIGTERM'); await new Promise(r => setTimeout(r, 100)); fs.rmSync(dir, { recursive: true, force: true }); }
  return { dir, origin, adminOrigin, apiOrigin, call, shutdown };
}
test('user, admin, blank HTML/PHP, env, inspection and ZIP flow on local mode', { timeout: 20000 }, async () => {
  const { dir, origin, adminOrigin, apiOrigin, call, shutdown } = await environment();
  try {
    const a = await call('/api/auth/signup', 'POST', { email: 'admin@test.local', name: 'Admin', password: 'longpassword1' });
    assert.equal(a.status, 201);
    assert.equal(a.data.user.passwordHash, undefined);
    const c = a.cookie;
    const adminSession = await call('/api/admin/login', 'POST', { email: 'admin@test.local', password: 'longpassword1' });
    assert.equal(adminSession.status, 200);
    const ac = adminSession.cookie;
    assert.match(ac, /deployigo_admin_session=/);
    // Admin page must not send admin users back to the customer workspace.
    const noSession = await fetch(adminOrigin + '/admin/', { redirect: 'manual' });
    assert.equal(noSession.status, 302);
    assert.equal(noSession.headers.get('location'), '/login');
    const adminPage = await fetch(adminOrigin + '/admin/', { headers: { cookie: ac }, redirect: 'manual' });
    assert.equal(adminPage.status, 200);
    assert.match(await adminPage.text(), /Platform operations/);
    const directAdminPage = await fetch(adminOrigin + '/admin/index.html', { headers: { cookie: ac }, redirect: 'manual' });
    assert.equal(directAdminPage.status, 308);
    assert.equal(directAdminPage.headers.get('location'), '/admin/');
    const adminAlias = await fetch(adminOrigin + '/admin', { redirect: 'manual' });
    assert.equal(adminAlias.status, 308);
    assert.equal(adminAlias.headers.get('location'), '/admin/');
    const h = await call('/api/projects/blank', 'POST', { name: 'htmlsite', technology: 'html', initialHtml: '<!doctype html><h1>My custom HTML</h1>' }, c);
    assert.equal(h.status, 201);
    assert.equal(h.data.project.entryPoint, 'index.html');
    const htmlPath = path.join(dir, 'data/projects', h.data.project.id);
    assert.equal(fs.existsSync(path.join(htmlPath, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(htmlPath, 'index.php')), false);
    const preview = await fetch(origin + '/local/htmlsite/');
    assert.equal(preview.status, 200); assert.match(await preview.text(), /My custom HTML/);
    const php = await call('/api/projects/blank', 'POST', { name: 'phpapp', technology: 'php', phpVersion: '8.2' }, c);
    assert.equal(php.status, 201); assert.equal(php.data.project.phpVersion, '8.2');
    assert.equal(php.data.project.entryPoint, 'index.php');
    const phpPreview = await fetch(origin + '/local/phpapp/'); assert.equal(phpPreview.status, 409);
    assert.match(await phpPreview.text(), /PHP execution is disabled/);
    const version = await call(`/api/projects/${php.data.project.id}/inspect`, 'GET', undefined, c);
    assert.equal(version.status, 200); assert.equal(version.data.phpVersion, '8.2');
    assert.equal(version.data.runtimeVerification.includes('Not executed'), true);
    const env = await call(`/api/projects/${php.data.project.id}/env`, 'POST', { envVars: { API_KEY: 'hidden\'foo' } }, c);
    assert.equal(env.status, 200);
    const ownerEnv = await call(`/api/projects/${php.data.project.id}/env`, 'GET', undefined, c);
    assert.equal(ownerEnv.data.envVars.API_KEY, "hidden'foo");
    const me = await call('/api/me', 'GET', undefined, c);
    assert.equal(me.data.user.isAdmin, true);
    assert.equal(me.data.projects.find(p => p.id === php.data.project.id).envVars.API_KEY, '********');
    const forbiddenPreview = await fetch(origin + '/local/phpapp/.env');
    assert.equal(forbiddenPreview.status, 404);
    const db = await call(`/api/projects/${php.data.project.id}/database`, 'POST', { type: 'mysql' }, c);
    assert.equal(db.status, 409);
    const terminal = await call(`/api/projects/${php.data.project.id}/terminal/exec`, 'POST', { command: 'ls' }, c);
    assert.equal(terminal.status, 409);
    const admin = await call('/api/admin/summary', 'GET', undefined, ac);
    assert.equal(admin.status, 200); assert.equal(admin.data.stats.projects, 2);
    const worker = await call('/api/admin/workers', 'POST', { host: '192.168.1.199', user: 'devops' }, ac);
    assert.equal(worker.status, 201);
    const removed = await call(`/api/admin/workers/${worker.data.worker.id}`, 'DELETE', undefined, ac);
    assert.equal(removed.status, 200);
    const b = await call('/api/auth/signup', 'POST', { email: 'user@test.local', password: 'longpassword2' });
    const forbiddenPage = await fetch(adminOrigin + '/admin/', { headers: { cookie: b.cookie }, redirect: 'manual' });
    assert.equal(forbiddenPage.status, 302);
    assert.equal(forbiddenPage.headers.get('location'), '/login');
    const forbiddenAlias = await fetch(adminOrigin + '/admin/index.html', { headers: { cookie: b.cookie }, redirect: 'manual' });
    assert.equal(forbiddenAlias.status, 308);
    const regularMe = await call('/api/me', 'GET', undefined, b.cookie);
    assert.equal(regularMe.data.user.isAdmin, false);
    assert.equal((await call('/api/admin/summary', 'GET', undefined, b.cookie)).status, 401);
    assert.equal((await call(`/api/projects/${php.data.project.id}/inspect`, 'GET', undefined, b.cookie)).status, 404);
    assert.equal((await call('/api/oauth/github/authorize', 'GET', undefined, c)).status, 503); // Configure GitHub credentials manually first
    assert.equal((await call('/api/projects', 'POST', { name: 'privateone', sourceType: 'private', repoUrl: 'https://github.com/a/b', repoToken: 'abc' }, c)).status, 501);
    const folder = path.join(dir, 'incoming'); fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'index.html'), '<h1>ZIP site verified</h1>');
    execFileSync('zip', ['-q', '-j', path.join(dir, 'site.zip'), path.join(folder, 'index.html')]);
    const form = new FormData(); form.append('name', 'zipsite'); form.append('sourceType', 'zip'); form.append('technology', 'html'); form.append('source', new Blob([fs.readFileSync(path.join(dir, 'site.zip'))], { type: 'application/zip' }), 'site.zip');
    const upload = await call('/api/projects', 'POST', form, c);
    assert.equal(upload.status, 201);
    for (let n = 0; n < 40; n++) { const r = await call('/api/me', 'GET', undefined, c); if (r.data.projects.find(p => p.id === upload.data.project.id)?.sourceStatus === 'ready') break; await new Promise(r => setTimeout(r, 35)); }
    const z = await fetch(origin + '/local/zipsite/');
    assert.equal(z.status, 200); assert.match(await z.text(), /ZIP site verified/);
  } finally { await shutdown(); }
});

test('GitHub webhook secrets are authenticated, signed, scoped, and not leaked through project listing', { timeout: 15000 }, async () => {
  const { dir, origin, adminOrigin, apiOrigin, call, shutdown } = await environment();
  try {
    const admin = await call('/api/auth/signup', 'POST', { email: 'owner@test.local', password: 'longpassword5' });
    const projectId = 'prj_eeeeeeeeeeeeeeee';
    const dbFile = path.join(dir, 'data/db.json');
    const data = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    data.projects.push({ id: projectId, ownerId: admin.data.user.id, owner: 'owner@test.local', name: 'webhook-test',
      sourceType: 'github-public', sourceStatus: 'ready', technology: 'HTML', repoUrl: 'https://github.com/example/repo.git', repoBranch: 'main', autoBuild: false, deployTarget: 'local-preview' });
    fs.writeFileSync(dbFile, JSON.stringify(data));
    const configured = await call(`/api/projects/${projectId}/webhook/configure`, 'POST', {}, admin.cookie);
    assert.equal(configured.status, 200);
    assert.equal(configured.data.secret.length, 64);
    assert.equal(configured.data.path, `/api/webhooks/github/${projectId}`);
    const listing = await call('/api/me', 'GET', undefined, admin.cookie);
    const visible = listing.data.projects.find(p => p.id === projectId);
    assert.equal(visible.webhookSecret, undefined);
    assert.equal(visible.webhookConfigured, true);
    const crypto = require('node:crypto');
    const payload = JSON.stringify({ ref: 'refs/heads/other', repository: { clone_url: 'https://github.com/example/repo.git' } });
    const fail = await fetch(origin + configured.data.path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'push', 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64), 'X-GitHub-Delivery': crypto.randomUUID() }, body: payload });
    assert.equal(fail.status, 401);
    const sig = 'sha256=' + crypto.createHmac('sha256', configured.data.secret).update(payload).digest('hex');
    const okay = await fetch(origin + configured.data.path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'push', 'X-Hub-Signature-256': sig, 'X-GitHub-Delivery': crypto.randomUUID() }, body: payload });
    assert.equal(okay.status, 200);
    assert.match((await okay.json()).ignored, /different branch/);
  } finally { await shutdown(); }
});

test('admin and customer have separate URLs, login UI, role checks and independent API service', { timeout: 15000 }, async () => {
  const { origin, adminOrigin, apiOrigin, call, shutdown } = await environment();
  try {
    const loginPage = await fetch(adminOrigin + '/login');
    assert.equal(loginPage.status, 200);
    assert.match(await loginPage.text(), /Admin sign in/);
    const authScript = await fetch(adminOrigin + '/admin/admin-auth.js');
    assert.ok((await authScript.text()).includes("location.replace('/admin/')"));
    assert.equal((await fetch(origin + '/admin/')).status, 404);
    assert.equal((await fetch(adminOrigin + '/app/')).status, 404);
    assert.equal((await fetch(apiOrigin + '/admin/')).status, 404);
    assert.equal((await fetch(apiOrigin + '/api/health')).status, 200);
    const user = await call('/api/auth/signup', 'POST', { email: 'admin@testing.dev', password: 'longpassword10' });
    assert.equal(user.status, 201);
    const customerLoginHtml = await (await fetch(origin + '/login.html')).text();
    assert.match(customerLoginHtml, /Log in to your workspace/);
    assert.doesNotMatch(customerLoginHtml, /Admin sign in/);
    const adminLogin = await call('/api/admin/login', 'POST', { email: 'admin@testing.dev', password: 'longpassword10' });
    assert.equal(adminLogin.status, 200);
    assert.equal(adminLogin.data.user.isAdmin, true);
    assert.match(adminLogin.cookie, /deployigo_admin_session=/);
    assert.equal((await fetch(adminOrigin + '/admin/', { headers: { cookie: user.cookie }, redirect: 'manual' })).status, 302);
    assert.equal((await fetch(adminOrigin + '/admin/', { headers: { cookie: adminLogin.cookie }, redirect: 'manual' })).status, 200);
    // Role cookies and session lifetimes are independent: logging out of admin leaves customer signed in.
    const loggedOutAdmin = await call('/api/admin/logout', 'POST', {}, adminLogin.cookie);
    assert.equal(loggedOutAdmin.status, 200);
    assert.match(loggedOutAdmin.cookie, /deployigo_admin_session=/);
    assert.equal((await call('/api/me', 'GET', undefined, user.cookie)).status, 200);
    assert.equal((await fetch(adminOrigin + '/admin/', { headers: { cookie: adminLogin.cookie }, redirect: 'manual' })).status, 302);
    const second = await call('/api/auth/signup', 'POST', { email: 'normal@testing.dev', password: 'longpassword11' });
    const denied = await call('/api/admin/login', 'POST', { email: 'normal@testing.dev', password: 'longpassword11' });
    assert.equal(denied.status, 403);
    assert.equal(denied.cookie, undefined);
    const deniedPage = await fetch(adminOrigin + '/admin/', { headers: { cookie: second.cookie }, redirect: 'manual' });
    assert.equal(deniedPage.status, 302);
    const adminApiFromUserPortal = await fetch(origin + '/api/admin/summary', { headers: { cookie: user.cookie } });
    assert.equal(adminApiFromUserPortal.status, 404);
    const custApiFromAdminPortal = await fetch(adminOrigin + '/api/me', { headers: { cookie: user.cookie } });
    assert.equal(custApiFromAdminPortal.status, 404);
  } finally { await shutdown(); }
});

test('pending deployment hides URL, blocks commands and protects managed DB credentials', { timeout: 15000 }, async () => {
  const { dir, origin, call, shutdown } = await environment();
  try {
    const a = await call('/api/auth/signup', 'POST', { email: 'owner@unit.local', password: 'verylongpassword1' });
    const p = { id: 'prj_aaaaaaaaaaaaaaaa', ownerId: a.data.user.id, owner: 'owner@unit.local', name: 'running-later',
      technology: 'PHP', sourceType: 'blank-php', sourceStatus: 'deploying', deploymentReady: false,
      deployTarget: 'remote-docker', deploymentMode: 'remote-docker', remoteHost: '192.0.2.222', remoteUser: 'root',
      remotePort: 18080, url: 'http://192.0.2.222:18080/', database: {type:'mysql',version:'8',dbName:'sample_db',dbUser:'sample_user',dbPassword:'example-secret-123',host:'deployigo-db-prj_aaaaaaaaaaaaaaaa',dbPort:3306,isExternal:false},
      envVars: {DB_HOST:'deployigo-db-prj_aaaaaaaaaaaaaaaa', DB_PASSWORD: 'example-secret-123'} };
    const pathDb = path.join(dir, 'data/db.json'); const current = JSON.parse(fs.readFileSync(pathDb, 'utf8'));
    current.projects.push(p);fs.writeFileSync(pathDb, JSON.stringify(current));
    const me = await call('/api/me','GET',undefined,a.cookie);
    const item=me.data.projects.find(x=>x.id===p.id);
    assert.equal(item.url,null);assert.equal(item.deploymentReady,false);
    assert.equal(item.database.dbPassword,undefined);assert.equal(item.envVars.DB_PASSWORD,'********');
    const command = await call(`/api/projects/${p.id}/terminal/exec`,'POST',{command:'ls'},a.cookie);
    assert.equal(command.status,409);assert.match(command.data.error,/not ready/i);
    const details=await call(`/api/projects/${p.id}/database/details`,'GET',undefined,a.cookie);
    assert.equal(details.status,200);assert.equal(details.data.database.dbPassword,'example-secret-123');
    assert.match(details.data.database.remoteAccess,/NOT enabled/);
    assert.equal((await call(`/api/projects/${p.id}/database/tables`,'GET',undefined,a.cookie)).status,409);
    const b=await call('/api/auth/signup','POST',{email:'another@unit.local',password:'verylongpassword1'});
    assert.equal((await call(`/api/projects/${p.id}/database/details`,'GET',undefined,b.cookie)).status,404);
  }finally{await shutdown();}
});

test('admin account suspension requires admin and invalidates customer sessions', { timeout: 15000 }, async () => {
  const { call, shutdown } = await environment();
  try {
    await call('/api/auth/signup','POST',{email:'admin@unit.local',password:'verylongpassword1'});
    const admin=await call('/api/admin/login','POST',{email:'admin@unit.local',password:'verylongpassword1'});
    const user=await call('/api/auth/signup','POST',{email:'user@unit.local',password:'verylongpassword2'});
    assert.equal((await call('/api/admin/users','GET',undefined,user.cookie)).status,401);
    const listing=await call('/api/admin/users','GET',undefined,admin.cookie);
    assert.equal(listing.status,200);
    const row=listing.data.users.find(x=>x.email==='user@unit.local');
    assert.equal(row.passwordHash,undefined);
    assert.equal((await call(`/api/admin/users/${row.id}`,'PATCH',{suspended:true},admin.cookie)).status,200);
    assert.equal((await call('/api/me','GET',undefined,user.cookie)).status,401);
    assert.equal((await call('/api/auth/login','POST',{email:'user@unit.local',password:'verylongpassword2'})).status,401);
    assert.equal((await call(`/api/admin/users/${row.id}`,'PATCH',{suspended:false},admin.cookie)).status,200);
    assert.equal((await call('/api/auth/login','POST',{email:'user@unit.local',password:'verylongpassword2'})).status,200);
  }finally{await shutdown();}
});
