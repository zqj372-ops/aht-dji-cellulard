#!/usr/bin/env node
// One-command local business loop:
//   npm run demo
// - starts the local reference Gateway on ws://127.0.0.1:8787
// - starts the Vite app in Gateway mode (VITE_AHT_DATA_SOURCE=gateway)
// - opens http://127.0.0.1:4173/ in the default browser
// - Ctrl+C stops both processes
import { spawn } from 'node:child_process';
import { spawn as spawnOpen } from 'node:child_process';

const gatewayPort = process.env.AHT_GATEWAY_PORT ?? '8787';
const webPort = process.env.AHT_WEB_PORT ?? '4173';
const root = new URL('..', import.meta.url).pathname;
const children = new Set();
let stopping = false;

function start(name, command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...options.env } });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (!stopping && code !== 0 && signal === null) {
      console.error(`[demo] ${name} exited with code ${code}`);
      stop();
    }
  });
  return child;
}

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      // process already gone
    }
  }
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const gateway = start('reference-gateway', process.execPath, ['scripts/dev-gateway.mjs'], {
  env: {
    AHT_GATEWAY_PORT: gatewayPort,
    ...(process.env.AHT_GATEWAY_STORE_PATH ? { AHT_GATEWAY_STORE_PATH: process.env.AHT_GATEWAY_STORE_PATH } : {}),
  },
});

const web = start('web', 'npx', ['vite', '--host', '127.0.0.1', '--port', webPort], {
  env: {
    VITE_AHT_DATA_SOURCE: 'gateway',
    VITE_AHT_GATEWAY_URL: `ws://127.0.0.1:${gatewayPort}`,
  },
});

const opener = setTimeout(() => {
  const openCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const openArgs = process.platform === 'win32' ? ['http://127.0.0.1:' + webPort] : ['http://127.0.0.1:' + webPort];
  try {
    const openerChild = spawnOpen(openCommand, openArgs, { cwd: root, stdio: 'ignore', detached: true });
    openerChild.on('error', () => {});
    openerChild.unref();
  } catch {
    // no browser opener available; just print the URL
  }
}, 1500);

opener.unref?.();
gateway.on('error', (error) => console.error('[demo] gateway error', error));
web.on('error', (error) => console.error('[demo] web error', error));

console.log(`[demo] reference Gateway: ws://127.0.0.1:${gatewayPort}`);
console.log(`[demo] open http://127.0.0.1:${webPort}/ to run the business loop (Gateway source)`);
