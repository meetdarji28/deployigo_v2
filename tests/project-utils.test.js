'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { normalizeTechnology, entryPoint, analyzeSource, extractZip, validatePublicGitHubUrl } = require('../backend/api/project-utils');

test('technology type and static entry-point are distinct', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'dig-entry-'));
  try {
    fs.writeFileSync(path.join(folder, 'index.php'), '<?php');
    assert.equal(entryPoint({ technology: 'html', deployPath: folder }), null);
    assert.equal(entryPoint({ technology: 'php', deployPath: folder }), 'index.php');
    fs.writeFileSync(path.join(folder, 'index.html'), 'Hello');
    assert.equal(entryPoint({ technology: 'HTML', deployPath: folder }), 'index.html');
    assert.equal(normalizeTechnology('hTmL'), 'HTML');
    assert.throws(() => normalizeTechnology('wordpress'), /Only PHP/);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
test('source diagnostics detect missing composer deps and Laravel', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'dig-composer-'));
  try {
    fs.mkdirSync(path.join(folder, 'public'));
    for (const file of ['composer.json', 'artisan', 'public/index.php']) fs.writeFileSync(path.join(folder, file), '');
    const result = analyzeSource({ deployPath: folder, technology: 'PHP' });
    assert.equal(result.composerRequired, true);
    assert.equal(result.framework, 'laravel');
    assert.match(result.recommendations.join(' '), /composer install/);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
test('ZIP unpacks normal entry without external Node packages', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'dig-zip-'));
  try {
    fs.mkdirSync(path.join(folder, 'source'));
    fs.writeFileSync(path.join(folder, 'source', 'index.html'), '<h1>static</h1>');
    const zipPath = path.join(folder, 'site.zip');
    execFileSync('zip', ['-q', '-j', zipPath, path.join(folder, 'source', 'index.html')]);
    const count = extractZip(fs.readFileSync(zipPath), path.join(folder, 'unpacked'));
    assert.equal(count, 1);
    assert.match(fs.readFileSync(path.join(folder, 'unpacked', 'index.html'), 'utf8'), /static/);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
test('ZIP rejects unsafe path and link', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'dig-zip-bad-'));
  try {
    fs.mkdirSync(path.join(folder, 'source'));
    const file = path.join(folder, 'source', 'index.html'); fs.writeFileSync(file, '<h1>x</h1>');
    const zip = path.join(folder, 'malicious.zip');
    execFileSync('zip', ['-q', '-j', zip, file]);
    const bytes = fs.readFileSync(zip);
    // Patch same-length filename in both central directory and local header.
    const attack = Buffer.from(bytes); let offset = 0;
    while ((offset = attack.indexOf('index.html', offset)) >= 0) { attack.write('../a.html', offset, 'utf8'); offset += 10; }
    assert.throws(() => extractZip(attack, path.join(folder, 'bad')), /unsafe file path/i);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
test('Git URL accepts only public GitHub HTTPS paths', () => {
  assert.equal(validatePublicGitHubUrl('https://github.com/foo/bar.git'), 'https://github.com/foo/bar.git');
  for (const url of ['git@github.com:a/b.git', 'https://evil.com/a/b', 'https://github.com/a/b?token=abc', 'file:///tmp/x', 'https://user:password@github.com/a/b']) assert.throws(() => validatePublicGitHubUrl(url));
});
