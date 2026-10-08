const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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

const PORT = Number(process.env.PORT || 4300);
const SESSION_TTL = Number(process.env.SESSION_TTL_HOURS || 8) * 60 * 60 * 1000;

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

function entryPoint(project) { if (!project.deployPath) return null; for (const item of ['index.html', 'index.php', 'public/index.php', 'public/index.html']) if (fs.existsSync(path.join(project.deployPath, item))) return item; return null; }
function localProject(payload) {
  return {
    id: payload.id,
    ownerId: payload.ownerId,
    owner: payload.owner,
    name: payload.name,
    status: 'local',
    sourceType: payload.sourceType || 'blank-php',
    sourceStatus: payload.sourceStatus || 'ready',
    technology: payload.technology || 'PHP',
    phpVersion: payload.phpVersion || '8.5',
    phpSettings: { ...DEFAULT_PHP_SETTINGS, ...(payload.phpSettings || {}) },
    phpModules: sanitizePhpModules(payload.phpModules || {}),
    createdAt: payload.createdAt || new Date().toISOString(),
    deploymentMode: 'remote-docker',
    deployTarget: 'remote-docker',
    remoteHost: payload.remoteHost || '192.168.1.167',
    remoteUser: payload.remoteUser || 'root',
    remotePort: payload.remotePort || 18080,
    remotePath: payload.remotePath || `/opt/deployigo/workspaces/default/${payload.id}`,
    remoteContainer: payload.remoteContainer || `deployigo-${payload.id}`,
    url: payload.url || `http://${payload.remoteHost || '192.168.1.167'}:${payload.remotePort || 18080}/`,
    deployPath: payload.deployPath || null,
    entryPoint: payload.entryPoint || null,
    repoUrl: payload.repoUrl || null,
    enabled: true,
    maintenance: false
  };
}

function readDb() { const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); let changed = false; for (const project of db.projects) { if (project.deploymentMode === 'mock' || (project.url?.startsWith('https://') && project.status === 'staging')) { project.status = 'local'; project.url = `http://localhost:${PORT}/local/${project.name}/`; project.deploymentMode = 'local-preview'; changed = true; } if (project.deployPath && !project.entryPoint) { project.entryPoint = entryPoint(project); project.previewStatus = project.entryPoint ? 'available' : 'no-entry-point'; changed = true; } if (project.enabled === undefined) { project.enabled = true; changed = true; } if (project.maintenance === undefined) { project.maintenance = false; changed = true; } if (!project.deployTarget) { project.deployTarget = process.env.DEPLOY_TARGET || 'local-preview'; changed = true; } if (!project.phpVersion) { project.phpVersion = '8.5'; changed = true; } if (!project.phpSettings) { project.phpSettings = { ...DEFAULT_PHP_SETTINGS }; changed = true; } if (!project.phpModules) { project.phpModules = sanitizePhpModules({}); changed = true; } else { const merged = sanitizePhpModules(project.phpModules, project.phpModules); if (JSON.stringify(merged) !== JSON.stringify(project.phpModules)) { project.phpModules = merged; changed = true; } } } if (changed) writeDb(db); return db; }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(item => { const [key, ...value] = item.trim().split('='); return [key, decodeURIComponent(value.join('='))]; })); }
function currentUser(req, db) { const session = db.sessions[cookies(req).deployigo_session]; if (!session || session.expiresAt < Date.now()) return null; return db.users.find(user => user.id === session.userId) || null; }
function readJson(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 2e6) req.destroy(); }); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function readBuffer(req) { return new Promise((resolve, reject) => { const chunks = []; let size = 0; req.on('data', chunk => { size += chunk.length; if (size > 60 * 1024 * 1024) return reject(new Error('Upload exceeds 60 MB.')); chunks.push(chunk); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); }); }
function parseMultipart(buffer, contentType) { const boundary = contentType.match(/boundary=([^;]+)/)?.[1]; if (!boundary) throw new Error('Missing upload boundary.'); const marker = Buffer.from(`--${boundary}`).toString('binary'); const fields = {}; let file = null; for (const part of buffer.toString('binary').split(marker)) { const headerEnd = part.indexOf('\r\n\r\n'); if (headerEnd < 0) continue; const headers = part.slice(0, headerEnd); const value = part.slice(headerEnd + 4).replace(/\r\n--?\r\n?$/, '').replace(/\r\n$/, ''); const match = headers.match(/name="([^"]+)"(?:; filename="([^"]*)")?/); if (!match) continue; if (match[2]) file = { filename: path.basename(match[2]), buffer: Buffer.from(value, 'binary') }; else fields[match[1]] = value; } return { fields, file }; }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`; }
function validPassword(password, stored) { const [salt, hash] = stored.split(':'); return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(password, salt, 64)); }
function sessionCookie(value) { return `deployigo_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`; }
function createSession(db, userId) { for (const key of Object.keys(db.sessions)) if (db.sessions[key].userId === userId) delete db.sessions[key]; const value = id('sess'); db.sessions[value] = { userId, expiresAt: Date.now() + SESSION_TTL }; return value; }
function updateAsync(projectId, callback) { callback().then(() => {}).catch(error => { const db = readDb(); const project = db.projects.find(item => item.id === projectId); if (project) { project.sourceStatus = 'error'; project.sourceError = error.message; writeDb(db); } }); }

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
  const indexPhpPath = path.join(dir, 'index.php');
  if (!fs.existsSync(indexPhpPath)) {
    fs.writeFileSync(indexPhpPath, `<?php
phpinfo();
?>`);
  }
  project.deployPath = dir;
  project.entryPoint = 'index.php';
  project.previewStatus = 'available';
  project.sourceStatus = 'ready';
}

async function deployRemoteProject(project) { if (project.deployTarget !== 'remote-docker' || !project.deployPath) return; const host = project.remoteHost || process.env.DEPLOY_REMOTE_HOST || '192.168.1.167'; const user = project.remoteUser || process.env.DEPLOY_REMOTE_USER || 'root'; const remoteBase = process.env.DEPLOY_REMOTE_BASE || '/opt/deployigo/workspaces'; const port = Number(project.remotePort || 18080 + (parseInt(project.id.slice(-4), 16) % 100)); const remotePath = `${remoteBase}/default/${project.id}`; const container = `deployigo-${project.id}`; const sourceDir = fs.existsSync(project.deployPath) && fs.statSync(project.deployPath).isDirectory() ? project.deployPath : path.dirname(project.deployPath); await new Promise((resolve, reject) => { const tar = spawn('tar', ['--exclude=.deployigo-source.zip', '-C', sourceDir, '-cf', '-', '.']); const ssh = spawn('ssh', ['-o', 'BatchMode=yes', `${user}@${host}`, `rm -rf ${remotePath} && mkdir -p ${remotePath} && tar -xf - -C ${remotePath}`]); let error = ''; ssh.stderr.on('data', chunk => { error += chunk; }); tar.stdout.pipe(ssh.stdin); ssh.on('close', code => code === 0 ? resolve() : reject(new Error(error || `Remote source upload failed (${code}).`))); tar.on('error', reject); }); const version = project.phpVersion || '8.5'; const cfg = sanitizePhpSettings(project.phpSettings);


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

  if (project.envVars && typeof project.envVars === 'object' && project.deployPath) {
    const envLines = Object.entries(project.envVars).map(([k, v]) => `${k}=${v}`).join('\n');
    try { fs.writeFileSync(path.join(project.deployPath, '.env'), envLines); } catch (e) {}
  }

  if (project.database && project.database.type && project.database.type !== 'none' && project.database.mode !== 'existing' && !project.database.isExternal) {
    const dbConf = project.database;
    const dbContainer = `deployigo-db-${project.id}`;
    const defaultPort = dbConf.type === 'postgres' ? 5432 : 3306;
    let dbCmd = `docker network create deployigo-net >/dev/null 2>&1 || true; `;
    if (dbConf.type === 'mysql') {
      const tag = dbConf.version === '5.7' ? '5.7' : dbConf.version === '9' ? '9.0' : '8.0';
      dbCmd += `docker inspect ${dbContainer} >/dev/null 2>&1 || docker run -d --name ${dbContainer} --network deployigo-net --restart unless-stopped -p ${dbConf.dbPort || 3306}:3306 -e MYSQL_ROOT_PASSWORD=${dbConf.dbPassword} -e MYSQL_DATABASE=${dbConf.dbName} -e MYSQL_USER=${dbConf.dbUser} -e MYSQL_PASSWORD=${dbConf.dbPassword} mysql:${tag}`;
    } else if (dbConf.type === 'postgres') {
      const tag = dbConf.version === '18' ? '18-alpine' : '17-alpine';
      dbCmd += `docker inspect ${dbContainer} >/dev/null 2>&1 || docker run -d --name ${dbContainer} --network deployigo-net --restart unless-stopped -p ${dbConf.dbPort || 5432}:5432 -e POSTGRES_DB=${dbConf.dbName} -e POSTGRES_USER=${dbConf.dbUser} -e POSTGRES_PASSWORD=${dbConf.dbPassword} postgres:${tag}`;
    }
    if (dbCmd) {
      try { await execFileAsync('ssh', ['-o', 'BatchMode=yes', `${user}@${host}`, dbCmd]); } catch (e) { console.error('DB container error:', e); }
    }
  }

  const remoteEntrypointPath = `${remotePath}/.entrypoint.sh`;
  let entrypointScript = `#!/bin/sh\ncd /var/www/html\n`;
  if (Array.isArray(project.buildSteps) && project.buildSteps.length > 0) {
    for (const step of project.buildSteps) {
      if (step.trim()) {
        entrypointScript += `${step.trim()} || true\n`;
      }
    }
  }
  entrypointScript += `exec php -d memory_limit=${cfg.memory_limit} -d upload_max_filesize=${cfg.upload_max_filesize} -d post_max_size=${cfg.post_max_size} -d display_errors=${cfg.display_errors === 'On' ? '1' : '0'} -d max_execution_time=${cfg.max_execution_time} -d max_input_vars=${cfg.max_input_vars} -d date.timezone=${cfg.date_timezone} -S 0.0.0.0:8080 -t /var/www/html /var/www/html/.deployigo_router.php\n`;

  let dockerEnvFlags = '';
  if (project.envVars && typeof project.envVars === 'object') {
    for (const [k, v] of Object.entries(project.envVars)) {
      const safeVal = String(v).replace(/"/g, '\\"');
      dockerEnvFlags += ` -e ${k}="${safeVal}"`;
    }
  }

  const sshCmd = `docker network create deployigo-net >/dev/null 2>&1 || true;
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

async function syncGithub(projectId, repoUrl) {
  const db = readDb();
  const project = db.projects.find(item => item.id === projectId);
  if (!project || !repoUrl) return;

  const targetDir = path.join(DATA_DIR, 'projects', projectId);
  fs.mkdirSync(targetDir, { recursive: true });

  try {
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    if (fs.existsSync(path.join(targetDir, '.git'))) {
      try {
        await execFileAsync('git', ['pull'], { cwd: targetDir, env: gitEnv });
      } catch (pullErr) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        fs.mkdirSync(targetDir, { recursive: true });
        await execFileAsync('git', ['clone', repoUrl, targetDir], { env: gitEnv });
      }
    } else {
      await execFileAsync('git', ['clone', repoUrl, targetDir], { env: gitEnv });
    }

    const freshDb = readDb();
    const freshProject = freshDb.projects.find(item => item.id === projectId);
    if (freshProject) {
      freshProject.deployPath = targetDir;
      freshProject.entryPoint = entryPoint(freshProject) || 'index.php';
      freshProject.sourceStatus = 'ready';
      writeDb(freshDb);
      await deployRemoteProject(freshProject);
    }
  } catch (err) {
    console.error(`Git sync error for project ${projectId}:`, err);
    try { fs.rmSync(targetDir, { recursive: true, force: true }); } catch (e) {}
    const freshDb = readDb();
    const freshProject = freshDb.projects.find(item => item.id === projectId);
    if (freshProject) {
      freshProject.sourceStatus = 'error';
      freshProject.sourceError = (err.stderr || err.stdout || err.message || 'Failed to clone repository. Private repositories require authentication.').trim();
      writeDb(freshDb);
    }
  }
}


async function api(req, res, url) {
  const db = readDb();
  if (req.method === 'POST' && url.pathname === '/api/auth/signup') { const input = await readJson(req); const email = String(input.email || '').trim().toLowerCase(); if (!email || !input.password || String(input.password).length < 8) return send(res, 400, { error: 'Use an email and a password with at least 8 characters.' }); if (db.users.some(user => user.email === email)) return send(res, 409, { error: 'An account already exists for this email.' }); const user = { id: id('usr'), name: String(input.name || email.split('@')[0]).trim(), email, passwordHash: hashPassword(input.password), isAdmin: db.users.length === 0, createdAt: new Date().toISOString() }; db.users.push(user); const session = createSession(db, user.id); writeDb(db); return send(res, 201, { user }, { 'Set-Cookie': sessionCookie(session) }); }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') { const input = await readJson(req); const user = db.users.find(item => item.email === String(input.email || '').trim().toLowerCase()); if (!user || !validPassword(String(input.password || ''), user.passwordHash)) return send(res, 401, { error: 'Email or password is incorrect.' }); const session = createSession(db, user.id); writeDb(db); return send(res, 200, { user }, { 'Set-Cookie': sessionCookie(session) }); }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') { delete db.sessions[cookies(req).deployigo_session]; writeDb(db); return send(res, 200, { ok: true }, { 'Set-Cookie': 'deployigo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' }); }
  const user = currentUser(req, db); if (!user) return send(res, 401, { error: 'Login required.' });
  if (req.method === 'POST' && url.pathname === '/api/projects/blank') {
    const input = await readJson(req);
    const rawName = String(input.name || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,60}$/.test(rawName)) return send(res, 400, { error: 'Project name can contain letters, numbers, hyphens, and underscores (2-60 characters).' });
    const name = rawName.toLowerCase();

    if (db.projects.some(item => item.ownerId === user.id && item.name === name)) return send(res, 409, { error: 'A project with this name already exists.' });
    const host = process.env.DEPLOY_REMOTE_HOST || '192.168.1.167';
    const remoteUser = process.env.DEPLOY_REMOTE_USER || 'root';

    const serverCheck = await checkWorkerServer(host, remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const prjId = id('prj');
    const port = Number(18080 + (parseInt(prjId.slice(-4), 16) % 100));
    const project = localProject({
      id: prjId,
      ownerId: user.id,
      owner: user.email,
      name,
      sourceType: 'blank-php',
      sourceStatus: 'creating',
      technology: 'PHP',
      phpVersion: '8.5',
      createdAt: new Date().toISOString(),
      remoteHost: host,
      remoteUser: remoteUser,
      remotePort: port,
      remotePath: `/opt/deployigo/workspaces/default/${prjId}`,
      remoteContainer: `deployigo-${prjId}`,
      url: `http://${host}:${port}/`
    });
    await createBlankProject(project);
    db.projects.push(project);
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 201, { project });
  }
  if (req.method === 'DELETE' && url.pathname.match(/^\/api\/projects\/([^/]+)$/)) {
    const projectId = url.pathname.split('/')[3];
    const project = db.projects.find(item => item.id === projectId && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    try {
      await removeRemoteProject(project);
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

    const host = project.remoteHost || '192.168.1.167';
    const remoteUser = project.remoteUser || 'root';
    const serverCheck = await checkWorkerServer(host, remoteUser);
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

    const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    project.sourceStatus = 'redeploying';
    writeDb(db);
    updateAsync(project.id, () => redeployRemotePhp(project));
    return send(res, 202, { project, message: `Remote Docker redeploy started with PHP ${project.phpVersion}.` });
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const projects = db.projects.filter(item => item.ownerId === user.id);
    let totalStorageBytes = 0;

    for (const project of projects) {
      if (project.sourceType === 'github-public' && project.sourceStatus !== 'ready' && project.sourceStatus !== 'downloading') {
        project.sourceStatus = 'downloading';
        updateAsync(project.id, () => syncGithub(project.id, project.repoUrl));
      }
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

    const host = process.env.DEPLOY_REMOTE_HOST || '192.168.1.167';
    const remoteUser = process.env.DEPLOY_REMOTE_USER || 'root';

    const serverCheck = await checkWorkerServer(host, remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const prjId = id('prj');
    const port = Number(18080 + (parseInt(prjId.slice(-4), 16) % 100));

    const project = localProject({
      id: prjId,
      ownerId: user.id,
      owner: user.email,
      name,
      sourceType,
      repoUrl: repoUrl || null,
      sourceStatus: (sourceType === 'github-public' || sourceType === 'oauth' || sourceType === 'private') ? 'downloading' : 'extracting',
      technology: input.technology || 'PHP',
      phpVersion: '8.5',
      createdAt: new Date().toISOString(),
      remoteHost: host,
      remoteUser: remoteUser,
      remotePort: port,
      remotePath: `/opt/deployigo/workspaces/default/${prjId}`,
      remoteContainer: `deployigo-${prjId}`,
      url: `http://${host}:${port}/`
    });
    db.projects.push(project);
    writeDb(db);
    if (sourceType === 'github-public' || sourceType === 'oauth' || sourceType === 'private') updateAsync(project.id, () => syncGithub(project.id, repoUrl));
    else updateAsync(project.id, async () => {
      const latest = readDb().projects.find(item => item.id === project.id);
      await extractZip(latest, upload.file.buffer);
      await deployRemoteProject(latest);
      const updated = readDb();
      Object.assign(updated.projects.find(item => item.id === project.id), latest);
      writeDb(updated);
    });
    return send(res, 201, { project });
  }

  const fileRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/files(?:\/(upload|folder))?$/);
  if (fileRoute) {
    const project = db.projects.find(item => item.id === fileRoute[1] && item.ownerId === user.id);
    if (!project || !project.deployPath) return send(res, 404, { error: 'Project files are not available yet.' });

    if (req.method === 'PUT' || (req.method === 'POST' && fileRoute[2]) || req.method === 'DELETE') {
      const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
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

    const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

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

  const phpModulesRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/php-modules$/);
  if (phpModulesRoute && (req.method === 'PATCH' || req.method === 'POST')) {
    const project = db.projects.find(item => item.id === phpModulesRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const input = await readJson(req);
    project.phpModules = sanitizePhpModules(input.phpModules || input, project.phpModules);
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project, message: 'PHP modules updated successfully.' });
  }

  const dbRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/database$/);
  if (dbRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === dbRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const input = await readJson(req);
    const mode = input.mode === 'existing' ? 'existing' : 'new';
    const dbType = String(input.type || 'mysql').toLowerCase();
    const version = String(input.version || (dbType === 'postgres' ? '17' : '8')).trim();
    const dbName = String(input.dbName || project.name.replace(/[^a-zA-Z0-9_]/g, '_')).trim();
    const dbUser = String(input.dbUser || 'app_user').trim();
    const dbPassword = String(input.dbPassword || 'secret123').trim();
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
      project.envVars.DATABASE_URL = dbType === 'postgres' ? `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}` : `mysql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
    }

    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project, message: mode === 'existing' ? 'Existing database connected & environment injected.' : 'Database provisioned & environment injected.' });
  }

  const envRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/env$/);
  if (envRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === envRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const input = await readJson(req);
    project.envVars = input.envVars || {};
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project, message: 'Environment variables saved.' });
  }

  const cicdRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/cicd$/);
  if (cicdRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === cicdRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    const input = await readJson(req);
    project.buildSteps = Array.isArray(input.buildSteps) ? input.buildSteps : [];
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project, message: 'CI/CD build steps saved.' });
  }

  const restartRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/restart$/);
  if (restartRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === restartRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project, message: 'Project container restarted successfully.' });
  }

  const maintenanceRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/maintenance$/);
  if (maintenanceRoute && req.method === 'POST') {
    const project = db.projects.find(item => item.id === maintenanceRoute[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
    if (!serverCheck.ok) return send(res, 503, { error: serverCheck.error, serverDown: true });

    project.maintenance = !project.maintenance;
    writeDb(db);
    updateAsync(project.id, () => deployRemoteProject(project));
    return send(res, 200, { project });
  }

  const action = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(rebuild|toggle))?$/);
  if (action) {
    const project = db.projects.find(item => item.id === action[1] && item.ownerId === user.id);
    if (!project) return send(res, 404, { error: 'Project not found.' });

    const serverCheck = await checkWorkerServer(project.remoteHost, project.remoteUser);
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
        project.url = project.deploymentMode === 'remote-docker' ? `http://${project.remoteHost}:${project.remotePort}/` : `http://localhost:${PORT}/local/${name}/`;
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
        return send(res, 202, { project });
      }
      writeDb(db);
      updateAsync(project.id, () => deployRemoteProject(project));
      return send(res, 200, { project });
    }

    if (req.method === 'POST' && action[2] === 'toggle') {
      const willEnable = project.enabled === false;
      project.enabled = willEnable;
      writeDb(db);
      try {
        if (project.enabled) await deployRemoteProject(project);
        else await stopRemoteProject(project);
      } catch (err) {
        project.enabled = !willEnable;
        writeDb(db);
        return send(res, 500, { error: `Failed to update project container state on worker server: ${err.message}. Please contact support.`, serverDown: true });
      }
      return send(res, 200, { project });
    }

    if (req.method === 'POST' && action[2] === 'rebuild') {
      project.sourceStatus = 'rebuilding';
      writeDb(db);
      if (project.sourceType === 'github-public' || project.sourceType === 'oauth' || project.sourceType === 'private') updateAsync(project.id, () => syncGithub(project.id, project.repoUrl));
      else if (project.sourceType === 'blank-php') updateAsync(project.id, () => deployRemoteProject(project));
      else {
        const source = path.join(DATA_DIR, 'projects', project.id, '.deployigo-source.zip');
        updateAsync(project.id, async () => {
          if (fs.existsSync(source)) await extractZip(project, fs.readFileSync(source));
          await deployRemoteProject(project);
          writeDb(readDb());
        });
      }
      return send(res, 202, { project });
    }

    if (req.method === 'DELETE') {
      try {
        await removeRemoteProject(project);
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

  const oauthAuthRoute = url.pathname.match(/^\/api\/oauth\/([^/]+)\/authorize$/);
  if (oauthAuthRoute && req.method === 'GET') {
    const provider = oauthAuthRoute[1];
    const returnUrl = url.searchParams.get('return_url') || '/app/';
    
    if (provider === 'github') {
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (clientId) {
        const githubOAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user&redirect_uri=${encodeURIComponent(url.origin + '/api/oauth/github/callback')}`;
        res.writeHead(302, { Location: githubOAuthUrl });
        return res.end();
      }
    }

    const providerNames = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket', gitea: 'Gitea' };
    const name = providerNames[provider] || provider;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!doctype html><html><head><title>Setup ${name} OAuth App | Deployigo</title><style>body{font-family:sans-serif;background:#0d1117;color:#c9d1d9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}div{background:#161b22;border:1px solid #30363d;padding:32px;border-radius:12px;text-align:center;max-width:480px}h2{color:#58a6ff;margin-top:0}p{color:#8b949e;line-height:1.5;font-size:14px;text-align:left}code{background:#21262d;padding:3px 6px;border-radius:4px;color:#79c0ff;font-family:monospace}button{background:#238636;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600;margin-top:16px}button:hover{background:#2ea043}</style></head><body><div><h2>Configure ${name} OAuth Credentials</h2><p>To connect live ${name} repositories, set your OAuth App credentials in environment variables:</p><p><code>GITHUB_CLIENT_ID=your_client_id</code><br><code>GITHUB_CLIENT_SECRET=your_client_secret</code></p><p>Callback URL to configure in GitHub Developer Settings:<br><code>${url.origin}/api/oauth/github/callback</code></p><button onclick="window.close()">Close Window</button></div></body></html>`);
  }

  const oauthCallbackRoute = url.pathname.match(/^\/api\/oauth\/([^/]+)\/callback$/);
  if (oauthCallbackRoute && req.method === 'GET') {
    const provider = oauthCallbackRoute[1];
    const code = url.searchParams.get('code');

    if (provider === 'github' && code) {
      try {
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code
          })
        });
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        if (accessToken) {
          const userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'Deployigo-App' }
          });
          const userData = await userRes.json();

          // Fetch User Orgs
          let orgs = [];
          try {
            const orgsRes = await fetch('https://api.github.com/user/orgs', {
              headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'Deployigo-App' }
            });
            const orgsData = await orgsRes.json();
            if (Array.isArray(orgsData)) orgs = orgsData.map(o => o.login);
          } catch (e) {}

          // Fetch All User + Org Repositories (affiliation=owner,collaborator,organization_member)
          const reposRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'Deployigo-App' }
          });
          const reposData = await reposRes.json();
          const reposList = Array.isArray(reposData) ? reposData.map(r => ({
            name: r.full_name,
            org: r.owner ? r.owner.login : '',
            url: r.clone_url || r.html_url,
            branches: [r.default_branch || 'main', 'master', 'dev', 'staging'].filter((v, i, a) => a.indexOf(v) === i)
          })) : [];

          res.writeHead(200, { 'Content-Type': 'text/html' });
          return res.end(`<!doctype html><html><head><title>Authorization Complete</title></head><body style="background:#0d1117;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><div style="text-align:center"><h2>Authorization Successful!</h2><p>Connected as <strong>${userData.login || 'GitHub User'}</strong>. Closing window...</p></div><script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_COMPLETE', provider: 'github', user: ${JSON.stringify(userData.login || 'GitHub User')}, orgs: ${JSON.stringify(orgs)}, repos: ${JSON.stringify(reposList)} }, '*');
            }
            setTimeout(() => window.close(), 1200);
          </script></body></html>`);
        }

      } catch (err) {
        console.error('OAuth exchange error:', err);
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!doctype html><html><body style="background:#0d1117;color:#fff;font-family:sans-serif;text-align:center;padding:50px"><h2>Authorization Failed</h2><button onclick="window.close()">Close Window</button></body></html>`);
  }



  return send(res, 404, { error: 'Not found.' });

}

function fallback(res, project) { const disabled = project.enabled === false; const maintenance = project.maintenance === true; const title = maintenance ? 'Maintenance in progress' : disabled ? 'Project disabled' : 'Project preview'; const message = maintenance ? 'This project is temporarily offline while maintenance work is in progress.' : disabled ? 'This project has been disabled by its owner.' : project.deployPath ? 'No index.html, index.php, or public entry point was found in this repository.' : 'Source files are still syncing.'; const detail = !disabled && !maintenance && project.repoUrl ? `<a href="${project.repoUrl}">Open repository on GitHub</a>` : ''; res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${project.name} | Deployigo</title><style>body{margin:0;background:#f3f0e8;color:#17211d;font:16px system-ui;padding:12vw}main{max-width:680px;border-top:5px solid ${maintenance ? '#d8f27b' : disabled ? '#f06e45' : '#c8c8b9'};padding-top:28px}small{color:#68716a;text-transform:uppercase;letter-spacing:1px}h1{font-size:clamp(34px,6vw,64px);margin:16px 0}p{line-height:1.6;color:#526059}a{color:#d44e2a;font-weight:600}</style></head><body><main><small>${maintenance ? 'Deployigo maintenance' : disabled ? 'Deployigo disabled' : 'Deployigo project status'}</small><h1>${title}</h1><p>${message}</p>${detail}</main></body></html>`); }
async function serveProject(res, project, relativePath) { const root = path.resolve(project.deployPath); const filePath = path.resolve(root, relativePath); if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) return send(res, 403, { error: 'Invalid project path.' }); if (!fs.existsSync(filePath)) return fallback(res, project); if (path.extname(filePath) === '.php') { try { const result = await execFileAsync('php', [filePath], { cwd: root, timeout: 5000, maxBuffer: 2 * 1024 * 1024 }); res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(result.stdout); } catch (error) { res.writeHead(500, { 'Content-Type': 'text/plain' }); return res.end(`PHP preview error: ${error.stderr || error.message}`); } } const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' }; fs.readFile(filePath, (error, content) => { if (error) return fallback(res, project); res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' }); res.end(content); }); }
function staticFile(req, res, url) { if (url.pathname.startsWith('/local/')) { const parts = url.pathname.split('/').filter(Boolean); const project = readDb().projects.find(item => item.name === parts[1]); if (project?.deployPath && project.entryPoint && project.enabled !== false && project.maintenance !== true) return serveProject(res, project, parts.slice(2).join('/') || project.entryPoint); if (project) return fallback(res, project); } const filePath = url.pathname === '/' ? path.join(ROOT, 'frontend/index.html') : url.pathname.startsWith('/frontend/') ? path.join(ROOT, url.pathname) : url.pathname === '/admin/' ? path.join(ROOT, 'admin/index.html') : url.pathname.startsWith('/admin/') ? path.join(ROOT, url.pathname) : url.pathname === '/login.html' ? path.join(ROOT, 'frontend/login.html') : url.pathname === '/signup.html' ? path.join(ROOT, 'frontend/signup.html') : url.pathname === '/app/' ? path.join(ROOT, 'frontend/app.html') : null; if (!filePath || !filePath.startsWith(ROOT)) return send(res, 404, { error: 'Not found.' }); fs.readFile(filePath, (error, content) => { if (error) return send(res, 404, { error: 'Not found.' }); const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }; res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'text/plain', 'Cache-Control': 'no-cache, no-store, must-revalidate' }); res.end(content); }); }
const server = http.createServer(async (req, res) => { const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else staticFile(req, res, url); } catch (error) { console.error(error); send(res, 500, { error: error.message || 'Unexpected server error.' }); } });
server.listen(PORT, () => console.log(`Deployigo listening on http://localhost:${PORT}`));
