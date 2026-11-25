// One-click launcher used by "Start SC Telemetry.cmd" / "Start Simulator.cmd".
// Installs packages and rebuilds the web app only when needed, starts the
// server, and opens the cockpit in your browser.
'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const sim = process.argv.includes('--sim');
const noOpen = process.argv.includes('--no-open');
const win = process.platform === 'win32';
const npm = win ? 'npm.cmd' : 'npm';

require('./check-node.cjs');

function run(args, label) {
  console.log(`\n> ${label}`);
  const r = spawnSync(npm, args, { cwd: ROOT, stdio: 'inherit', shell: win });
  if (r.status !== 0) {
    console.error(`\n${label} failed (exit code ${r.status}). See the messages above.`);
    process.exit(r.status || 1);
  }
}

const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
function newest(dir) {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : mtime(p));
  }
  return t;
}

// 1. Packages: install on first run, or when package-lock.json changed (e.g. after git pull).
const installed = path.join(ROOT, 'node_modules', '.package-lock.json');
if (!fs.existsSync(installed) || mtime(path.join(ROOT, 'package-lock.json')) > mtime(installed)) {
  run(['install', '--no-audit', '--no-fund'], 'Installing packages (first run or after an update)');
}

// 2. Web app: build when missing or when anything in web/ is newer than the build.
const built = path.join(ROOT, 'web', 'dist', 'index.html');
const srcTime = Math.max(newest(path.join(ROOT, 'web', 'src')), newest(path.join(ROOT, 'web', 'public')), mtime(path.join(ROOT, 'web', 'index.html')), mtime(path.join(ROOT, 'vite.config.js')));
if (!fs.existsSync(built) || srcTime > mtime(built)) run(['run', 'build'], 'Building the screens');

// 3. Server.
let port = 8420;
try { port = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8')).server.port || port; } catch { /* defaults */ }
const args = ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server', 'index.js')];
if (sim) args.push('--source=sim');
console.log(`\n> Starting SC Telemetry${sim ? ' with simulated data' : ''}. Close this window to stop it.\n`);
const server = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
server.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill());

// 4. Open the browser once the server answers.
if (!noOpen) {
  const url = `http://localhost:${port}/`;
  const started = Date.now();
  const poll = () => {
    http.get(url, (res) => {
      res.resume();
      const opener = win ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
      spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    }).on('error', () => { if (Date.now() - started < 20000) setTimeout(poll, 500); });
  };
  setTimeout(poll, 800);
}
