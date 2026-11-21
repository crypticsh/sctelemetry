// Runs the server (with the simulator unless you pass --game) and Vite together.
import { spawn } from 'node:child_process';

const game = process.argv.includes('--game');
const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const server = run('node', ['--disable-warning=ExperimentalWarning', '--watch', 'server/index.js', ...(game ? [] : ['--source=sim'])]);
const vite = run('npx', ['vite']);
const stop = () => { server.kill(); vite.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
