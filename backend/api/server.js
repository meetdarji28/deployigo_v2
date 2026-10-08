const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { normalizeTechnology, entryPoint, analyzeSource, extractZip: unpackZip, validatePublicGitHubUrl } = require('./project-utils');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const ROOT = path.resolve(__dirname, '../..');

// Load .env file automatically
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of envLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const PORT = Number(process.env.API_PORT || 4302);
const CUSTOMER_PORT = Number(process.env.CUSTOMER_PORT || process.env.PORT || 4300);
const SESSION_TTL = Number(process.env.SESSION_TTL_HOURS || 8) * 60 * 60 * 1000;

const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const execFileAsync = promisify(execFile);
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], projects: [], sessions: {} }, null, 2));

const id = prefix => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const writeDb = db => { const pending = `${DB_FILE}.${process.pid}.tmp`; fs.writeFileSync(pending, JSON.stringify(db, null, 2), { mode: 0o600 }); fs.renameSync(pending, DB_FILE); };
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

const DEFAULT_PHP_MODULES = {
  pdo_mysql: true,
  mysqli: true,
  pdo_pgsql: false,
  pgsql: false,
  mongodb: false,
  pdo_sqlite: true,
  redis: false,
  memcached: false,
  imagick: false,
  gd: true,
  curl: true,
  mbstring: true,
  zip: true,
  intl: false,
  bcmath: true,
  xml: true,
  opcache: true,
  soap: false,
  sockets: false,
  exif: true,
  fileinfo: true
};

const PHP_ALLOWED_EXTENSIONS = Object.keys(DEFAULT_PHP_MODULES);

function sanitizePhpModules(input = {}, existing = {}) {
  const current = { ...DEFAULT_PHP_MODULES, ...existing };
  for (const ext of PHP_ALLOWED_EXTENSIONS) {
    if (typeof input[ext] === 'boolean') {
      current[ext] = input[ext];
    } else if (input[ext] === 'true' || input[ext] === '1') {
      current[ext] = true;
    } else if (input[ext] === 'false' || input[ext] === '0') {
      current[ext] = false;
    }
  }
  return current;
}

// Entry-point discovery and source analysis live in project-utils.js.
function localProject(payload) {
  return {
    id: payload.id,
    ownerId: payload.ownerId,
    owner: payload.owner,
    name: payload.name,
    status: payload.deployTarget === 'remote-docker' ? 'deploying' : 'local',
    sourceType: payload.sourceType || 'blank-php',
    sourceError: null,
    sourceAnalysis: null,
    repoBranch: payload.repoBranch || 'main',
    autoBuild: Boolean(payload.autoBuild),
    sourceStatus: payload.sourceStatus || 'ready',
    deploymentReady: payload.deployTarget !== 'remote-docker',
    deploymentHistory: [],
    technology: normalizeTechnology(payload.technology),
    phpVersion: payload.phpVersion || '8.5',
    phpSettings: { ...DEFAULT_PHP_SETTINGS, ...(payload.phpSettings || {}) },
    phpModules: sanitizePhpModules(payload.phpModules || {}),
    createdAt: payload.createdAt || new Date().toISOString(),
    deploymentMode: payload.deployTarget === 'remote-docker' ? 'remote-docker' : 'local-preview',
    deployTarget: payload.deployTarget === 'remote-docker' ? 'remote-docker' : 'local-preview',
    remoteHost: payload.remoteHost || '192.168.1.167',
    remoteUser: payload.remoteUser || 'root',
    remotePort: payload.remotePort || 18080,
    remotePath: payload.remotePath || `/opt/deployigo/workspaces/default/${payload.id}`,
    remoteContainer: payload.remoteContainer || `deployigo-${payload.id}`,
    url: payload.deployTarget === 'remote-docker'
      ? `http://${payload.remoteHost || '192.168.1.167'}:${payload.remotePort || 18080}/`
      : `http://localhost:${CUSTOMER_PORT}/local/${payload.name}/`,
    deployPath: payload.deployPath || null,
    entryPoint: payload.entryPoint || null,
    repoUrl: payload.repoUrl || null,
    enabled: true,
    maintenance: false
  };
}

function readDb() { const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); let changed = false; for (const project of db.projects) { if (project.deploymentMode === 'mock' || (project.url?.startsWith('https://') && project.status === 'staging')) { project.status = 'local'; project.url = `http://localhost:${CUSTOMER_PORT}/local/${project.name}/`; project.deploymentMode = 'local-preview'; changed = true; } if (project.deployPath && !project.entryPoint) { project.entryPoint = entryPoint(project); project.previewStatus = project.entryPoint ? 'available' : 'no-entry-point'; changed = true; } if (project.enabled === undefined) { project.enabled = true; changed = true; } if (project.maintenance === undefined) { project.maintenance = false; changed = true; } if (!project.deployTarget) { project.deployTarget = process.env.DEPLOY_TARGET || 'local-preview'; changed = true; } if (!project.phpVersion) { project.phpVersion = '8.5'; changed = true; } if (!project.phpSettings) { project.phpSettings = { ...DEFAULT_PHP_SETTINGS }; changed = true; } if (!project.phpModules) { project.phpModules = sanitizePhpModules({}); changed = true; } else { const merged = sanitizePhpModules(project.phpModules, project.phpModules); if (JSON.stringify(merged) !== JSON.stringify(project.phpModules)) { project.phpModules = merged; changed = true; } } } if (changed) writeDb(db); return db; }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(item => { const [key, ...value] = item.trim().split('='); return [key, decodeURIComponent(value.join('='))]; })); }
function currentUser(req, db, scope = 'customer') { const key = scope === 'admin' ? 'deployigo_admin_session' : 'deployigo_session'; const session = db.sessions[cookies(req)[key]]; if (!session || session.expiresAt < Date.now() || (session.scope || 'customer') !== scope) return null; return db.users.find(user => user.id === session.userId && !user.suspended) || null; }
function readJson(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 2e6) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function readBuffer(req) { return new Promise((resolve, reject) => { const chunks = []; let size = 0; req.on('data', chunk => { size += chunk.length; if (size > 60 * 1024 * 1024) return reject(new Error('Upload exceeds 60 MB.')); chunks.push(chunk); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); }); }
function parseMultipart(buffer, contentType) { const boundary = contentType.match(/boundary=([^;]+)/)?.[1]; if (!boundary) throw new Error('Missing upload boundary.'); const marker = Buffer.from(`--${boundary}`).toString('binary'); const fields = {}; let file = null; for (const part of buffer.toString('binary').split(marker)) { const headerEnd = part.indexOf('\r\n\r\n'); if (headerEnd < 0) continue; const headers = part.slice(0, headerEnd); const value = part.slice(headerEnd + 4).replace(/\r\n--?\r\n?$/, '').replace(/\r\n$/, ''); const match = headers.match(/name="([^"]+)"(?:; filename="([^"]*)")?/); if (!match) continue; if (match[2]) file = { filename: path.basename(match[2]), buffer: Buffer.from(value, 'binary') }; else fields[match[1]] = value; } return { fields, file }; }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`; }
function validPassword(password, stored) { const [salt, hash] = stored.split(':'); return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(password, salt, 64)); }
function sessionCookie(value, scope = 'customer') { return `${scope === 'admin' ? 'deployigo_admin_session' : 'deployigo_session'}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`; }
function createSession(db, userId, scope = 'customer') { for (const key of Object.keys(db.sessions)) if (db.sessions[key].userId === userId && (db.sessions[key].scope || 'customer') === scope) delete db.sessions[key]; const value = id('sess'); db.sessions[value] = { userId, scope, expiresAt: Date.now() + SESSION_TTL }; return value; }
// Short-lived OAuth state + one-time repo grants (memory only, never exposed to UI).
const oauthStates = new Map();
const oauthGrants = new Map();
const oauthExpiryMs = 10 * 60 * 1000;
function gitEncryptionKey() {
  const raw=String(process.env.GIT_TOKEN_ENCRYPTION_KEY || '');
  const key=/^[a-fA-F0-9]{64}$/.test(raw)?Buffer.from(raw,'hex'):Buffer.from(raw,'base64');
  return key.length===32?key:null;
}
function encryptGitToken(token){
  const key=gitEncryptionKey(); if(!key) throw new Error('GIT_TOKEN_ENCRYPTION_KEY must be a random 32-byte hex or base64 key configured manually in .env.');
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const bytes=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return [iv.toString('base64'),cipher.getAuthTag().toString('base64'),bytes.toString('base64')].join('.');
}
function decryptGitToken(encrypted){
  const key=gitEncryptionKey(); if(!key) throw new Error('Git encryption key is missing.');
  const pieces=String(encrypted||'').split('.'); if(pieces.length!==3) throw new Error('Invalid encrypted repository credential.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(pieces[0],'base64'));
  decipher.setAuthTag(Buffer.from(pieces[1],'base64'));
  return Buffer.concat([decipher.update(Buffer.from(pieces[2],'base64')),decipher.final()]).toString('utf8');
}
const projectJobs = new Map();
function updateAsync(projectId, callback) {
  const previous = projectJobs.get(projectId) || Promise.resolve();
  const current = previous.catch(() => {}).then(callback).catch(error => {
    const db = readDb();
    const project = db.projects.find(item => item.id === projectId);
    if (project) {
      project.sourceStatus = 'error';
      project.deploymentReady = false;
      project.deploymentHistory = [...(project.deploymentHistory || []).slice(-19), { at: new Date().toISOString(), state: 'failed', message: String(error.message || 'Deployment failed').slice(0, 500) }];
      project.sourceError = String(error.message || 'Deployment failed').slice(0, 1200);
      writeDb(db);
    }
  });
  projectJobs.set(projectId, current);
  current.finally(() => { if (projectJobs.get(projectId) === current) projectJobs.delete(projectId); });
  return current;
}
function shellQuote(value) { return `'${String(value).replace(/'/g, `'\\''`)}'`; }
// Transport DB passwords via encrypted SSH stdin (never in a process command argument).
function sshWithInput(project, remoteCommand, input, { timeout=30000, maxBuffer=4*1024*1024 }={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn('ssh',['-T','-o','BatchMode=yes','-o','ConnectTimeout=5',`${project.remoteUser}@${project.remoteHost}`,remoteCommand]);
    let stdout='',stderr='',bytes=0,done=false;
    const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timer);if(err)reject(err);else resolve(value);};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('Database operation timed out'));},timeout);
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBuffer){child.kill('SIGKILL');finish(new Error('Database output exceeds safe size limit'));}else stdout+=chunk.toString();});
    child.stderr.on('data',chunk=>{stderr+=String(chunk).slice(0,2000);});
    child.on('error',finish);
    child.on('close',code=>code===0?finish(null,{stdout,stderr}):finish(new Error('Database command failed: '+stderr.slice(0,500))));
    child.stdin.on('error',()=>{});
    child.stdin.end(input);
  });
}
function workerRequired(project) { return project.deployTarget === 'remote-docker'; }
async function ensureWorker(project) { return !workerRequired(project) || (await checkWorkerServer(project.remoteHost, project.remoteUser)).ok; }
function projectResponse(project) {
  // Never return database passwords or custom secrets in project metadata.
  const { database, envVars, webhookSecret, webhookDeliveries, gitEncryptedToken, ...view } = project;
  return { ...view, deploymentReady: project.deployTarget !== 'remote-docker' || project.deploymentReady === true, url: project.deployTarget === 'remote-docker' && project.deploymentReady !== true ? null : (project.deployTarget === 'local-preview' ? `http://localhost:${CUSTOMER_PORT}/local/${project.name}/` : project.url), webhookConfigured: Boolean(webhookSecret), database: database ? { ...database, dbPassword: undefined } : undefined,
    envVars: envVars ? Object.fromEntries(Object.keys(envVars).map(key => [key, '********'])) : {} };
}
function serverMode() { return process.env.DEPLOY_TARGET === 'remote-docker' ? 'remote-docker' : 'local-preview'; }
function allocatePort(db, host) {
  const start = Number(process.env.DEPLOY_REMOTE_PORT_START || 18080);
  if (!Number.isInteger(start) || start < 1024 || start > 65000) throw new Error('Invalid worker port range.');
  const occupied = new Set(db.projects.filter(project => project.remoteHost === host).map(project => Number(project.remotePort)));
  for (let port = start; port < start + 100; port++) if (!occupied.has(port)) return port;
  throw new Error('No free project ports on this worker. Add a worker or expand the port allocator.');
}
function parseVersion(version) {
  if (!['8.1','8.2','8.3','8.4','8.5'].includes(String(version))) throw new Error('Unsupported PHP version. Choose PHP 8.1 through 8.5.');
  return String(version);
}
async function extractZip(project, bytes) {
  fs.mkdirSync(path.join(DATA_DIR, 'projects'), { recursive: true });
  const target = path.join(DATA_DIR, 'projects', project.id);
  const staging = fs.mkdtempSync(path.join(DATA_DIR, 'projects', '.incoming-'));
  try {
    unpackZip(bytes, staging);
    const scan = { ...project, deployPath: staging };
    const firstEntry = entryPoint(scan);
    if (!firstEntry) throw new Error('ZIP has no entry point for the selected technology. Expected index.html for HTML, or index.php/public/index.php for PHP.');
    const existing = `${target}.previous`;
    fs.rmSync(existing, { recursive: true, force: true });
    if (fs.existsSync(target)) fs.renameSync(target, existing);
    try { fs.renameSync(staging, target); } catch (err) { if (fs.existsSync(existing)) fs.renameSync(existing, target); throw err; }
    fs.rmSync(existing, { recursive: true, force: true });
    fs.writeFileSync(path.join(target, '.deployigo-source.zip'), bytes, { mode: 0o600 });
    project.deployPath = target;
    project.entryPoint = firstEntry;
    project.sourceAnalysis = analyzeSource(project);
    project.previewStatus = 'available';
    project.sourceStatus = 'ready';
    project.sourceError = null;
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}


async function checkWorkerServer(host, user) {
  const targetHost = host || process.env.DEPLOY_REMOTE_HOST || '192.168.1.167';
  const targetUser = user || process.env.DEPLOY_REMOTE_USER || 'root';
  try {
    await execFileAsync('ssh', [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=4',
      `${targetUser}@${targetHost}`,
      'docker info >/dev/null 2>&1'
    ], { timeout: 5000 });
    return { ok: true, host: targetHost };
  } catch (err) {
    return {
      ok: false,
      host: targetHost,
      error: `Worker server (${targetHost}) is down or unreachable. Unable to process your request. Please contact support.`
    };
  }
}

async function stopRemoteProject(project) {
  const host = project.remoteHost || process.env.DEPLOY_REMOTE_HOST || '192.168.1.167';
  const user = project.remoteUser || process.env.DEPLOY_REMOTE_USER || 'root';
  const container = project.remoteContainer || `deployigo-${project.id}`;

  const cmd = `docker stop ${container} >/dev/null 2>&1 || true`;
  await execFileAsync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', `${user}@${host}`, cmd], { timeout: 10000 });
}

async function removeRemoteProject(project) {
  const host = project.remoteHost || process.env.DEPLOY_REMOTE_HOST || '192.168.1.167';
  const user = project.remoteUser || process.env.DEPLOY_REMOTE_USER || 'root';
  const remoteBase = process.env.DEPLOY_REMOTE_BASE || '/opt/deployigo/workspaces';
  const remotePath = `${remoteBase}/default/${project.id}`;
  const container = project.remoteContainer || `deployigo-${project.id}`;
  const dbContainer = `deployigo-db-${project.id}`;
  const imageName = `deployigo-img-${project.id}`;

  const cmd = `docker rm -f ${container} ${dbContainer} >/dev/null 2>&1 || true; docker rmi -f ${imageName} >/dev/null 2>&1 || true; rm -rf ${remotePath}`;
  await execFileAsync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', `${user}@${host}`, cmd], { timeout: 15000 });
}

async function createBlankProject(project) {
  const dir = path.join(DATA_DIR, 'projects', project.id);
  fs.mkdirSync(dir, { recursive: true });
  const isHtml = project.technology === 'HTML';
  const filename = isHtml ? 'index.html' : 'index.php';
  const content = isHtml
    ? (typeof project.initialHtml === 'string' && project.initialHtml.trim() ? project.initialHtml : `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome</title></head><body><main><h1>Your HTML site is ready</h1><p>Edit index.html in Deployigo to get started.</p></main></body></html>\n`)
    : `<?php\ndeclare(strict_types=1);\nheader('Content-Type: text/plain; charset=utf-8');\necho "Deployigo PHP workspace is running\\n";\necho "PHP version: " . PHP_VERSION . "\\n";\necho "Server time: " . date(DATE_ATOM) . "\\n";\necho "Edit index.php to start building your PHP application.\\n";\n`;
  if (!fs.existsSync(path.join(dir, filename))) fs.writeFileSync(path.join(dir, filename), content);
  project.deployPath = dir;
  project.entryPoint = filename;
  project.sourceAnalysis = analyzeSource(project);
  project.previewStatus = 'available';
  project.sourceStatus = 'ready';
  project.sourceError = null;
  delete project.initialHtml;
}

async function deployRemoteProject(project) { if (project.deployTarget !== 'remote-docker' || !project.deployPath) return; { const data=readDb(); const row=data.projects.find(p=>p.id===project.id); if(row){row.deploymentReady=false;row.sourceStatus='deploying';row.sourceError=null;row.lastDeployStartedAt=new Date().toISOString();writeDb(data);} } const host = project.remoteHost || process.env.DEPLOY_REMOTE_HOST || '192.168.1.167'; const user = project.remoteUser || process.env.DEPLOY_REMOTE_USER || 'root'; const remoteBase = process.env.DEPLOY_REMOTE_BASE || '/opt/deployigo/workspaces'; const port = Number(project.remotePort || 18080 + (parseInt(project.id.slice(-4), 16) % 100)); const remotePath = `${remoteBase}/default/${project.id}`; const container = `deployigo-${project.id}`; const sourceDir = fs.existsSync(project.deployPath) && fs.statSync(project.deployPath).isDirectory() ? project.deployPath : path.dirname(project.deployPath); await new Promise((resolve, reject) => { const tar = spawn('tar', ['--exclude=.deployigo-source.zip', '--exclude=.git', '--exclude=.env', '--exclude=node_modules', '-C', sourceDir, '-cf', '-', '.']); const ssh = spawn('ssh', ['-o', 'BatchMode=yes', `${user}@${host}`, `rm -rf ${remotePath} && mkdir -p ${remotePath} && tar -xf - -C ${remotePath}`]); let error = ''; ssh.stderr.on('data', chunk => { error += chunk; }); tar.stdout.pipe(ssh.stdin); ssh.on('close', code => code === 0 ? resolve() : reject(new Error(error || `Remote source upload failed (${code}).`))); tar.on('error', reject); }); if (project.technology === 'HTML') {
    const imageName = `deployigo-img-${project.id}`;
    // Static sites do not use PHP, Composer, or PHP extensions.
    const cmd = `set -e; printf '%s\n' 'FROM nginx:alpine' 'COPY . /usr/share/nginx/html/' 'EXPOSE 80' > '${remotePath}/Dockerfile.deployigo-static'; docker build -t '${imageName}' -f '${remotePath}/Dockerfile.deployigo-static' '${remotePath}'; docker rm -f '${container}' >/dev/null 2>&1 || true; docker run -d --name '${container}' --restart unless-stopped --memory=1g --cpus=1 --pids-limit=256 -p '${port}:80' '${imageName}'`;
    await execFileAsync('ssh', ['-o', 'BatchMode=yes', `${user}@${host}`, cmd], { timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
    const nginxCheck=`ready=0; for i in $(seq 1 12); do if docker exec ${shellQuote(container)} sh -lc 'wget -q -T 3 -O /dev/null http://127.0.0.1/' >/dev/null 2>&1; then ready=1; break; fi; sleep 1; done; if [ "$ready" -ne 1 ]; then docker logs --tail 25 ${shellQuote(container)} >&2; exit 1; fi`;
    await execFileAsync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=5',`${user}@${host}`,nginxCheck],{timeout:40000,maxBuffer:1024*1024});
    const db = readDb(); const saved = db.projects.find(item => item.id === project.id);
    if (saved) { Object.assign(saved, { remoteHost: host, remoteUser: user, remotePort: port, remotePath, remoteContainer: container, url: `http://${host}:${port}/`, sourceStatus: 'ready', sourceError: null, status: 'remote', deploymentReady: true, deploymentHistory: [...(saved.deploymentHistory || []).slice(-19), {at:new Date().toISOString(),state:'ready',message:'Static site deployed'}] }); writeDb(db); }
    return;
  }
  const version = parseVersion(project.phpVersion || '8.5'); const cfg = sanitizePhpSettings(project.phpSettings);


  const modules = sanitizePhpModules(project.phpModules);
  const extFlags = [];
  const iniExtensions = [];
  const userIniLines = [];
  const extNames = {
    pdo_mysql: 'pdo_mysql',
    mysqli: 'mysqli',
    pdo_pgsql: 'pdo_pgsql',
    pgsql: 'pgsql',
    mongodb: 'mongodb',
    pdo_sqlite: 'pdo_sqlite',
    redis: 'redis',
    memcached: 'memcached',
    imagick: 'imagick',
    gd: 'gd',
    curl: 'curl',
    mbstring: 'mbstring',
    zip: 'zip',
    intl: 'intl',
    bcmath: 'bcmath',
    xml: 'xml',
    opcache: 'opcache',
    soap: 'soap',
    sockets: 'sockets',
    exif: 'exif',
    fileinfo: 'fileinfo'
  };
  for (const [key, enabled] of Object.entries(modules)) {
    if (enabled && extNames[key]) {
      const extName = extNames[key];
      if (extName === 'opcache') {
        extFlags.push('-d zend_extension=opcache');
        iniExtensions.push('@ini_set("zend_extension", "opcache");');
        userIniLines.push('zend_extension=opcache');
      } else {
        extFlags.push(`-d extension=${extName}`);
        iniExtensions.push(`@ini_set("extension", "${extName}");`);
        userIniLines.push(`extension=${extName}`);
      }
    }
  }
  const extFlagString = extFlags.join(' ');
  const iniExtensionCode = iniExtensions.join('\n');
  const userIniExtensionString = userIniLines.join('\n');

  const userIniScript = `memory_limit = ${cfg.memory_limit}
max_execution_time = ${cfg.max_execution_time}
upload_max_filesize = ${cfg.upload_max_filesize}
post_max_size = ${cfg.post_max_size}
display_errors = ${cfg.display_errors === 'On' ? 'On' : 'Off'}
max_input_vars = ${cfg.max_input_vars}
session.gc_maxlifetime = ${cfg.session_gc_maxlifetime}
date.timezone = "${cfg.date_timezone}"
${userIniExtensionString}
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
error_reporting(E_ALL);
ini_set('display_errors', '0');

ob_start();

function render_fatal_error_page($msg, $file, $line) {
    if (ob_get_length()) ob_clean();
    http_response_code(500);
    $msg = htmlspecialchars($msg);
    $file = htmlspecialchars(basename($file));
    echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>500 Application Error | Deployigo</title><style>body{margin:0;background:#0b0e14;color:#c9d1d9;font:15px system-ui,-apple-system,BlinkMacSystemFont;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}main{max-width:680px;width:100%;background:#161b22;border:1px solid #f85149;border-radius:12px;padding:36px;box-shadow:0 0 30px rgba(248,81,73,0.15)}h1{color:#ff7b72;margin-top:0;font-size:24px;display:flex;align-items:center;gap:10px}p{line-height:1.6;color:#8b949e;margin:12px 0}.err-box{background:#0d1117;border:1px solid #30363d;border-left:4px solid #f85149;padding:16px;border-radius:6px;font-family:"DM Mono",Consolas,monospace;font-size:13px;color:#ff7b72;margin:18px 0;white-space:pre-wrap;word-break:break-all;line-height:1.5}.tip{background:#1c2128;border:1px solid #30363d;padding:14px 16px;border-radius:6px;font-size:13px;color:#79c0ff;display:flex;align-items:center;gap:8px}code{background:#21262d;padding:2px 6px;border-radius:4px;color:#79c0ff}</style></head><body><main><h1>⚠️ 500 Application Runtime Error</h1><p>Your PHP application threw a fatal runtime error in <code>' . $file . '</code> on line <strong>' . $line . '</strong>:</p><div class="err-box">' . $msg . '</div><div class="tip">💡 <strong>Need full details?</strong> Open <strong>📋 Web Logs</strong> from your Deployigo project dashboard to view complete stack traces.</div></main></body></html>';
    exit;
}

set_exception_handler(function($e) {
    render_fatal_error_page($e->getMessage() . "\n\nStack Trace:\n" . $e->getTraceAsString(), $e->getFile(), $e->getLine());
});

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR])) {
        render_fatal_error_page($error['message'], $error['file'], $error['line']);
    }
});


$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (preg_match('~(^|/)\\.~', $uri) || str_contains($uri, '..')) { http_response_code(404); exit; }
$file = __DIR__ . $uri;
if ($uri !== '/' && file_exists($file) && !is_dir($file)) {
    if (pathinfo($file, PATHINFO_EXTENSION) === 'php') {
        require $file;
        exit;
    }
    return false;
}
if (file_exists(__DIR__ . '/vendor/autoload.php')) {
    require_once __DIR__ . '/vendor/autoload.php';
}

$entryPoints = ['/index.php', '/index.html', '/home.php', '/home.html', '/public/index.php', '/public/index.html'];
foreach ($entryPoints as $ep) {
    if (file_exists(__DIR__ . $ep)) {
        require __DIR__ . $ep;
        exit;
    }
}
// If no index or entry point file found, show default Deployigo Welcome page instead of HTTP 500 error
echo '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . htmlspecialchars('${project.name}') . ' | Deployigo</title><style>body{margin:0;background:#0d1117;color:#c9d1d9;font:15px system-ui,-apple-system,BlinkMacSystemFont;display:flex;align-items:center;justify-content:center;min-height:100vh}main{max-width:560px;background:#161b22;border:1px solid #30363d;border-radius:12px;padding:40px;box-shadow:0 8px 24px rgba(0,0,0,0.5)}h1{color:#58a6ff;margin-top:0;font-size:26px}p{line-height:1.6;color:#8b949e}.badge{background:#238636;color:#fff;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;display:inline-block;margin-bottom:12px}code{background:#21262d;padding:2px 6px;border-radius:4px;color:#79c0ff;font-family:monospace}</style></head><body><main><span class="badge">🚀 Environment Active</span><h1>Welcome to ' . htmlspecialchars('${project.name}') . '</h1><p>Your PHP container environment is running smoothly on <strong>Deployigo</strong>.</p><p>To display your web application content here, place an <code>index.php</code> or <code>index.html</code> file in your repository root directory.</p></main></body></html>';
exit;
`;

  const remoteUserIniPath = `${remotePath}/.user.ini`;
  const remoteRouterPath = `${remotePath}/.deployigo_router.php`;
  const phpFlags = `-d memory_limit=${cfg.memory_limit} -d upload_max_filesize=${cfg.upload_max_filesize} -d post_max_size=${cfg.post_max_size} -d display_errors=${cfg.display_errors === 'On' ? '1' : '0'} -d max_execution_time=${cfg.max_execution_time} -d max_input_vars=${cfg.max_input_vars} -d date.timezone=${cfg.date_timezone}`;
  
  const extInstallList = [];
  const peclList = [];
  for (const [key, enabled] of Object.entries(modules)) {
    if (enabled) {
      if (['pdo_mysql', 'mysqli', 'pdo_pgsql', 'pgsql', 'pdo_sqlite', 'gd', 'bcmath', 'intl', 'soap', 'sockets', 'exif', 'fileinfo', 'zip', 'opcache'].includes(key)) {
        extInstallList.push(key);
      } else if (['redis', 'mongodb', 'memcached', 'imagick'].includes(key)) {
        peclList.push(key);
      }
    }
  }

  let dockerfileContent = `FROM php:${version}-cli-alpine\n`;
  dockerfileContent += `RUN apk add --no-cache git unzip zip $PHPIZE_DEPS postgresql-dev sqlite-dev libpng-dev libjpeg-turbo-dev freetype-dev libzip-dev icu-dev libxml2-dev imagemagick imagemagick-dev libmemcached-dev zlib-dev autoconf gcc g++ make linux-headers\n`;
  dockerfileContent += `COPY --from=composer:latest /usr/bin/composer /usr/bin/composer\n`;

  // Install supported Alpine driver extensions cleanly
  const allowedAlpineExts = ['pdo_mysql', 'mysqli', 'pdo_pgsql', 'pgsql', 'pdo_sqlite', 'gd', 'zip', 'bcmath'];
  const buildableExts = extInstallList.filter(ext => allowedAlpineExts.includes(ext));
  for (const ext of buildableExts) {
    dockerfileContent += `RUN docker-php-ext-install ${ext}\n`;
  }
  for (const peclExt of peclList) {
    dockerfileContent += `RUN pecl install ${peclExt}\nRUN docker-php-ext-enable ${peclExt}\n`;
  }

  const remoteDockerfile = `${remotePath}/Dockerfile`;
  const imageName = `deployigo-img-${project.id}`;

  // Environment values are passed to the container process; do not materialize a public .env file.

  if (project.database && project.database.type && project.database.type !== 'none' && project.database.mode !== 'existing' && !project.database.isExternal) {
    const dbConf = project.database;
    const dbContainer = `deployigo-db-${project.id}`;
    const defaultPort = dbConf.type === 'postgres' ? 5432 : 3306;
    let dbCmd = `docker network create deployigo-net >/dev/null 2>&1 || true; `;
    if (dbConf.type === 'mysql') {
      const tag = dbConf.version === '5.7' ? '5.7' : dbConf.version === '9' ? '9.0' : '8.0';
      dbCmd += `docker inspect ${dbContainer} >/dev/null 2>&1 || docker run -d --name ${dbContainer} --network deployigo-net --restart unless-stopped -v ${dbContainer}-data:/var/lib/mysql -e MYSQL_ROOT_PASSWORD=${shellQuote(dbConf.dbPassword)} -e MYSQL_DATABASE=${shellQuote(dbConf.dbName)} -e MYSQL_USER=${shellQuote(dbConf.dbUser)} -e MYSQL_PASSWORD=${shellQuote(dbConf.dbPassword)} mysql:${tag}`;
    } else if (dbConf.type === 'postgres') {
      const tag = dbConf.version === '18' ? '18-alpine' : '17-alpine';
      dbCmd += `docker inspect ${dbContainer} >/dev/null 2>&1 || docker run -d --name ${dbContainer} --network deployigo-net --restart unless-stopped -v ${dbContainer}-data:${tag.startsWith('18') ? '/var/lib/postgresql' : '/var/lib/postgresql/data'} -e POSTGRES_DB=${shellQuote(dbConf.dbName)} -e POSTGRES_USER=${shellQuote(dbConf.dbUser)} -e POSTGRES_PASSWORD=${shellQuote(dbConf.dbPassword)} postgres:${tag}`;
    }
    if (dbCmd) {
      try { await execFileAsync('ssh', ['-o', 'BatchMode=yes', `${user}@${host}`, dbCmd], { timeout: 90000 }); } catch (e) { throw new Error('Database container failed to start. Check database image/version and Docker logs on the worker.'); }
    }
  }

  const remoteEntrypointPath = `${remotePath}/.entrypoint.sh`;
  let entrypointScript = `#!/bin/sh\nset -e\ncd /var/www/html\n`;
  if (Array.isArray(project.buildSteps) && project.buildSteps.length > 0) {
    for (const step of project.buildSteps) {
      if (step.trim()) {
        entrypointScript += `${step.trim()}\n`;
      }
    }
  }
  entrypointScript += `exec php -d memory_limit=${cfg.memory_limit} -d upload_max_filesize=${cfg.upload_max_filesize} -d post_max_size=${cfg.post_max_size} -d display_errors=${cfg.display_errors === 'On' ? '1' : '0'} -d max_execution_time=${cfg.max_execution_time} -d max_input_vars=${cfg.max_input_vars} -d date.timezone=${cfg.date_timezone} -S 0.0.0.0:8080 -t /var/www/html /var/www/html/.deployigo_router.php\n`;

  let dockerEnvFlags = '';
  if (project.envVars && typeof project.envVars === 'object') {
    for (const [k, v] of Object.entries(project.envVars)) {
      dockerEnvFlags += ` -e ${k}=${shellQuote(String(v))}`;
    }
  }

  const sshCmd = `set -e; docker network create deployigo-net >/dev/null 2>&1 || true;
cat << 'EOF' > ${remoteUserIniPath}
${userIniScript}
EOF
cat << 'EOF' > ${remoteRouterPath}
${routerScript}
EOF
cat << 'EOF' > ${remoteEntrypointPath}
${entrypointScript}
EOF
sed -i 's/\r$//' ${remoteEntrypointPath}
chmod +x ${remoteEntrypointPath}
cat << 'EOF' > ${remoteDockerfile}
${dockerfileContent}
EOF
docker build -t ${imageName} -f ${remoteDockerfile} ${remotePath}
docker rm -f ${container} >/dev/null 2>&1 || true
docker run -d --name ${container} --network deployigo-net ${dockerEnvFlags} --restart unless-stopped --memory=1g --cpus=1 --pids-limit=256 -p ${port}:8080 -v ${remotePath}:/var/www/html ${imageName} sh /var/www/html/.entrypoint.sh`;
  await execFileAsync('ssh', ['-o', 'BatchMode=yes', `${user}@${host}`, sshCmd], { timeout: 600000, maxBuffer: 2 * 1024 * 1024 });
  const runtimeCheck=`ready=0; for i in $(seq 1 60); do if docker exec ${shellQuote(container)} sh -lc 'wget -q -T 3 -O /dev/null http://127.0.0.1:8080/' >/dev/null 2>&1; then ready=1; break; fi; sleep 2; done; if [ "$ready" -ne 1 ]; then docker logs --tail 35 ${shellQuote(container)} >&2; exit 1; fi`;
  try { await execFileAsync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=5',`${user}@${host}`,runtimeCheck],{timeout:155000,maxBuffer:1024*1024}); }
  catch(err){throw new Error('Container started but PHP site is not ready. Check Composer/build steps and application logs: '+String(err.stderr||err.message).slice(-750));}



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
    target.deploymentReady = true;
    target.deploymentHistory = [...(target.deploymentHistory || []).slice(-19), {at:new Date().toISOString(),state:'ready',message:`PHP ${version} deployed`}];
    target.status = project.enabled === false ? 'disabled' : 'remote';
    writeDb(db);
  }
}

async function syncGithub(projectId, repoUrl) {
  const db = readDb();
  const project = db.projects.find(item => item.id === projectId);
  if (!project) return;
  project.sourceStatus='downloading';
  project.sourceError=null;
  if(workerRequired(project)) project.deploymentReady=false;
  writeDb(db);
  validatePublicGitHubUrl(repoUrl);
  const branch = project.repoBranch || 'main';
  if (!/^[A-Za-z0-9_./-]{1,80}$/.test(branch) || branch.startsWith('-') || branch.includes('..')) throw new Error('Invalid Git branch.');
  const root = path.join(DATA_DIR, 'projects');
  fs.mkdirSync(root, { recursive: true });
  const staging = fs.mkdtempSync(path.join(root, '.git-incoming-'));
  const destination = path.join(root, projectId);
  try {
    const args = ['clone', '--depth', '1', '--single-branch', '--branch', branch, '--', repoUrl, staging];
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' };
    if(project.gitEncryptedToken){gitEnv.DIG_GIT_TOKEN=decryptGitToken(project.gitEncryptedToken);gitEnv.GIT_ASKPASS=path.join(__dirname,'git-askpass.sh');}
    await execFileAsync('git', args, { env: gitEnv, timeout: 90000, maxBuffer: 1024 * 1024 });
    const source = { ...project, deployPath: staging };
    if (!entryPoint(source)) throw new Error('Repository has no supported entry point for this project technology.');
    const backup = `${destination}.previous`;
    fs.rmSync(backup, { force: true, recursive: true });
    if (fs.existsSync(destination)) fs.renameSync(destination, backup);
    try { fs.renameSync(staging, destination); } catch (err) { if (fs.existsSync(backup)) fs.renameSync(backup, destination); throw err; }
    fs.rmSync(backup, { recursive: true, force: true });
    const updated = readDb();
    const saved = updated.projects.find(item => item.id === projectId);
    if (!saved) return;
    Object.assign(saved, { deployPath: destination, entryPoint: entryPoint({ ...project, deployPath: destination }), sourceStatus: 'ready', sourceError: null });
    saved.sourceAnalysis = analyzeSource(saved);
    writeDb(updated);
    await deployRemoteProject(saved);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}


async function api(req, res, url) {
  const db = readDb();
  const hook = url.pathname.match(/^\/api\/webhooks\/github\/([^/]+)$/);
  if (hook && req.method === 'POST') {
    const project = db.projects.find(item => item.id === hook[1] && ['github-public','oauth','private'].includes(item.sourceType) && item.autoBuild && item.webhookSecret);
    if (!project) return send(res, 404, { error: 'Webhook is not configured.' });
    const signature = String(req.headers['x-hub-signature-256'] || '');
    if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return send(res, 401, { error: 'Invalid webhook signature.' });
    const payload = await readBuffer(req);
    if (payload.length > 1024 * 1024) return send(res, 413, { error: 'Webhook payload too large.' });
    const expected = 'sha256=' + crypto.createHmac('sha256', project.webhookSecret).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return send(res, 401, { error: 'Invalid webhook signature.' });
    if (req.headers['x-github-event'] !== 'push') return send(res, 200, { ignored: 'Only push events trigger builds.' });
    let body;
    try { body = JSON.parse(payload.toString('utf8')); } catch { return send(res, 400, { error: 'Invalid webhook JSON.' }); }
    const expectedBranch = project.repoBranch || 'main';
    if (body.ref !== `refs/heads/${expectedBranch}` || body.deleted === true) return send(res, 200, { ignored: 'Push to a different branch.' });
    const repoCloneUrl = body.repository?.clone_url;
    if (typeof repoCloneUrl !== 'string' || repoCloneUrl.replace(/\.git$/, '') !== project.repoUrl.replace(/\.git$/, '')) return send(res, 400, { error: 'Webhook repository does not match project.' });
    const deliveryId = String(req.headers['x-github-delivery'] || '');
    if (!/^[0-9a-f-]{8,80}$/i.test(deliveryId)) return send(res, 400, { error: 'Invalid webhook delivery ID.' });
    if ((project.webhookDeliveries || []).includes(deliveryId)) return send(res, 200, { duplicate: true });
    project.webhookDeliveries = [...(project.webhookDeliveries || []).slice(-49), deliveryId];
    project.sourceStatus = 'downloading';
    project.sourceError = null;
    writeDb(db);
    updateAsync(project.id, () => syncGithub(project.id, project.repoUrl));
    return send(res, 202, { accepted: true, projectId: project.id, note: 'Git pull and deployment job queued.' });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signup') { const input = await readJson(req); const email = String(input.email || '').trim().toLowerCase(); if (!email || !input.password || String(input.password).length < 8) return send(res, 400, { error: 'Use an email and a password with at least 8 characters.' }); if (db.users.some(user => user.email === email)) return send(res, 409, { error: 'An account already exists for this email.' }); const user = { id: id('usr'), name: String(input.name || email.split('@')[0]).trim(), email, passwordHash: hashPassword(input.password), isAdmin: db.users.length === 0, createdAt: new Date().toISOString() }; db.users.push(user); const session = createSession(db, user.id); writeDb(db); return send(res, 201, { user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } }, { 'Set-Cookie': sessionCookie(session) }); }
  // Separate admin authentication endpoint. Normal customer accounts cannot log into the admin portal.
  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    const input = await readJson(req);
    const admin = db.users.find(item => item.email === String(input.email || '').trim().toLowerCase());
    if (!admin || admin.suspended || !validPassword(String(input.password || ''), admin.passwordHash)) return send(res, 401, { error: 'Email or password is incorrect.' });
    if (!admin.isAdmin) return send(res, 403, { error: 'This account does not have admin access.' });
    const session = createSession(db, admin.id, 'admin');
    writeDb(db);
    return send(res, 200, { user: { id: admin.id, name: admin.name, email: admin.email, isAdmin: true } }, { 'Set-Cookie': sessionCookie(session, 'admin') });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') { const input = await readJson(req); const user = db.users.find(item => item.email === String(input.email || '').trim().toLowerCase()); if (!user || user.suspended || !validPassword(String(input.password || ''), user.passwordHash)) return send(res, 401, { error: 'Email or password is incorrect.' }); const session = createSession(db, user.id); writeDb(db); return send(res, 200, { user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } }, { 'Set-Cookie': sessionCookie(session) }); }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') { delete db.sessions[cookies(req).deployigo_session]; writeDb(db); return send(res, 200, { ok: true }, { 'Set-Cookie': 'deployigo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }); }
  if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
    delete db.sessions[cookies(req).deployigo_admin_session];
    writeDb(db);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'deployigo_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  const scope = url.pathname.startsWith('/api/admin/') ? 'admin' : 'customer';
  const user = currentUser(req, db, scope); if (!user) return send(res, 401, { error: 'Login required.' });
  if (url.pathname.startsWith('/api/admin/')) {
    if (!user.isAdmin) return send(res, 403, { error: 'Admin access required.' });
    const configured = db.workers || [];
    const workers = configured.length ? configured : (serverMode() === 'remote-docker' ? [{ id: 'local-lan-worker', host: process.env.DEPLOY_REMOTE_HOST || '192.168.1.167', user: process.env.DEPLOY_REMOTE_USER || 'root' }] : []);
    if (req.method === 'GET' && url.pathname === '/api/admin/summary') {
      return send(res, 200, { stats: { users: db.users.length, projects: db.projects.length, activeProjects: db.projects.filter(p => p.enabled !== false).length, workers: workers.length, controlPlaneMemoryFree: os.freemem(), controlPlaneMemoryTotal: os.totalmem() },
        workers: workers.map(w=>({...w,assignedProjects:db.projects.filter(p=>p.remoteHost===w.host && p.deployTarget==='remote-docker').length})), projects: db.projects.map(p => ({ id: p.id, name: p.name, owner: p.owner, technology: p.technology, status: p.sourceStatus || p.status, workerId: p.workerId || null, workerHost:p.remoteHost||null, deploymentReady:!!p.deploymentReady, error:p.sourceError||null })) });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/users') {
      return send(res,200,{users:db.users.map(account=>({id:account.id,name:account.name,email:account.email,isAdmin:!!account.isAdmin,suspended:!!account.suspended,createdAt:account.createdAt,projects:db.projects.filter(p=>p.ownerId===account.id).length}))});
    }
    const manageUser=url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if(manageUser && req.method==='PATCH'){
      const account=db.users.find(item=>item.id===manageUser[1]);
      if(!account)return send(res,404,{error:'Account not found.'});
      if(account.id===user.id)return send(res,409,{error:'You cannot suspend your current administrator account.'});
      const body=await readJson(req);
      if(typeof body.suspended!=='boolean')return send(res,400,{error:'Provide suspended: true or false.'});
      if(account.isAdmin)return send(res,409,{error:'Admin accounts must not be suspended using the prototype console.'});
      account.suspended=body.suspended;
      if(account.suspended)for(const token of Object.keys(db.sessions))if(db.sessions[token].userId===account.id)delete db.sessions[token];
      writeDb(db);
      return send(res,200,{ok:true,user:{id:account.id,suspended:account.suspended}});
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/projects') {
      return send(res,200,{projects:db.projects.map(p=>({id:p.id,name:p.name,owner:p.owner,technology:p.technology,sourceType:p.sourceType,sourceStatus:p.sourceStatus,deploymentReady:!!p.deploymentReady,workerId:p.workerId||null,remoteHost:p.remoteHost||null,createdAt:p.createdAt,error:p.sourceError||null}))});
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/workers') return send(res, 200, { workers, note: 'Worker capacity is unknown until an explicit health check is requested.' });
    if (req.method === 'POST' && url.pathname === '/api/admin/workers') {
      const input = await readJson(req);
      const host = String(input.host || '').trim();
      const sshUser = String(input.user || 'deployigo').trim();
      if (!/^[a-zA-Z0-9.-]{1,200}$/.test(host) || !/^[a-z_][a-z0-9_-]{0,31}$/.test(sshUser)) return send(res, 400, { error: 'Valid worker host and SSH username required.' });
      if (!db.workers) db.workers = [];
      if (db.workers.some(worker => worker.host === host)) return send(res, 409, { error: 'Worker already registered.' });
      const worker = { id: id('wrk'), host, user: sshUser, addedAt: new Date().toISOString(), status: 'not-checked' };
      db.workers.push(worker); writeDb(db);
      return send(res, 201, { worker });
    }
    const workerRoute = url.pathname.match(/^\/api\/admin\/workers\/([^/]+)$/);
    if (workerRoute && req.method === 'DELETE') {
      const worker = (db.workers || []).find(item => item.id === workerRoute[1]);
      if (!worker) return send(res, 404, { error: 'Worker not found.' });
      if (db.projects.some(project => project.workerId === worker.id || (project.deployTarget === 'remote-docker' && project.remoteHost === worker.host))) return send(res, 409, { error: 'Worker has projects. Drain and migrate before removal.' });
      db.workers.splice(db.workers.indexOf(worker), 1); writeDb(db);
      return send(res, 200, { ok: true });
    }
    const healthRoute = url.pathname.match(/^\/api\/admin\/workers\/([^/]+)\/health$/);
    if (healthRoute && req.method === 'GET') {
      const worker = workers.find(item => item.id === healthRoute[1]);
      if (!worker) return send(res, 404, { error: 'Worker not found.' });
      const health = await checkWorkerServer(worker.host, worker.user);
      if (!health.ok) return send(res, 503, health);
      try {
        const command = `free -b | awk 'NR==2 {print $2, $3, $7}'; df -B1 / | awk 'NR==2 {print $2, $3, $4}'; nproc; cut -d ' ' -f1-3 /proc/loadavg; docker ps --format '{{.ID}}' | wc -l`;
        const { stdout } = await execFileAsync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=4', `${worker.user}@${worker.host}`, command], { timeout: 8000 });
        const lines = stdout.trim().split('\n').map(line => line.trim().split(/\s+/));
        const [memory, disk, cpus, load, containers] = lines;
        const metrics = { memoryTotalBytes: Number(memory?.[0]), memoryUsedBytes: Number(memory?.[1]), memoryAvailableBytes: Number(memory?.[2]),
          diskTotalBytes: Number(disk?.[0]), diskUsedBytes: Number(disk?.[1]), diskFreeBytes: Number(disk?.[2]),
          cpuCores: Number(cpus?.[0]), loadAverage1m: Number(load?.[0]), loadAverage5m: Number(load?.[1]), loadAverage15m: Number(load?.[2]), runningContainers: Number(containers?.[0]) };
        if (Object.values(metrics).some(value => !Number.isFinite(value))) throw new Error('Invalid worker metrics');
        return send(res, 200, { ...health, metrics, note: 'Worker-wide RAM and disk capacity. CPU load is the 1/5/15-minute load average, NOT CPU usage percent.' });
      } catch { return send(res, 503, { ok: false, error: 'Worker responsive but resource metrics unavailable.' }); }
    }
    return send(res, 404, { error: 'Admin API not implemented.' });
  }
  if (req.method === 'POST' && url.pathname === '/api/projects/blank') {
    const input = await readJson(req);
    const rawName = String(input.name || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,60}$/.test(rawName)) return send(res, 400, { error: 'Project name can contain letters, numbers, hyphens, and underscores (2-60 characters).' });
    const name = rawName.toLowerCase();

    if (db.projects.some(item => item.ownerId === user.id && item.name === name)) return send(res, 409, { error: 'A project with this name already exists.' });
    const host = process.env.DEPLOY_REMOTE_HOST || '192.168.1.167';
    const remoteUser = process.env.DEPLOY_REMOTE_USER || 'root';

    const serverCheck = serverMode() === 'remote-docker' ? await checkWorkerServer(host, remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const prjId = id('prj');
    const port = allocatePort(db, host);
    const project = localProject({
      id: prjId,
      ownerId: user.id,
      owner: user.email,
      name,
      sourceType: normalizeTechnology(input.technology) === 'HTML' ? 'blank-html' : 'blank-php',
      sourceStatus: 'creating',
      technology: normalizeTechnology(input.technology),
      phpVersion: parseVersion(input.phpVersion || '8.5'),
      deployTarget: serverMode(),
      createdAt: new Date().toISOString(),
      remoteHost: host,
      remoteUser: remoteUser,
      remotePort: port,
      remotePath: `/opt/deployigo/workspaces/default/${prjId}`,
      remoteContainer: `deployigo-${prjId}`,
      url: `http://${host}:${port}/`
    });
    if (normalizeTechnology(input.technology) === 'HTML' && input.initialHtml !== undefined) {
      if (typeof input.initialHtml !== 'string' || Buffer.byteLength(input.initialHtml) > 256 * 1024) return send(res, 400, { error: 'HTML source must be text under 256 KB.' });
      project.initialHtml = input.initialHtml;
    }
    await createBlankProject(project);
    if(workerRequired(project)) { project.sourceStatus = 'deploying'; project.deploymentReady = false; }
    db.projects.push(project);
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 201, { project: projectResponse(project) });
  }
  if (req.method === 'DELETE' && url.pathname.match(/^\/api\/projects\/([^/]+)$/)) {
    const projectId = url.pathname.split('/')[3];
    const project = db.projects.find(item => item.id === projectId && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    try {
      if (workerRequired(project)) await removeRemoteProject(project);
    } catch (e) {
      return send(res, 500, { error: `Worker server error while removing project container: ${e.message}. Please contact support.`, serverDown: true });
    }

    const index = db.projects.findIndex(item => item.id === project.id);
    if (index !== -1) db.projects.splice(index, 1);
    try { fs.rmSync(path.join(DATA_DIR, 'projects', project.id), { recursive: true, force: true }); } catch(e) {}
    writeDb(db);
    return send(res, 200, { ok: true, message: 'Project deleted.' });
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/projects\/([^/]+)\/logs$/)) {
    const projectId = url.pathname.split('/')[3];
    const project = db.projects.find(item => item.id === projectId && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    if (!workerRequired(project)) return send(res, 409, { error: 'Docker logs require a Docker worker. Local previews do not have container logs.' });
    const host = project.remoteHost || '192.168.1.167';
    const remoteUser = project.remoteUser || 'root';
    const container = project.remoteContainer || `deployigo-${project.id}`;

    try {
      const { stdout, stderr } = await execFileAsync('ssh', ['-o', 'BatchMode=yes', `${remoteUser}@${host}`, `docker logs --tail 200 ${container}`]);
      return send(res, 200, { logs: stdout || stderr || 'No container logs found.' });
    } catch (err) {
      return send(res, 200, { logs: err.stdout || err.stderr || err.message || 'Container not running or logs unavailable.' });
    }
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/projects\/([^/]+)\/composer$/)) {
    const projectId = url.pathname.split('/')[3];
    const project = db.projects.find(item => item.id === projectId && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    if (!workerRequired(project)) return send(res, 409, { error: 'Composer commands require a running Docker worker.' });
    if (project.technology !== 'PHP') return send(res, 409, { error: 'Composer applies to PHP projects only.' });
    const host = project.remoteHost || '192.168.1.167';
    const remoteUser = project.remoteUser || 'root';
    const serverCheck = serverMode() === 'remote-docker' ? await checkWorkerServer(host, remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const container = project.remoteContainer || `deployigo-${project.id}`;

    try {
      const { stdout, stderr } = await execFileAsync('ssh', ['-o', 'BatchMode=yes', `${remoteUser}@${host}`, `docker exec ${container} composer install --no-dev --no-interaction --optimize-autoloader --working-dir=/var/www/html`]);
      return send(res, 200, { ok: true, output: stdout || stderr || 'Composer dependencies updated successfully.' });
    } catch (err) {
      return send(res, 500, { error: err.stdout || err.stderr || err.message || 'Composer install failed.' });
    }
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/projects\/([^/]+)\/redeploy$/)) {
    const projectId = url.pathname.split('/')[3];
    const project = db.projects.find(item => item.id === projectId && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });
    if (project.deploymentMode !== 'remote-docker') return send(res, 400, { error: 'This project is not deployed remotely.' });

    const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    project.sourceStatus = 'redeploying';
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 202, { project: projectResponse(project), message: `Remote Docker redeploy started with PHP ${project.phpVersion}.` });
  }

  const configureHook = url.pathname.match(/^\/api\/projects\/([^/]+)\/webhook\/configure$/);
  if (configureHook && req.method === 'POST') {
    const project = db.projects.find(item => item.id === configureHook[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });
    if (!['github-public','oauth','private'].includes(project.sourceType)) return send(res, 409, { error: 'Push webhooks require a GitHub repository project.' });
    project.autoBuild = true;
    project.webhookSecret = crypto.randomBytes(32).toString('hex');
    project.webhookDeliveries = [];
    writeDb(db);
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, { path: `/api/webhooks/github/${project.id}`, secret: project.webhookSecret,
      instructions: 'In GitHub repository Settings → Webhooks, add your externally reachable control-plane URL plus path, set JSON content type and the secret. Only pushes to the configured branch trigger builds. Local LAN IPs cannot receive public GitHub webhooks without a secure ingress.' });
  }
  const consoleRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/terminal\/exec$/);
  if (consoleRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === consoleRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });
    if (!workerRequired(project)) return send(res, 409, { error: 'The command console requires a running Docker worker; local-preview mode has no project container.' });
    if (project.enabled === false) return send(res, 409, { error: 'Start this project before opening the command console.' });
    const input = await readJson(req);
    const command = String(input.command || '').trim();
    if (!command || command.length > 500 || /[\r\n\0]/.test(command)) return send(res, 400, { error: 'Enter a single command of up to 500 characters.' });
    if (project.deploymentReady !== true) return send(res, 409, { error: project.sourceStatus === 'error' ? (project.sourceError || 'Deployment failed.') : 'Project deployment is not ready. Wait until the status shows Running.' });
    const container = `deployigo-${project.id}`;
    const workdir = project.technology === 'HTML' ? '/usr/share/nginx/html' : '/var/www/html';
    const remote = `docker exec -w ${shellQuote(workdir)} ${shellQuote(container)} sh -lc ${shellQuote(command)}`;
    try {
      const { stdout, stderr } = await execFileAsync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', `${project.remoteUser}@${project.remoteHost}`, remote], { timeout: 20000, maxBuffer: 64 * 1024 });
      return send(res, 200, { exitCode: 0, output: (stdout + stderr).slice(0, 65536) });
    } catch (error) {
      return send(res, 200, { exitCode: typeof error.code === 'number' ? error.code : 1, output: String(error.stdout || '') + String(error.stderr || error.message || 'Command failed') });
    }
  }
  const runtimeRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/runtime$/);
  if (runtimeRoute && req.method === 'GET') {
    const project = db.projects.find(item => item.id === runtimeRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });
    if (!workerRequired(project)) return send(res, 409, { error: 'Runtime verification requires a running Docker worker.' });
    const command = `docker exec ${shellQuote('deployigo-' + project.id)} sh -lc ${shellQuote('php -v && php -m && composer --version')}`;
    try {
      const { stdout, stderr } = await execFileAsync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', `${project.remoteUser}@${project.remoteHost}`, command], { timeout: 15000, maxBuffer: 1024 * 1024 });
      return send(res, 200, { verified: true, reportedPhpVersion: project.phpVersion, output: stdout + stderr });
    } catch (error) { return send(res, 503, { verified: false, error: 'Runtime verification failed: ' + String(error.stderr || error.message).slice(0, 700) }); }
  }
  const inspectRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/inspect$/);
  if (inspectRoute && req.method === 'GET') {
    const project = db.projects.find(item => item.id === inspectRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });
    return send(res, 200, { technology: project.technology, phpVersion: project.technology === 'PHP' ? project.phpVersion : null,
      entryPoint: entryPoint(project), sourceAnalysis: analyzeSource(project), status: project.sourceStatus, error: project.sourceError || null,
      runtimeVerification: 'Not executed. PHP extension availability and composer success require worker-side checks.' });
  }
  if (req.method === 'GET' && url.pathname === '/api/me') {
    const projects = db.projects.filter(item => item.ownerId === user.id);
    let totalStorageBytes = 0;

    for (const project of projects) {
      // Failed git sources must be retried explicitly, not on each dashboard refresh.
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
      user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin === true },
      projects: projects.map(projectResponse),
      workspaceStats: {
        totalStorageBytes,
        maxStorageBytes: 5 * 1024 * 1024 * 1024,
        activeRam: '1 GB',
        vCpu: '1 vCPU'
      }
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/projects') {
    const type = req.headers['content-type'] || '';
    const upload = type.startsWith('multipart/form-data') ? parseMultipart(await readBuffer(req), type) : { fields: await readJson(req), file: null };
    const input = upload.fields;
    const rawName = String(input.name || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,60}$/.test(rawName)) return send(res, 400, { error: 'Project name can contain letters, numbers, hyphens, and underscores (2-60 characters).' });
    const name = rawName.toLowerCase();

    const sourceType = (input.sourceType === 'oauth' || input.sourceType === 'private' || input.sourceType === 'github-public' || input.sourceType === 'github') ? (input.sourceType === 'github' ? 'github-public' : input.sourceType) : 'zip';
    const repoUrl = String(input.repoUrl || '').trim();

    if (db.projects.some(item => item.ownerId === user.id && item.name === name)) return send(res, 409, { error: 'A project with this name already exists.' });
    if ((sourceType === 'github-public' || sourceType === 'oauth' || sourceType === 'private') && !repoUrl) return send(res, 400, { error: 'Enter a valid repository URL.' });
    if (sourceType === 'zip' && (!upload.file || !upload.file.filename.toLowerCase().endsWith('.zip'))) return send(res, 400, { error: 'Choose a ZIP file before creating the project.' });
    let gitToken = null;
    if(sourceType==='oauth') {
      if(input.provider !== 'github') return send(res,501,{error:'Currently only GitHub OAuth is implemented.'});
      const grant=oauthGrants.get(String(input.oauthGrant||''));
      if(!grant || grant.userId!==user.id || grant.expiresAt<Date.now() || !grant.repos.includes(repoUrl)) return send(res,403,{error:'GitHub authorization expired or repository not authorized. Reconnect your account.'});
      gitToken=grant.token;
    }
    if(sourceType==='private') {
      if(input.provider!=='github') return send(res,501,{error:'Only GitHub personal access tokens are supported currently.'});
      gitToken=String(input.repoToken || '');
      if(gitToken.length<10 || gitToken.length>512) return send(res,400,{error:'Valid GitHub access token required.'});
    }
    if(gitToken && !gitEncryptionKey()) return send(res,409,{error:'Add GIT_TOKEN_ENCRYPTION_KEY (32 random bytes encoded as 64 hex characters) to your local .env and restart services to enable private repository connections.'});
    if (sourceType === 'github-public' || sourceType === 'oauth' || sourceType === 'private') {
      validatePublicGitHubUrl(repoUrl);
      const branch = String(input.repoBranch || 'main');
      if (!/^[a-zA-Z0-9_./-]{1,80}$/.test(branch) || branch.startsWith('-') || branch.includes('..')) return send(res, 400, { error: 'Invalid Git branch.' });
    }

    const host = process.env.DEPLOY_REMOTE_HOST || '192.168.1.167';
    const remoteUser = process.env.DEPLOY_REMOTE_USER || 'root';

    const serverCheck = serverMode() === 'remote-docker' ? await checkWorkerServer(host, remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const prjId = id('prj');
    const port = allocatePort(db, host);

    const project = localProject({
      id: prjId,
      ownerId: user.id,
      owner: user.email,
      name,
      sourceType,
      repoUrl: repoUrl || null,
      repoBranch: String(input.repoBranch || 'main'),
      autoBuild: input.autoBuild === 'true' || input.autoBuild === true,
      deployTarget: serverMode(),
      sourceStatus: (sourceType === 'github-public' || sourceType === 'oauth' || sourceType === 'private') ? 'downloading' : 'extracting',
      technology: normalizeTechnology(input.technology),
      phpVersion: parseVersion(input.phpVersion || '8.5'),
      createdAt: new Date().toISOString(),
      remoteHost: host,
      remoteUser: remoteUser,
      remotePort: port,
      remotePath: `/opt/deployigo/workspaces/default/${prjId}`,
      remoteContainer: `deployigo-${prjId}`,
      url: `http://${host}:${port}/`
    });
    if(gitToken) project.gitEncryptedToken=encryptGitToken(gitToken);
    if(sourceType==='oauth') oauthGrants.delete(String(input.oauthGrant||''));
    db.projects.push(project);
    writeDb(db);
    if (['github-public','oauth','private'].includes(sourceType)) updateAsync(project.id, () => syncGithub(project.id, repoUrl));
    else updateAsync(project.id, async () => {
      const latest = readDb().projects.find(item => item.id === project.id);
      await extractZip(latest, upload.file.buffer);
      if(workerRequired(latest)) { latest.sourceStatus='deploying'; latest.deploymentReady=false; }
      const updated = readDb();
      Object.assign(updated.projects.find(item => item.id === project.id), latest);
      writeDb(updated);
      await deployRemoteProject(latest);
    });
    return send(res, 201, { project: projectResponse(project) });
  }

  const fileRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/files(?:\/(upload|folder))?$/);
  if (fileRoute) {
    const project = db.projects.find(item => item.id === fileRoute[1] && item.ownerId === user.id);
    if (!project || !project.deployPath) return send(res, 404, { error: 'Project files are not available yet.' });

    if (req.method === 'PUT' || (req.method === 'POST' && fileRoute[2]) || req.method === 'DELETE') {
      const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
      if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });
    }

    const requestedPath = String(url.searchParams.get('path') || '').replaceAll('\\', '/');
    const root = path.resolve(project.deployPath);
    const resolveProjectPath = relative => {
      if (!relative || relative.startsWith('/') || relative.split('/').includes('..') || relative.split('/').includes('.deployigo-source.zip')) return null;
      const target = path.resolve(root, relative);
      return (target === root || target.startsWith(`${root}${path.sep}`)) ? target : null;
    };
    if (req.method === 'GET' && !requestedPath && !url.pathname.endsWith('/upload')) { const files = []; const walk = directory => { for (const name of fs.readdirSync(directory)) { if (name === '.deployigo-source.zip' || name.startsWith('.')) continue; const target = path.join(directory, name); const relative = path.relative(root, target).replaceAll(path.sep, '/'); if (fs.statSync(target).isDirectory()) { files.push({ path: relative, type: 'folder' }); walk(target); } else files.push({ path: relative, type: 'file', size: fs.statSync(target).size }); } }; walk(root); return send(res, 200, { files }); }
    if (req.method === 'GET') { const target = resolveProjectPath(requestedPath); if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) return send(res, 404, { error: 'File not found.' }); if (fs.statSync(target).size > 2 * 1024 * 1024) return send(res, 400, { error: 'File is too large to edit in the browser.' }); return send(res, 200, { path: requestedPath, content: fs.readFileSync(target, 'utf8') }); }
    if (req.method === 'PUT') { const target = resolveProjectPath(requestedPath); if (!target) return send(res, 400, { error: 'Invalid file path.' }); const input = await readJson(req); if (typeof input.content !== 'string' || input.content.length > 2 * 1024 * 1024) return send(res, 400, { error: 'Text content must be under 2 MB.' }); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, input.content); project.entryPoint = entryPoint(project); project.previewStatus = project.entryPoint ? 'available' : 'no-entry-point'; writeDb(db); updateAsync(project.id, () => deployRemoteProject(project)); return send(res, 200, { ok: true, path: requestedPath }); }
    if (req.method === 'POST' && fileRoute[2] === 'folder') { const input = await readJson(req); const folderName = String(input.name || '').trim(); const parentPath = String(input.parent || requestedPath || '').replaceAll('\\', '/'); const targetPath = parentPath ? `${parentPath}/${folderName}` : folderName; const target = resolveProjectPath(targetPath); if (!target || !/^[^/\\.][^/\\]*$/.test(folderName)) return send(res, 400, { error: 'Enter a valid folder name.' }); if (fs.existsSync(target)) return send(res, 409, { error: 'That folder already exists.' }); fs.mkdirSync(target, { recursive: true }); updateAsync(project.id, () => deployRemoteProject(project)); return send(res, 201, { ok: true, path: path.relative(root, target).replaceAll(path.sep, '/') }); }
    if (req.method === 'DELETE') {
      const target = resolveProjectPath(requestedPath);
      if (!target || !fs.existsSync(target)) return send(res, 404, { error: 'Item not found.' });
      fs.rmSync(target, { recursive: true, force: true });
      project.entryPoint = entryPoint(project);
      project.previewStatus = project.entryPoint ? 'available' : 'no-entry-point';
      writeDb(db);
      updateAsync(project.id, () => deployRemoteProject(project));
      return send(res, 200, { ok: true, message: 'Item deleted.' });
    }
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

    const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    if (project.technology === 'HTML') return send(res, 409, { error: 'PHP settings are not applicable to HTML projects.' });
    const input = await readJson(req);
    const FORBIDDEN_KEYS = ['disable_functions', 'open_basedir', 'allow_url_include', 'auto_prepend_file', 'auto_append_file', 'extension', 'zend_extension', 'exec', 'passthru', 'system', 'shell_exec'];
    const checkKeys = input.phpSettings || input;
    if (Object.keys(checkKeys).some(key => FORBIDDEN_KEYS.includes(key.toLowerCase()))) {
      return send(res, 400, { error: 'Security Violation: System security directives (such as disable_functions or open_basedir) are permanently locked for container security.' });
    }
    project.phpSettings = sanitizePhpSettings(checkKeys);
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project: projectResponse(project), message: 'PHP directives updated successfully.' });
  }

  const phpModulesRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/php-modules$/);
  if (phpModulesRoute && (req.method === 'PATCH' || req.method === 'POST')) {
    const project = db.projects.find(item => item.id === phpModulesRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });
    if (project.technology === 'HTML') return send(res, 409, { error: 'PHP extensions do not apply to HTML projects.' });

    const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const input = await readJson(req);
    project.phpModules = sanitizePhpModules(input.phpModules || input, project.phpModules);
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project: projectResponse(project), message: 'PHP modules updated successfully.' });
  }

  const dbRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/database$/);
  if (dbRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === dbRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });
    if (!workerRequired(project)) return send(res, 409, { error: 'Database provisioning requires a connected Docker worker. Local preview mode does not provide managed databases.' });
    if (project.technology === 'HTML') return send(res, 409, {error:'A static HTML project cannot connect to a database directly. Use a PHP/backend project for database-driven functionality.'});

    const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const input = await readJson(req);
    if (project.database) return send(res, 409, { error: 'A database is already attached. Use Rotate Password to update its credentials. To change engine/name/user, plan a database migration first.' });
    const mode = input.mode === 'existing' ? 'existing' : 'new';
    const dbType = String(input.type || 'mysql').toLowerCase();
    const version = String(input.version || (dbType === 'postgres' ? '17' : '8')).trim();
    const dbName = String(input.dbName || project.name.replace(/[^a-zA-Z0-9_]/g, '_')).trim();
    const dbUser = String(input.dbUser || 'app_user').trim();
    const dbPassword = String(input.dbPassword || crypto.randomBytes(24).toString('base64url')).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(dbName) || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(dbUser) || !dbPassword || /[\r\n]/.test(dbPassword)) return send(res, 400, { error: 'Invalid database name, username or password.' });
    if (!['mysql', 'postgres'].includes(dbType)) return send(res, 501, { error: 'Database engine is not implemented.' });
    if (mode === 'new' && !(dbType === 'mysql' ? ['8', '5.7', '9'].includes(version) : ['17','18'].includes(version))) return send(res, 400, { error: 'Unsupported database version.' });
    const dbHost = mode === 'existing' ? (input.host || '192.168.1.167') : `deployigo-db-${project.id}`;
    const dbPort = Number(input.dbPort || (dbType === 'postgres' ? 5432 : 3306));

    project.database = { mode, type: dbType, version, dbName, dbUser, dbPassword, host: dbHost, dbPort, isExternal: mode === 'existing' };

    if (input.autoInjectEnv !== false) {
      if (!project.envVars) project.envVars = {};
      project.envVars.DB_HOST = dbHost;
      project.envVars.DB_PORT = String(dbPort);
      project.envVars.DB_DATABASE = dbName;
      project.envVars.DB_USERNAME = dbUser;
      project.envVars.DB_PASSWORD = dbPassword;
      project.envVars.DATABASE_URL = dbType === 'postgres' ? `postgres://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}` : `mysql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${dbHost}:${dbPort}/${dbName}`;
    }

    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 202, { project: projectResponse(project), message: mode === 'existing' ? 'Existing database settings saved. Redeploy queued.' : 'Database provisioning queued. Check project status before using credentials.' });
  }

  // Database inspection: credentials are only revealed via an explicit authenticated request.
  const dbDetails = url.pathname.match(/^\/api\/projects\/([^/]+)\/database\/details$/);
  if (dbDetails && req.method === 'GET') {
    const project = db.projects.find(p => p.id === dbDetails[1] && p.ownerId === user.id);
    if (!project || !project.database) return send(res, 404, {error:'No database attached to this project.'});
    res.setHeader('Cache-Control','no-store');
    const d=project.database;
    return send(res, 200, {database:{type:d.type,version:d.version,dbName:d.dbName,dbUser:d.dbUser,dbPassword:d.dbPassword,host:d.host,port:d.dbPort,remoteAccess:d.isExternal === true ? 'This is an existing external database; external access depends on its own network configuration.' : 'Private Docker network only. Remote access is NOT enabled. Do not use the worker IP as the DB host from outside Docker.',isExternal:!!d.isExternal},environmentInjected:!!project.envVars?.DB_HOST});
  }
  const dbPasswordRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/database\/rotate-password$/);
  if(dbPasswordRoute && req.method === 'POST') {
    const project=db.projects.find(p=>p.id===dbPasswordRoute[1] && p.ownerId===user.id);
    if(!project || !project.database) return send(res,404,{error:'Managed database not found.'});
    if(project.database.isExternal) return send(res,409,{error:'Change external DB passwords at your external DB provider first.'});
    if(project.deploymentReady !== true) return send(res,409,{error:'Finish deployment before rotating database password.'});
    const body=await readJson(req);
    const password=String(body.password || crypto.randomBytes(24).toString('base64url'));
    if(password.length < 12 || password.length > 128 || !/^[A-Za-z0-9_!@#$%^&*+=.,:?-]+$/.test(password)) return send(res,400,{error:'Password must be 12–128 characters: letters, digits, and supported symbols (no quotes, slash or whitespace).'});
    const d=project.database, dbContainer=`deployigo-db-${project.id}`;
    const safeIdentifier=/^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
    if(!safeIdentifier.test(d.dbUser)) return send(res,400,{error:'Unsupported database user name.'});
    const sql=d.type === 'mysql' ? `ALTER USER '${d.dbUser}'@'%' IDENTIFIED BY '${password}';` : `ALTER ROLE "${d.dbUser}" WITH PASSWORD '${password}';`;
    // Send the ALTER statement over SSH stdin, not as shell arguments or in logs.
    const inner=d.type === 'mysql'
      ? 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot'
      : 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1';
    const remote=`docker exec -i ${shellQuote(dbContainer)} sh -lc ${shellQuote(inner)}`;
    try {await sshWithInput(project,remote,sql+'\n',{timeout:30000,maxBuffer:512*1024});}
    catch {return send(res,503,{error:'Database rejected the password update. Credentials were not changed in Deployigo.'});}
    d.dbPassword=password;
    if(project.envVars){project.envVars.DB_PASSWORD=password;project.envVars.DATABASE_URL=d.type==='postgres'?`postgres://${encodeURIComponent(d.dbUser)}:${encodeURIComponent(password)}@${d.host}:${d.dbPort}/${d.dbName}`:`mysql://${encodeURIComponent(d.dbUser)}:${encodeURIComponent(password)}@${d.host}:${d.dbPort}/${d.dbName}`;}
    writeDb(db);
    updateAsync(project.id,()=>deployRemoteProject(project));
    return send(res,202,{ok:true,message:'Password updated in database. Application restart queued to update ENV.'});
  }
  const dbTables = url.pathname.match(/^\/api\/projects\/([^/]+)\/database\/tables$/);
  const dbRows = url.pathname.match(/^\/api\/projects\/([^/]+)\/database\/rows$/);
  if ((dbTables||dbRows) && req.method==='GET') {
    const project=db.projects.find(p=>p.id===(dbTables||dbRows)[1] && p.ownerId===user.id);
    if(!project || !project.database) return send(res,404,{error:'Database not configured.'});
    const d=project.database;
    if(d.isExternal) return send(res,409,{error:'Built-in browser currently supports managed databases only.'});
    if(!project.deploymentReady) return send(res,409,{error:'Database is deploying. Try again after it is ready.'});
    const table=url.searchParams.get('table')||'';
    if(dbRows && !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(table)) return send(res,400,{error:'Invalid table name.'});
    const dbContainer=`deployigo-db-${project.id}`;
    let inner;
    if(d.type==='postgres') {
      const sql=dbTables?`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`: `SELECT COALESCE(json_agg(t),'[]'::json)::text FROM (SELECT * FROM "${table}" LIMIT 50) t`;
      inner=`psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c ${shellQuote(sql)}`;
    } else {
      const sql=dbTables?'SHOW TABLES':`SELECT * FROM \`${table}\` LIMIT 50`;
      inner=`read -r DB_PW; MYSQL_PWD="$DB_PW" mysql -u "$MYSQL_USER" -D "$MYSQL_DATABASE" --batch --raw ${dbTables?'-N ':''}-e ${shellQuote(sql)}`;
    }
    try {
      const command=`docker exec ${d.type==='mysql'?'-i ':''}${shellQuote(dbContainer)} sh -lc ${shellQuote(inner)}`;
      const {stdout}= d.type==='mysql'?await sshWithInput(project,command,d.dbPassword+'\n',{timeout:20000,maxBuffer:1024*1024}):await execFileAsync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=5',`${project.remoteUser}@${project.remoteHost}`,command],{timeout:20000,maxBuffer:1024*1024});
      if(dbTables) return send(res,200,{tables:stdout.trim().split(/\r?\n/).filter(Boolean)});
      if(d.type==='postgres') return send(res,200,{table,rows:JSON.parse(stdout.trim()||'[]')});
      const lines=stdout.trim().split(/\r?\n/).filter(Boolean).map(x=>x.split('\t'));
      const columns=lines.shift()||[];
      return send(res,200,{table,columns,rows:lines.map(fields=>Object.fromEntries(columns.map((name,i)=>[name,fields[i]??null]))),warning:'Text preview only, maximum 50 rows.'});
    } catch(error) {return send(res,503,{error:'Database query failed. The database may still be initializing, the table may not exist, or the worker is unavailable.'});}
  }

  const dbSqlRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/database\/(export|import)$/);
  if(dbSqlRoute && ['GET','POST'].includes(req.method)) {
    const project=db.projects.find(p=>p.id===dbSqlRoute[1] && p.ownerId===user.id);
    if(!project || !project.database) return send(res,404,{error:'No database configured.'});
    if(project.database.isExternal) return send(res,409,{error:'Import/export currently supports only managed databases.'});
    if(!project.deploymentReady) return send(res,409,{error:'Deployment must complete before SQL import/export.'});
    const d=project.database, dbContainer=`deployigo-db-${project.id}`;
    const command=d.type==='postgres'
      ? (dbSqlRoute[2]==='export' ? 'pg_dump -U "$POSTGRES_USER" --no-owner --no-acl "$POSTGRES_DB"' : 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"')
      : (dbSqlRoute[2]==='export' ? 'read -r DB_PW; MYSQL_PWD="$DB_PW" mysqldump --single-transaction --no-tablespaces -u "$MYSQL_USER" "$MYSQL_DATABASE"' : 'read -r DB_PW; MYSQL_PWD="$DB_PW" mysql -u "$MYSQL_USER" "$MYSQL_DATABASE"');
    const remote=`docker exec ${(dbSqlRoute[2]==='import'||d.type==='mysql')?'-i ':''}${shellQuote(dbContainer)} sh -lc ${shellQuote(command)}`;
    if(dbSqlRoute[2]==='export' && req.method==='GET'){
      try{const {stdout}=d.type==='mysql'?await sshWithInput(project,remote,d.dbPassword+'\n',{timeout:40000}):await execFileAsync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=5',`${project.remoteUser}@${project.remoteHost}`,remote],{timeout:40000,maxBuffer:4*1024*1024});
        res.setHeader('Cache-Control','no-store');return send(res,200,{name:d.dbName+'.sql',sql:stdout});}
      catch{return send(res,503,{error:'Database export failed or exceeded the 4 MB browser-export limit. Use a native backup tool for large databases.'});}
    }
    if(dbSqlRoute[2]==='import' && req.method==='POST') {
      const body=await readJson(req); const sql=body.sql;
      if(typeof sql!=='string' || !sql.trim() || Buffer.byteLength(sql)>1024*1024) return send(res,400,{error:'Provide a valid SQL text file under 1 MB.'});
      try{
        const {stdout}=await sshWithInput(project,remote,(d.type==='mysql'?d.dbPassword+'\n':'')+sql,{timeout:40000,maxBuffer:128*1024});
        return send(res,200,{ok:true,message:'SQL import completed.',output:stdout.slice(0,3000)});
      }
      catch{return send(res,503,{error:'Database import failed. Review your SQL file and database schema.'});}
    }
    return send(res,405,{error:'Method not allowed.'});
  }

  const envRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/env$/);
  if (envRoute && req.method === 'GET') {
    const project = db.projects.find(item => item.id === envRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, { envVars: project.envVars || {} });
  }

  if (envRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === envRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const input = await readJson(req);
    if (!input.envVars || typeof input.envVars !== 'object' || Array.isArray(input.envVars) || Object.keys(input.envVars).length > 100) return send(res, 400, { error: 'Invalid environment variables.' });
    if (Object.entries(input.envVars).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(key) || typeof value !== 'string' || value.length > 4096 || /[\r\n]/.test(value))) return send(res, 400, { error: 'Environment keys must be valid and values must be single-line strings.' });
    if(project.database && !project.database.isExternal && project.envVars) {
      for (const key of ['DB_HOST','DB_PORT','DB_DATABASE','DB_USERNAME','DB_PASSWORD','DATABASE_URL']) {
        if(Object.prototype.hasOwnProperty.call(project.envVars,key)) input.envVars[key]=project.envVars[key];
      }
    }
    project.envVars = input.envVars;
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project: projectResponse(project), message: 'Environment variables saved.' });
  }

  const cicdRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/cicd$/);
  if (cicdRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === cicdRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const input = await readJson(req);
    if (!Array.isArray(input.buildSteps) || input.buildSteps.length > 20 || input.buildSteps.some(step => typeof step !== 'string' || step.length > 500 || /[\r\n]/.test(step))) return send(res, 400, { error: 'Provide at most 20 single-line build commands, max 500 chars each.' });
    project.buildSteps = input.buildSteps;
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project: projectResponse(project), message: 'CI/CD build steps saved.' });
  }

  const restartRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/restart$/);
  if (restartRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === restartRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    if (!workerRequired(project)) return send(res, 409, { error: 'Restart requires a Docker container, not local preview mode.' });
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 202, { project: projectResponse(project), message: 'Restart requested.' });
  }

  const maintenanceRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/maintenance$/);
  if (maintenanceRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === maintenanceRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    project.maintenance = !project.maintenance;
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project: projectResponse(project) });
  }

  const action = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(rebuild|toggle))?$/);
  if (action) {
    const project = db.projects.find(item => item.id === action[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = workerRequired(project) ? await checkWorkerServer(project.remoteHost, project.remoteUser) : { ok: true };
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    if (req.method === 'PATCH') {
      const input = await readJson(req);
      if (input.phpSettings) {
        const FORBIDDEN_KEYS = ['disable_functions', 'open_basedir', 'allow_url_include', 'auto_prepend_file', 'auto_append_file', 'extension', 'zend_extension', 'exec', 'passthru', 'system', 'shell_exec'];
        if (Object.keys(input.phpSettings).some(key => FORBIDDEN_KEYS.includes(key.toLowerCase()))) {
          return send(res, 400, { error: 'Security Violation: System security directives are locked for container security.' });
        }
        project.phpSettings = sanitizePhpSettings(input.phpSettings);
      }
      if (input.phpModules) {
        project.phpModules = sanitizePhpModules(input.phpModules);
      }
      if (input.name !== undefined) {
        const name = String(input.name || '').trim().toLowerCase();
        if (!/^[a-z0-9-]{3,40}$/.test(name)) return send(res, 400, { error: 'Invalid project name.' });
        if (db.projects.some(item => item.ownerId === user.id && item.id !== project.id && item.name === name)) return send(res, 409, { error: 'A project with this name already exists.' });
        project.name = name;
        project.url = project.deploymentMode === 'remote-docker' ? `http://${project.remoteHost}:${project.remotePort}/` : `http://localhost:${CUSTOMER_PORT}/local/${name}/`;
      }
      if (input.phpVersion && ['8.1', '8.2', '8.3', '8.4', '8.5'].includes(input.phpVersion)) {
        project.phpVersion = input.phpVersion;
      }
      if (input.sourceType === 'github') {
        const repoUrl = String(input.repoUrl || '').trim();
        if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(repoUrl)) return send(res, 400, { error: 'Enter a valid public GitHub URL.' });
        project.sourceType = 'github-public';
        project.repoUrl = repoUrl;
        project.sourceStatus = 'downloading';
        project.deployPath = null;
        project.entryPoint = null;
        writeDb(db);
        updateAsync(project.id, () => syncGithub(project.id, repoUrl));
        return send(res, 202, { project: projectResponse(project) });
      }
      writeDb(db);
      updateAsync(project.id, () => deployRemoteProject(project));
      return send(res, 200, { project: projectResponse(project) });
    }

    if (req.method === 'POST' && action[2] === 'toggle') {
      const willEnable = project.enabled === false;
      project.enabled = willEnable;
      writeDb(db);
      try {
        if (project.enabled) await deployRemoteProject(project);
        else if (workerRequired(project)) await stopRemoteProject(project);
      } catch (err) {
        project.enabled = !willEnable;
        writeDb(db);
        return send(res, 500, { error: `Failed to update project container state on worker server: ${err.message}. Please contact support.`, serverDown: true });
      }
      return send(res, 200, { project: projectResponse(project) });
    }

    if (req.method === 'POST' && action[2] === 'rebuild') {
      project.sourceStatus = 'rebuilding';
      writeDb(db);
      if (project.sourceType === 'github-public' || project.sourceType === 'oauth' || project.sourceType === 'private') updateAsync(project.id, () => syncGithub(project.id, project.repoUrl));
      else if (['blank-php', 'blank-html'].includes(project.sourceType)) updateAsync(project.id, () => deployRemoteProject(project));
      else {
        const source = path.join(DATA_DIR, 'projects', project.id, '.deployigo-source.zip');
        updateAsync(project.id, async () => {
          if (fs.existsSync(source)) await extractZip(project, fs.readFileSync(source));
          await deployRemoteProject(project);
          writeDb(readDb());
        });
      }
      return send(res, 202, { project: projectResponse(project) });
    }

    if (req.method === 'DELETE') {
      try {
        if (workerRequired(project)) await removeRemoteProject(project);
      } catch (e) {
        return send(res, 500, { error: `Worker server error while removing project container: ${e.message}. Please contact support.`, serverDown: true });
      }
      const index = db.projects.findIndex(item => item.id === project.id);
      if (index !== -1) db.projects.splice(index, 1);
      try { fs.rmSync(path.join(DATA_DIR, 'projects', project.id), { recursive: true, force: true }); } catch(e) {}
      writeDb(db);
      return send(res, 200, { ok: true, message: 'Project deleted.' });
    }
  }

  // GitHub OAuth account connect with CSRF state and a one-time server-side grant.
  const oauthAuthRoute=url.pathname.match(/^\/api\/oauth\/([^/]+)\/authorize$/);
  if(oauthAuthRoute && req.method==='GET') {
    if(oauthAuthRoute[1]!=='github') return send(res,501,{error:'Only GitHub OAuth is supported.'});
    if(!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) return send(res,503,{error:'Configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in local .env, then restart all services.'});
    const state=crypto.randomBytes(32).toString('hex');
    const sessionToken=cookies(req).deployigo_session;
    oauthStates.set(state,{userId:user.id,sessionToken,expiresAt:Date.now()+oauthExpiryMs});
    const callback=`${url.origin}/api/oauth/github/callback`;
    const location=`https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(process.env.GITHUB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(callback)}&scope=repo%20read%3Aorg&state=${state}`;
    res.writeHead(302,{Location:location,'Cache-Control':'no-store'});return res.end();
  }
  if(req.method==='GET' && url.pathname==='/api/oauth/github/callback') {
    const state=url.searchParams.get('state');
    const record=oauthStates.get(state);oauthStates.delete(state);
    if(!record || record.expiresAt<Date.now() || record.userId!==user.id || record.sessionToken!==cookies(req).deployigo_session) return send(res,403,{error:'OAuth state invalid or expired. Close popup and retry.'});
    if(url.searchParams.has('error')) return send(res,400,{error:'GitHub authorization declined.'});
    const code=url.searchParams.get('code');
    if(!code || code.length>500) return send(res,400,{error:'GitHub authorization code missing.'});
    try {
      const tokenRes=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,code,redirect_uri:`${url.origin}/api/oauth/github/callback`})});
      if(!tokenRes.ok) throw new Error('GitHub token exchange failed');
      const tokenPayload=await tokenRes.json();const accessToken=tokenPayload.access_token;
      if(!accessToken) throw new Error('GitHub did not return an access token');
      const ghHeaders={Authorization:`Bearer ${accessToken}`,'User-Agent':'Deployigo-Prototype','Accept':'application/vnd.github+json'};
      const [userResponse,reposResponse]=await Promise.all([fetch('https://api.github.com/user',{headers:ghHeaders}),fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',{headers:ghHeaders})]);
      if(!userResponse.ok || !reposResponse.ok) throw new Error('Unable to list GitHub repositories');
      const profile=await userResponse.json(), repos=await reposResponse.json();
      if(!Array.isArray(repos)) throw new Error('Unexpected GitHub repository response');
      const safeRepos=repos.filter(repo=>repo.clone_url && /^https:\/\/github\.com\//.test(repo.clone_url)).map(repo=>({name:repo.full_name,org:repo.owner?.login||'',url:repo.clone_url,branches:[repo.default_branch||'main'],private:!!repo.private}));
      const grant=crypto.randomBytes(24).toString('hex');
      oauthGrants.set(grant,{userId:user.id,token:accessToken,repos:safeRepos.map(r=>r.url),expiresAt:Date.now()+oauthExpiryMs});
      const payload=JSON.stringify({type:'OAUTH_COMPLETE',provider:'github',user:profile.login||'GitHub',repos:safeRepos,orgs:[],grant});
      // JSON.stringify escapes content for JS, additionally escape the HTML script end marker.
      const safePayload=payload.replace(/</g,'\\u003c');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"});
      return res.end(`<!doctype html><title>GitHub Connected</title><body style="font:16px system-ui;padding:32px"><h2>GitHub connected</h2><p>You may close this window.</p><script>window.opener?.postMessage(${safePayload}, ${JSON.stringify(url.origin)});window.close();</script></body>`);
    }catch(err){return send(res,502,{error:`GitHub connection failed: ${String(err.message).slice(0,150)}`});}
  }

  return send(res, 404, { error: 'Not found.' });

}

function fallback(res, project) { const disabled = project.enabled === false; const maintenance = project.maintenance === true; const title = maintenance ? 'Maintenance in progress' : disabled ? 'Project disabled' : 'Project preview'; const message = maintenance ? 'This project is temporarily offline while maintenance work is in progress.' : disabled ? 'This project has been disabled by its owner.' : project.deployPath ? 'No index.html, index.php, or public entry point was found in this repository.' : 'Source files are still syncing.'; const detail = '';  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${project.name} | Deployigo</title><style>body{margin:0;background:#f3f0e8;color:#17211d;font:16px system-ui;padding:12vw}main{max-width:680px;border-top:5px solid ${maintenance ? '#d8f27b' : disabled ? '#f06e45' : '#c8c8b9'};padding-top:28px}small{color:#68716a;text-transform:uppercase;letter-spacing:1px}h1{font-size:clamp(34px,6vw,64px);margin:16px 0}p{line-height:1.6;color:#526059}a{color:#d44e2a;font-weight:600}</style></head><body><main><small>${maintenance ? 'Deployigo maintenance' : disabled ? 'Deployigo disabled' : 'Deployigo project status'}</small><h1>${title}</h1><p>${message}</p>${detail}</main></body></html>`); }
async function serveProject(res, project, relativePath) { if (relativePath.split('/').some(part => part.startsWith('.')) || /(?:^|\/)composer\.(?:json|lock)$/.test(relativePath) || relativePath.includes('node_modules/')) return send(res, 404, { error: 'Not found.' }); const root = path.resolve(project.deployPath); const filePath = path.resolve(root, relativePath); if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) return send(res, 403, { error: 'Invalid project path.' }); if (!fs.existsSync(filePath)) return fallback(res, project); if (path.extname(filePath) === '.php') { res.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('PHP execution is disabled in local-preview mode for isolation. Select an isolated Docker worker to run PHP 8.1-8.5.'); } const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' }; fs.readFile(filePath, (error, content) => { if (error) return fallback(res, project); res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' }); res.end(content); }); }
// API service owns persistent state, worker operations and project preview. It does NOT serve portal HTML.
// Customer and admin HTML are isolated in backend/src/portal-server.js.
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, service: 'api' });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/local/')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const project = readDb().projects.find(item => item.name === parts[1] && item.deployTarget === 'local-preview');
      if (project?.deployPath && project.entryPoint && project.enabled !== false && project.maintenance !== true)
        return serveProject(res, project, parts.slice(2).join('/') || project.entryPoint);
      if (project) return fallback(res, project);
    }
    return send(res, 404, { error: 'Use customer or admin portal for the web interface.' });
  } catch (error) { console.error(error); return send(res, 500, { error: 'Unexpected server error.' }); }
});
server.listen(PORT, process.env.API_BIND || '127.0.0.1', () => console.log(`DIG API: http://localhost:${PORT}`));
