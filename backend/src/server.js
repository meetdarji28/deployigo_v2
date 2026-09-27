const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const PORT = Number(process.env.PORT || 4300);
const SESSION_TTL = 8 * 60 * 60 * 1000;
const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const execFileAsync = promisify(execFile);
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], projects: [], sessions: {} }, null, 2));

const id = prefix => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const writeDb = db => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };

const DEFAULT_PHP_SETTINGS = {
  memory_limit: '128M',
  max_execution_time: 60,
  upload_max_filesize: '16M',
  post_max_size: '32M',
  display_errors: 'Off',
  date_timezone: 'UTC',
  max_input_vars: 1000,
  session_gc_maxlifetime: 1440
};

const PHP_ALLOWED_OPTIONS = {
  memory_limit: ['64M', '128M', '256M', '512M'],
  upload_max_filesize: ['2M', '8M', '16M', '32M', '64M', '100M'],
  post_max_size: ['4M', '16M', '32M', '64M', '128M'],
  display_errors: ['Off', 'On'],
  date_timezone: ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney']
};

function sanitizePhpSettings(input = {}) {
  const current = { ...DEFAULT_PHP_SETTINGS };
  if (PHP_ALLOWED_OPTIONS.memory_limit.includes(input.memory_limit)) current.memory_limit = input.memory_limit;
  if (PHP_ALLOWED_OPTIONS.upload_max_filesize.includes(input.upload_max_filesize)) current.upload_max_filesize = input.upload_max_filesize;
  if (PHP_ALLOWED_OPTIONS.post_max_size.includes(input.post_max_size)) current.post_max_size = input.post_max_size;
  if (PHP_ALLOWED_OPTIONS.display_errors.includes(input.display_errors)) current.display_errors = input.display_errors;
  if (PHP_ALLOWED_OPTIONS.date_timezone.includes(input.date_timezone)) current.date_timezone = input.date_timezone;
  
  const execTime = Number(input.max_execution_time);
  if (Number.isInteger(execTime) && execTime >= 10 && execTime <= 300) current.max_execution_time = execTime;
  
  const inputVars = Number(input.max_input_vars);
  if (Number.isInteger(inputVars) && inputVars >= 1000 && inputVars <= 5000) current.max_input_vars = inputVars;

  const gcMax = Number(input.session_gc_maxlifetime);
  if (Number.isInteger(gcMax) && gcMax >= 1440 && gcMax <= 86400) current.session_gc_maxlifetime = gcMax;

  return current;
}

function entryPoint(project) { if (!project.deployPath) return null; for (const item of ['index.html', 'index.php', 'public/index.php', 'public/index.html']) if (fs.existsSync(path.join(project.deployPath, item))) return item; return null; }
function readDb() { const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); let changed = false; for (const project of db.projects) { if (project.deploymentMode === 'mock' || (project.url?.startsWith('https://') && project.status === 'staging')) { project.status = 'local'; project.url = `http://localhost:${PORT}/local/${project.name}/`; project.deploymentMode = 'local-preview'; changed = true; } if (project.deployPath && !project.entryPoint) { project.entryPoint = entryPoint(project); project.previewStatus = project.entryPoint ? 'available' : 'no-entry-point'; changed = true; } if (project.enabled === undefined) { project.enabled = true; changed = true; } if (project.maintenance === undefined) { project.maintenance = false; changed = true; } if (!project.deployTarget) { project.deployTarget = process.env.DEPLOY_TARGET || 'local-preview'; changed = true; } if (!project.phpVersion) { project.phpVersion = '8.5'; changed = true; } if (!project.phpSettings) { project.phpSettings = { ...DEFAULT_PHP_SETTINGS }; changed = true; } } if (changed) writeDb(db); return db; }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(item => { const [key, ...value] = item.trim().split('='); return [key, decodeURIComponent(value.join('='))]; })); }
function currentUser(req, db) { const session = db.sessions[cookies(req).deployigo_session]; if (!session || session.expiresAt < Date.now()) return null; return db.users.find(user => user.id === session.userId) || null; }
function readJson(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 2e6) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function readBuffer(req) { return new Promise((resolve, reject) => { const chunks = []; let size = 0; req.on('data', chunk => { size += chunk.length; if (size > 60 * 1024 * 1024) return reject(new Error('Upload exceeds 60 MB.')); chunks.push(chunk); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); }); }
function parseMultipart(buffer, contentType) { const boundary = contentType.match(/boundary=([^;]+)/)?.[1]; if (!boundary) throw new Error('Missing upload boundary.'); const marker = Buffer.from(`--${boundary}`).toString('binary'); const fields = {}; let file = null; for (const part of buffer.toString('binary').split(marker)) { const headerEnd = part.indexOf('\r\n\r\n'); if (headerEnd < 0) continue; const headers = part.slice(0, headerEnd); const value = part.slice(headerEnd + 4).replace(/\r\n--?\r\n?$/, '').replace(/\r\n$/, ''); const match = headers.match(/name="([^"]+)"(?:; filename="([^"]*)")?/); if (!match) continue; if (match[2]) file = { filename: path.basename(match[2]), buffer: Buffer.from(value, 'binary') }; else fields[match[1]] = value; } return { fields, file }; }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`; }
function validPassword(password, stored) { const [salt, hash] = stored.split(':'); return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(password, salt, 64)); }
function sessionCookie(value) { return `deployigo_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`; }
function createSession(db, userId) { for (const key of Object.keys(db.sessions)) if (db.sessions[key].userId === userId) delete db.sessions[key]; const value = id('sess'); db.sessions[value] = { userId, expiresAt: Date.now() + SESSION_TTL }; return value; }
function localProject(project) { project.status = 'remote'; project.enabled = true; project.deploymentMode = 'remote-docker'; project.deployTarget = process.env.DEPLOY_TARGET || 'remote-docker'; project.deployedAt = new Date().toISOString(); project.phpSettings = { ...DEFAULT_PHP_SETTINGS }; return project; }
function updateAsync(projectId, callback) { callback().then(() => {}).catch(error => { const db = readDb(); const project = db.projects.find(item => item.id === projectId); if (project) { project.sourceStatus = 'error'; project.sourceError = error.message; writeDb(db); } }); }

async function deployRemoteProject(project) { if (project.deployTarget !== 'remote-docker' || !project.deployPath) return; const host = project.remoteHost || process.env.DEPLOY_REMOTE_HOST || '192.168.1.167'; const user = project.remoteUser || process.env.DEPLOY_REMOTE_USER || 'root'; const remoteBase = process.env.DEPLOY_REMOTE_BASE || '/opt/deployigo/workspaces'; const port = Number(project.remotePort || 18080 + (parseInt(project.id.slice(-4), 16) % 100)); const remotePath = `${remoteBase}/default/${project.id}`; const container = `deployigo-${project.id}`; const sourceDir = fs.existsSync(project.deployPath) && fs.statSync(project.deployPath).isDirectory() ? project.deployPath : path.dirname(project.deployPath); await new Promise((resolve, reject) => { const tar = spawn('tar', ['--exclude=.deployigo-source.zip', '-C', sourceDir, '-cf', '-', '.']); const ssh = spawn('ssh', ['-o', 'BatchMode=yes', `${user}@${host}`, `rm -rf ${remotePath} && mkdir -p ${remotePath} && tar -xf - -C ${remotePath}`]); let error = ''; ssh.stderr.on('data', chunk => { error += chunk; }); tar.stdout.pipe(ssh.stdin); ssh.on('close', code => code === 0 ? resolve() : reject(new Error(error || `Remote source upload failed (${code}).`))); tar.on('error', reject); }); const version = project.phpVersion || '8.5'; const cfg = sanitizePhpSettings(project.phpSettings);


  const userIniScript = `memory_limit = ${cfg.memory_limit}
max_execution_time = ${cfg.max_execution_time}
upload_max_filesize = ${cfg.upload_max_filesize}
post_max_size = ${cfg.post_max_size}
display_errors = ${cfg.display_errors === 'On' ? 'On' : 'Off'}
max_input_vars = ${cfg.max_input_vars}
session.gc_maxlifetime = ${cfg.session_gc_maxlifetime}
date.timezone = "${cfg.date_timezone}"
`;


  const routerScript = `<?php
$disabled = ${project.enabled === false ? 'true' : 'false'};
$maintenance = ${project.maintenance === true ? 'true' : 'false'};
if ($disabled) {
    http_response_code(503);
    echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Disabled | Deployigo</title><style>body{margin:0;background:#f3f0e8;color:#17211d;font:16px system-ui;padding:12vw}main{max-width:680px;border-top:5px solid #f06e45;padding-top:28px}small{color:#68716a;text-transform:uppercase;letter-spacing:1px}h1{font-size:clamp(34px,6vw,64px);margin:16px 0}p{line-height:1.6;color:#526059}a{color:#d44e2a;font-weight:600}</style></head><body><main><small>Deployigo Project Disabled</small><h1>This project is disabled.</h1><p>This project has been disabled by its owner. Please contact the project administrator or owner for more information.</p></main></body></html>';
    exit;
}
if ($maintenance) {
    http_response_code(503);
    echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maintenance Mode | Deployigo</title><style>body{margin:0;background:#f3f0e8;color:#17211d;font:16px system-ui;padding:12vw}main{max-width:680px;border-top:5px solid #d8f27b;padding-top:28px}small{color:#68716a;text-transform:uppercase;letter-spacing:1px}h1{font-size:clamp(34px,6vw,64px);margin:16px 0}p{line-height:1.6;color:#526059}a{color:#d44e2a;font-weight:600}</style></head><body><main><small>Deployigo Maintenance</small><h1>Maintenance in progress.</h1><p>This site is currently undergoing scheduled maintenance. Please check back shortly.</p></main></body></html>';
    exit;
}
@ini_set('memory_limit', '${cfg.memory_limit}');
@ini_set('max_execution_time', '${cfg.max_execution_time}');
@ini_set('upload_max_filesize', '${cfg.upload_max_filesize}');
@ini_set('post_max_size', '${cfg.post_max_size}');
@ini_set('display_errors', '${cfg.display_errors === 'On' ? '1' : '0'}');
@ini_set('max_input_vars', '${cfg.max_input_vars}');
@ini_set('session.gc_maxlifetime', '${cfg.session_gc_maxlifetime}');
@date_default_timezone_set('${cfg.date_timezone}');

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$file = __DIR__ . $uri;
if ($uri !== '/' && file_exists($file) && !is_dir($file)) {
    if (pathinfo($file, PATHINFO_EXTENSION) === 'php') {
        require $file;
        exit;
    }
    return false;
}
$entryPoints = ['/index.php', '/index.html', '/public/index.php', '/public/index.html'];
foreach ($entryPoints as $ep) {
    if (file_exists(__DIR__ . $ep)) {
        require __DIR__ . $ep;
        exit;
    }
}
return false;
`;
  const remoteUserIniPath = `${remotePath}/.user.ini`;
  const remoteRouterPath = `${remotePath}/.deployigo_router.php`;
  const phpFlags = `-d memory_limit=${cfg.memory_limit} -d upload_max_filesize=${cfg.upload_max_filesize} -d post_max_size=${cfg.post_max_size} -d display_errors=${cfg.display_errors === 'On' ? '1' : '0'} -d max_execution_time=${cfg.max_execution_time} -d max_input_vars=${cfg.max_input_vars} -d date.timezone=${cfg.date_timezone}`;
  const sshCmd = `cat << 'EOF' > ${remoteUserIniPath}\n${userIniScript}\nEOF\ncat << 'EOF' > ${remoteRouterPath}\n${routerScript}\nEOF\ndocker rm -f ${container} >/dev/null 2>&1 || true; docker run -d --name ${container} --restart unless-stopped --memory=1g --cpus=1 --pids-limit=256 -p ${port}:8080 -v ${remotePath}:/var/www/html php:${version}-cli-alpine php ${phpFlags} -S 0.0.0.0:8080 -t /var/www/html /var/www/html/.deployigo_router.php`;
  await execFileAsync('ssh', ['-o', 'BatchMode=yes', `${user}@${host}`, sshCmd]);


  const db = readDb();
  const target = db.projects.find(item => item.id === project.id);
  if (target) {
    target.remoteHost = host;
    target.remoteUser = user;
    target.remotePort = port;
    target.remotePath = remotePath;
    target.remoteContainer = container;
    target.url = `http://${host}:${port}/`;
    target.deploymentMode = 'remote-docker';
    target.sourceStatus = 'ready';
    target.status = project.enabled === false ? 'disabled' : 'remote';
    writeDb(db);
  }
}

async function redeployRemotePhp(project) {
  await deployRemoteProject(project);
}

async function removeRemoteProject(project) { if (project.deploymentMode !== 'remote-docker') return; const host = project.remoteHost || '192.168.1.167'; const container = project.remoteContainer || `deployigo-${project.id}`; const remotePath = project.remotePath || `/opt/deployigo/workspaces/default/${project.id}`; const command = `docker rm -f ${container} >/dev/null 2>&1 || true; rm -rf ${remotePath}`; await execFileAsync('ssh', ['-o', 'BatchMode=yes', `${project.remoteUser || 'root'}@${host}`, command]); }

async function stopRemoteProject(project) {
  await deployRemoteProject(project);
}

async function api(req, res, url) {
  const db = readDb();
  if (req.method === 'POST' && url.pathname === '/api/auth/signup') { const input = await readJson(req); const email = String(input.email || '').trim().toLowerCase(); if (!email || !input.password || String(input.password).length < 8) return send(res, 400, { error: 'Use an email and a password with at least 8 characters.' }); if (db.users.some(user => user.email === email)) return send(res, 409, { error: 'An account already exists for this email.' }); const user = { id: id('usr'), name: String(input.name || email.split('@')[0]).trim(), email, passwordHash: hashPassword(input.password), isAdmin: db.users.length === 0, createdAt: new Date().toISOString() }; db.users.push(user); const session = createSession(db, user.id); writeDb(db); return send(res, 201, { user }, { 'Set-Cookie': sessionCookie(session) }); }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') { const input = await readJson(req); const user = db.users.find(item => item.email === String(input.email || '').trim().toLowerCase()); if (!user || !validPassword(String(input.password || ''), user.passwordHash)) return send(res, 401, { error: 'Email or password is incorrect.' }); const session = createSession(db, user.id); writeDb(db); return send(res, 200, { user }, { 'Set-Cookie': sessionCookie(session) }); }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') { delete db.sessions[cookies(req).deployigo_session]; writeDb(db); return send(res, 200, { ok: true }, { 'Set-Cookie': 'deployigo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }); }
  const user = currentUser(req, db); if (!user) return send(res, 401, { error: 'Login required.' });
  if (req.method === 'POST' && url.pathname === '/api/projects/blank') { const input = await readJson(req); const name = String(input.name || '').trim().toLowerCase(); if (!/^[a-z0-9-]{3,40}$/.test(name)) return send(res, 400, { error: 'Project name must be 3-40 lowercase letters, numbers, or hyphens.' }); if (db.projects.some(item => item.ownerId === user.id && item.name === name)) return send(res, 409, { error: 'A project with this name already exists.' }); const project = localProject({ id: id('prj'), ownerId: user.id, owner: user.email, name, sourceType: 'blank-php', sourceStatus: 'creating', technology: 'PHP', phpVersion: '8.5', createdAt: new Date().toISOString() }); db.projects.push(project); await createBlankProject(project); await deployRemoteProject(project); writeDb(db); return send(res, 201, { project }); }
  if (req.method === 'DELETE' && url.pathname.match(/^\/api\/projects\/([^/]+)$/)) { const projectId = url.pathname.split('/')[3]; const project = db.projects.find(item => item.id === projectId && item.ownerId === user.id); if (!project) return send(res, 404, { error: 'Project not found.' }); await removeRemoteProject(project); db.projects.splice(db.projects.indexOf(project), 1); fs.rmSync(path.join(DATA_DIR, 'projects', project.id), { recursive: true, force: true }); writeDb(db); return send(res, 200, { ok: true, message: 'Project and remote Docker container deleted.' }); }
  if (req.method === 'POST' && url.pathname.match(/^\/api\/projects\/([^/]+)\/redeploy$/)) { const projectId = url.pathname.split('/')[3]; const project = db.projects.find(item => item.id === projectId && item.ownerId === user.id); if (!project) return send(res, 404, { error: 'Project not found.' }); if (project.deploymentMode !== 'remote-docker') return send(res, 400, { error: 'This project is not deployed remotely.' }); project.sourceStatus = 'redeploying'; writeDb(db); updateAsync(project.id, () => redeployRemotePhp(project)); return send(res, 202, { project, message: `Remote Docker redeploy started with PHP ${project.phpVersion}.` }); }
  if (req.method === 'GET' && url.pathname === '/api/me') {
    const projects = db.projects.filter(item => item.ownerId === user.id);
    let totalStorageBytes = 0;

    for (const project of projects) {
      if (project.sourceType === 'github-public' && project.sourceStatus !== 'ready' && project.sourceStatus !== 'downloading') {
        project.sourceStatus = 'downloading';
        updateAsync(project.id, () => syncGithub(project.id, project.repoUrl));
      }
      // Calculate disk usage per project
      let projectBytes = 0;
      if (project.deployPath && fs.existsSync(project.deployPath)) {
        const calcSize = dir => {
          try {
            for (const item of fs.readdirSync(dir)) {
              const p = path.join(dir, item);
              const stat = fs.statSync(p);
              if (stat.isDirectory()) calcSize(p);
              else projectBytes += stat.size;
            }
          } catch (e) {}
        };
        calcSize(project.deployPath);
      }
      project.storageBytes = projectBytes;
      project.ram = '1 GB';
      project.cpu = '1 vCPU';
      totalStorageBytes += projectBytes;
    }
    writeDb(db);
    return send(res, 200, {
      user: { id: user.id, name: user.name, email: user.email },
      projects,
      workspaceStats: {
        totalStorageBytes,
        maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
        activeRam: '1 GB',
        vCpu: '1 vCPU'
      }
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects') { const type = req.headers['content-type'] || ''; const upload = type.startsWith('multipart/form-data') ? parseMultipart(await readBuffer(req), type) : { fields: await readJson(req), file: null }; const input = upload.fields; const name = String(input.name || '').trim().toLowerCase(); const sourceType = input.sourceType === 'github' ? 'github-public' : 'zip'; const repoUrl = String(input.repoUrl || '').trim(); if (!/^[a-z0-9-]{3,40}$/.test(name)) return send(res, 400, { error: 'Project name must be 3-40 lowercase letters, numbers, or hyphens.' }); if (db.projects.some(item => item.ownerId === user.id && item.name === name)) return send(res, 409, { error: 'A project with this name already exists.' }); if (sourceType === 'github-public' && !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(repoUrl)) return send(res, 400, { error: 'Enter a public GitHub repository URL.' }); if (sourceType === 'zip' && (!upload.file || !upload.file.filename.toLowerCase().endsWith('.zip'))) return send(res, 400, { error: 'Choose a ZIP file before creating the project.' }); const project = localProject({ id: id('prj'), ownerId: user.id, owner: user.email, name, sourceType, repoUrl: sourceType === 'github-public' ? repoUrl : null, sourceStatus: sourceType === 'github-public' ? 'downloading' : 'extracting', technology: projectTechnology(name), phpVersion: '8.5', createdAt: new Date().toISOString() }); db.projects.push(project); writeDb(db); if (sourceType === 'github-public') updateAsync(project.id, () => syncGithub(project.id, repoUrl)); else updateAsync(project.id, async () => { const latest = readDb().projects.find(item => item.id === project.id); await extractZip(latest, upload.file.buffer); await deployRemoteProject(latest); const updated = readDb(); Object.assign(updated.projects.find(item => item.id === project.id), latest); writeDb(updated); }); return send(res, 201, { project }); }
  const fileRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/files(?:\/(upload|folder))?$/);
  if (fileRoute) {
    const project = db.projects.find(item => item.id === fileRoute[1] && item.ownerId === user.id);
    if (!project || !project.deployPath) return send(res, 404, { error: 'Project files are not available yet.' });
    const requestedPath = String(url.searchParams.get('path') || '').replaceAll('\\', '/');
    const root = path.resolve(project.deployPath);
    const resolveProjectPath = relative => { if (!relative || relative.startsWith('/') || relative.split('/').includes('..') || relative.split('/').includes('.deployigo-source.zip')) return null; const target = path.resolve(root, relative); return target.startsWith(`${root}${path.sep}`) ? target : null; };
    if (req.method === 'GET' && !requestedPath && !url.pathname.endsWith('/upload')) { const files = []; const walk = directory => { for (const name of fs.readdirSync(directory)) { if (name === '.deployigo-source.zip' || name.startsWith('.')) continue; const target = path.join(directory, name); const relative = path.relative(root, target).replaceAll(path.sep, '/'); if (fs.statSync(target).isDirectory()) { files.push({ path: relative, type: 'folder' }); walk(target); } else files.push({ path: relative, type: 'file', size: fs.statSync(target).size }); } }; walk(root); return send(res, 200, { files }); }
    if (req.method === 'GET') { const target = resolveProjectPath(requestedPath); if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) return send(res, 404, { error: 'File not found.' }); if (fs.statSync(target).size > 2 * 1024 * 1024) return send(res, 400, { error: 'File is too large to edit in the browser.' }); return send(res, 200, { path: requestedPath, content: fs.readFileSync(target, 'utf8') }); }
    if (req.method === 'PUT') { const target = resolveProjectPath(requestedPath); if (!target) return send(res, 400, { error: 'Invalid file path.' }); const input = await readJson(req); if (typeof input.content !== 'string' || input.content.length > 2 * 1024 * 1024) return send(res, 400, { error: 'Text content must be under 2 MB.' }); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, input.content); project.entryPoint = entryPoint(project); project.previewStatus = project.entryPoint ? 'available' : 'no-entry-point'; writeDb(db); updateAsync(project.id, () => deployRemoteProject(project)); return send(res, 200, { ok: true, path: requestedPath }); }
    if (req.method === 'POST' && fileRoute[2] === 'folder') { const input = await readJson(req); const folderName = String(input.name || '').trim(); const target = resolveProjectPath(requestedPath ? path.join(requestedPath, folderName) : folderName); if (!target || !/^[^/\\.][^/\\]*$/.test(folderName)) return send(res, 400, { error: 'Enter a valid folder name.' }); if (fs.existsSync(target)) return send(res, 409, { error: 'That folder already exists.' }); fs.mkdirSync(target, { recursive: false }); updateAsync(project.id, () => deployRemoteProject(project)); return send(res, 201, { ok: true, path: path.relative(root, target).replaceAll(path.sep, '/') }); }
    if (req.method === 'POST' && fileRoute[2] === 'upload') {
      const upload = parseMultipart(await readBuffer(req), req.headers['content-type'] || '');
      if (!upload.file) return send(res, 400, { error: 'Choose a file to upload.' });
      if (upload.file.buffer.length > 10 * 1024 * 1024) return send(res, 400, { error: 'File exceeds 10 MB limit per file.' });
      const target = resolveProjectPath(requestedPath ? path.join(requestedPath, upload.file.filename) : upload.file.filename);
      if (!target) return send(res, 400, { error: 'Invalid upload path.' });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, upload.file.buffer);
      project.entryPoint = entryPoint(project);
      project.previewStatus = project.entryPoint ? 'available' : 'no-entry-point';
      writeDb(db);
      updateAsync(project.id, () => deployRemoteProject(project));
      return send(res, 201, { ok: true, path: path.relative(root, target).replaceAll(path.sep, '/') });
    }
  }
  const phpSettingsRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/php-settings$/);
  if (phpSettingsRoute && (req.method === 'PATCH' || req.method === 'POST')) {
    const project = db.projects.find(item => item.id === phpSettingsRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });
    const input = await readJson(req);
    const FORBIDDEN_KEYS = ['disable_functions', 'open_basedir', 'allow_url_include', 'auto_prepend_file', 'auto_append_file', 'extension', 'zend_extension', 'exec', 'passthru', 'system', 'shell_exec'];
    const checkKeys = input.phpSettings || input;
    if (Object.keys(checkKeys).some(key => FORBIDDEN_KEYS.includes(key.toLowerCase()))) {
      return send(res, 400, { error: 'Security Violation: System security directives (such as disable_functions or open_basedir) are permanently locked for container security.' });
    }
    project.phpSettings = sanitizePhpSettings(checkKeys);
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project, message: 'PHP directives updated successfully.' });
  }

  const maintenanceRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/maintenance$/); if (maintenanceRoute && req.method === 'POST') { const project = db.projects.find(item => item.id === maintenanceRoute[1] && item.ownerId === user.id); if (!project) return send(res, 404, { error: 'Project not found.' }); project.maintenance = !project.maintenance; writeDb(db); updateAsync(project.id, () => deployRemoteProject(project)); return send(res, 200, { project }); }

  const action = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(rebuild|toggle))?$/); if (action) { const project = db.projects.find(item => item.id === action[1] && item.ownerId === user.id); if (!project) return send(res, 404, { error: 'Project not found.' }); if (req.method === 'PATCH') { const input = await readJson(req); if (input.phpSettings) { const FORBIDDEN_KEYS = ['disable_functions', 'open_basedir', 'allow_url_include', 'auto_prepend_file', 'auto_append_file', 'extension', 'zend_extension', 'exec', 'passthru', 'system', 'shell_exec']; if (Object.keys(input.phpSettings).some(key => FORBIDDEN_KEYS.includes(key.toLowerCase()))) { return send(res, 400, { error: 'Security Violation: System security directives are locked for container security.' }); } project.phpSettings = sanitizePhpSettings(input.phpSettings); } if (input.name !== undefined) { const name = String(input.name || '').trim().toLowerCase(); if (!/^[a-z0-9-]{3,40}$/.test(name)) return send(res, 400, { error: 'Invalid project name.' }); if (db.projects.some(item => item.ownerId === user.id && item.id !== project.id && item.name === name)) return send(res, 409, { error: 'A project with this name already exists.' }); project.name = name; project.url = project.deploymentMode === 'remote-docker' ? `http://${project.remoteHost}:${project.remotePort}/` : `http://localhost:${PORT}/local/${name}/`; } if (input.phpVersion && ['8.1', '8.2', '8.3', '8.4', '8.5'].includes(input.phpVersion)) { project.phpVersion = input.phpVersion; } if (input.sourceType === 'github') { const repoUrl = String(input.repoUrl || '').trim(); if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(repoUrl)) return send(res, 400, { error: 'Enter a valid public GitHub URL.' }); project.sourceType = 'github-public'; project.repoUrl = repoUrl; project.sourceStatus = 'downloading'; project.deployPath = null; project.entryPoint = null; writeDb(db); updateAsync(project.id, () => syncGithub(project.id, repoUrl)); return send(res, 202, { project }); } writeDb(db); updateAsync(project.id, () => deployRemoteProject(project)); return send(res, 200, { project }); }


    if (req.method === 'POST' && action[2] === 'toggle') { project.enabled = project.enabled === false; writeDb(db); if (project.enabled) updateAsync(project.id, () => deployRemoteProject(project)); else updateAsync(project.id, () => stopRemoteProject(project)); return send(res, 200, { project }); } if (req.method === 'POST' && action[2] === 'rebuild') { project.sourceStatus = 'rebuilding'; writeDb(db); if (project.sourceType === 'github-public') updateAsync(project.id, () => syncGithub(project.id, project.repoUrl)); else { const source = path.join(DATA_DIR, 'projects', project.id, '.deployigo-source.zip'); updateAsync(project.id, async () => { if (fs.existsSync(source)) await extractZip(project, fs.readFileSync(source)); await deployRemoteProject(project); writeDb(readDb()); }); } return send(res, 202, { project }); } if (req.method === 'DELETE') { await removeRemoteProject(project); const index = db.projects.findIndex(item => item.id === project.id); db.projects.splice(index, 1); fs.rmSync(path.join(DATA_DIR, 'projects', project.id), { recursive: true, force: true }); writeDb(db); return send(res, 200, { ok: true }); } }
  if (req.method === 'GET' && url.pathname === '/api/admin/summary') { if (!user.isAdmin) return send(res, 403, { error: 'Admin access required.' }); return send(res, 200, { stats: { users: db.users.length, workspaces: db.users.length, projects: db.projects.length, deployments: db.projects.length }, projects: db.projects.slice(-20).reverse() }); }
  return send(res, 404, { error: 'Not found.' });
}

function fallback(res, project) { const disabled = project.enabled === false; const maintenance = project.maintenance === true; const title = maintenance ? 'Maintenance in progress' : disabled ? 'Project disabled' : 'Project preview'; const message = maintenance ? 'This project is temporarily offline while maintenance work is in progress.' : disabled ? 'This project has been disabled by its owner.' : project.deployPath ? 'No index.html, index.php, or public entry point was found in this repository.' : 'Source files are still syncing.'; const detail = !disabled && !maintenance && project.repoUrl ? `<a href="${project.repoUrl}">Open repository on GitHub</a>` : ''; res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${project.name} | Deployigo</title><style>body{margin:0;background:#f3f0e8;color:#17211d;font:16px system-ui;padding:12vw}main{max-width:680px;border-top:5px solid ${maintenance ? '#d8f27b' : disabled ? '#f06e45' : '#c8c8b9'};padding-top:28px}small{color:#68716a;text-transform:uppercase;letter-spacing:1px}h1{font-size:clamp(34px,6vw,64px);margin:16px 0}p{line-height:1.6;color:#526059}a{color:#d44e2a;font-weight:600}</style></head><body><main><small>${maintenance ? 'Deployigo maintenance' : disabled ? 'Deployigo disabled' : 'Deployigo project status'}</small><h1>${title}</h1><p>${message}</p>${detail}</main></body></html>`); }
async function serveProject(res, project, relativePath) { const root = path.resolve(project.deployPath); const filePath = path.resolve(root, relativePath); if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) return send(res, 403, { error: 'Invalid project path.' }); if (!fs.existsSync(filePath)) return fallback(res, project); if (path.extname(filePath) === '.php') { try { const result = await execFileAsync('php', [filePath], { cwd: root, timeout: 5000, maxBuffer: 2 * 1024 * 1024 }); res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(result.stdout); } catch (error) { res.writeHead(500, { 'Content-Type': 'text/plain' }); return res.end(`PHP preview error: ${error.stderr || error.message}`); } } const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' }; fs.readFile(filePath, (error, content) => { if (error) return fallback(res, project); res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' }); res.end(content); }); }
function staticFile(req, res, url) { if (url.pathname.startsWith('/local/')) { const parts = url.pathname.split('/').filter(Boolean); const project = readDb().projects.find(item => item.name === parts[1]); if (project?.deployPath && project.entryPoint && project.enabled !== false && project.maintenance !== true) return serveProject(res, project, parts.slice(2).join('/') || project.entryPoint); if (project) return fallback(res, project); } const filePath = url.pathname === '/' ? path.join(ROOT, 'frontend/index.html') : url.pathname.startsWith('/frontend/') ? path.join(ROOT, url.pathname) : url.pathname === '/admin/' ? path.join(ROOT, 'admin/index.html') : url.pathname.startsWith('/admin/') ? path.join(ROOT, url.pathname) : url.pathname === '/login.html' ? path.join(ROOT, 'frontend/login.html') : url.pathname === '/signup.html' ? path.join(ROOT, 'frontend/signup.html') : url.pathname === '/app/' ? path.join(ROOT, 'frontend/app.html') : null; if (!filePath || !filePath.startsWith(ROOT)) return send(res, 404, { error: 'Not found.' }); fs.readFile(filePath, (error, content) => { if (error) return send(res, 404, { error: 'Not found.' }); const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }; res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'text/plain' }); res.end(content); }); }
const server = http.createServer(async (req, res) => { const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else staticFile(req, res, url); } catch (error) { console.error(error); send(res, 500, { error: error.message || 'Unexpected server error.' }); } });
server.listen(PORT, () => console.log(`Deployigo listening on http://localhost:${PORT}`));
