// Fail early with a clear message on old Node versions (CommonJS so it runs everywhere).
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`\nSC Telemetry needs Node.js 22.13 or newer. You have ${process.version}.`);
  console.error('Install the current LTS from https://nodejs.org (or: winget install OpenJS.NodeJS.LTS),');
  console.error('open a NEW terminal, then run: npm install && npm run build\n');
  process.exit(1);
}
