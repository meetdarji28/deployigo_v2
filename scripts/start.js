/** Starts three independent Node processes. Ctrl+C stops all. */
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const isDev = process.argv.includes('--dev');
const env = { ...process.env };
if (isDev) {
  env.CUSTOMER_PORT = env.DEV_CUSTOMER_PORT || '4400';
  env.ADMIN_PORT = env.DEV_ADMIN_PORT || '4401';
  env.API_PORT = env.DEV_API_PORT || '4402';
}
const instances = [
  ['api', 'backend/api/server.js', []],
  ['customer', 'backend/portals/server.js', ['customer']],
  ['admin', 'backend/portals/server.js', ['admin']]
];
const children = instances.map(([name, script, args]) => {
  const child = spawn(process.execPath, [...(isDev ? ['--watch'] : []), path.join(ROOT, script), ...args], { cwd: ROOT, env, stdio: 'inherit' });
  child.on('error', error => console.error(`${name}: ${error.message}`));
  return child;
});
let closing = false;
function stop(signal = 'SIGTERM') { if (closing) return; closing = true; for (const child of children) child.kill(signal); }
process.on('SIGINT', () => stop('SIGTERM'));
process.on('SIGTERM', () => stop('SIGTERM'));
children.forEach((child, index) => child.on('exit', (code, signal) => {
  if (!closing && code !== 0) { console.error(`${instances[index][0]} exited unexpectedly (code=${code}, signal=${signal}).`); stop(); process.exitCode = 1; }
}));
