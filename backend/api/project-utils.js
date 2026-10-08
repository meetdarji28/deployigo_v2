'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MAX_ENTRIES = 1500;
const MAX_EXPANDED_BYTES = 150 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024;

function normalizeTechnology(value) {
  const tech = String(value || 'php').toLowerCase();
  if (!['php', 'html'].includes(tech)) throw new Error('Only PHP and HTML projects are supported in this prototype.');
  return tech === 'html' ? 'HTML' : 'PHP';
}
function entryPoint(project) {
  if (!project.deployPath || !fs.existsSync(project.deployPath)) return null;
  const candidates = normalizeTechnology(project.technology) === 'HTML'
    ? ['index.html', 'public/index.html']
    : ['public/index.php', 'index.php', 'index.html', 'public/index.html'];
  return candidates.find(item => fs.existsSync(path.join(project.deployPath, item))) || null;
}
function analyzeSource(project) {
  const root = project.deployPath;
  const exists = relative => Boolean(root && fs.existsSync(path.join(root, relative)));
  const composer = exists('composer.json');
  const laravel = composer && exists('artisan') && exists('public/index.php');
  const notes = [];
  if (composer && !exists('vendor/autoload.php')) notes.push('Composer dependencies detected: run composer install.');
  if (laravel) notes.push('Laravel detected: set APP_KEY, configure DB and review migrations before running artisan commands.');
  if (exists('package.json')) notes.push('package.json detected. Node build tools are not yet part of the PHP/HTML runtime.');
  if (!entryPoint(project)) notes.push('No supported entry point found. Add index.html, index.php, or public/index.php.');
  return { framework: laravel ? 'laravel' : null, composerRequired: composer, recommendations: notes };
}
// Parse the central directory to reject traversal, links, zip bombs and unsupported entries
// before creating any files. ZIP64/encrypted archives deliberately remain unsupported.
function readZipEntries(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ARCHIVE_BYTES || bytes.length < 22) throw new Error('Invalid ZIP or ZIP exceeds 60 MB.');
  let eocd = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50) { eocd = at; break; }
  }
  if (eocd < 0) throw new Error('ZIP central directory not found.');
  if (bytes.readUInt16LE(eocd + 4) || bytes.readUInt16LE(eocd + 6)) throw new Error('Multi-disk ZIP is unsupported.');
  const count = bytes.readUInt16LE(eocd + 10);
  const cdSize = bytes.readUInt32LE(eocd + 12);
  const cdStart = bytes.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES || cdStart + cdSize > eocd) throw new Error('ZIP has too many entries or is malformed.');
  let pos = cdStart, expanded = 0;
  const entries = [], seen = new Set();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || bytes.readUInt32LE(pos) !== 0x02014b50) throw new Error('Invalid ZIP entry.');
    const flags = bytes.readUInt16LE(pos + 8), method = bytes.readUInt16LE(pos + 10);
    const compressedSize = bytes.readUInt32LE(pos + 20), uncompressedSize = bytes.readUInt32LE(pos + 24);
    const nameLength = bytes.readUInt16LE(pos + 28), extraLength = bytes.readUInt16LE(pos + 30), commentLength = bytes.readUInt16LE(pos + 32);
    const externalAttributes = bytes.readUInt32LE(pos + 38), offset = bytes.readUInt32LE(pos + 42);
    if (pos + 46 + nameLength + extraLength + commentLength > bytes.length) throw new Error('Truncated ZIP entry.');
    const name = bytes.subarray(pos + 46, pos + 46 + nameLength).toString('utf8');
    pos += 46 + nameLength + extraLength + commentLength;
    if ((flags & 1) || ![0, 8].includes(method) || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new Error('Encrypted, ZIP64 or unsupported compression in ZIP.');
    if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[a-zA-Z]:/.test(name) || name.split('/').some(part => part === '..' || part === '.')) throw new Error('ZIP contains an unsafe file path.');
    if (name.split('/').length > 30) throw new Error('ZIP directory nesting too deep.');
    const isDirectory = name.endsWith('/');
    const unixType = (externalAttributes >>> 16) & 0xf000;
    if (unixType && unixType !== (isDirectory ? 0x4000 : 0x8000)) throw new Error('ZIP links and special files are not supported.');
    if (seen.has(name)) throw new Error('ZIP contains duplicate file paths.');
    seen.add(name);
    expanded += uncompressedSize;
    if (expanded > MAX_EXPANDED_BYTES) throw new Error('ZIP expands beyond 150 MB limit.');
    if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== 0x04034b50) throw new Error('Invalid ZIP local file header.');
    const fileStart = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    if (fileStart + compressedSize > cdStart) throw new Error('ZIP content exceeds archive bounds.');
    entries.push({ name, method, isDirectory, uncompressedSize, fileStart, compressedSize });
  }
  return entries;
}
function extractZip(bytes, dest) {
  const entries = readZipEntries(bytes);
  fs.mkdirSync(dest, { recursive: true });
  for (const e of entries) {
    const destination = path.resolve(dest, e.name);
    if (!destination.startsWith(path.resolve(dest) + path.sep)) throw new Error('Unsafe ZIP path.');
    if (e.isDirectory) { fs.mkdirSync(destination, { recursive: true }); continue; }
    const chunk = bytes.subarray(e.fileStart, e.fileStart + e.compressedSize);
    const uncompressed = e.method === 0 ? chunk : zlib.inflateRawSync(chunk, { maxOutputLength: Math.max(1, e.uncompressedSize) });
    if (uncompressed.length !== e.uncompressedSize) throw new Error('ZIP entry size mismatch.');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, uncompressed, { flag: 'wx', mode: 0o644 });
  }
  return entries.length;
}
function validatePublicGitHubUrl(url) {
  if (!/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\.git)?\/?$/.test(url) || url.includes('@')) {
    throw new Error('Public Git sources must use a GitHub https://github.com/owner/repository URL. Private/OAuth clones require a secure credential integration not implemented yet.');
  }
  return url;
}
module.exports = { normalizeTechnology, entryPoint, analyzeSource, extractZip, readZipEntries, validatePublicGitHubUrl };
