import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT_FILE = path.join(ROOT, '.api-port');

process.chdir(ROOT);

['.env.local', '.env'].forEach((file) => {
  const p = path.join(ROOT, file);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: true });
});

const isWin = process.platform === 'win32';

function waitForApiPort(maxMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      try {
        const port = Number(fs.readFileSync(PORT_FILE, 'utf8').trim());
        if (port > 0) return resolve(port);
      } catch {
        // not ready
      }
      if (Date.now() - start > maxMs) {
        return reject(new Error('API server did not start — check terminal for errors'));
      }
      setTimeout(poll, 250);
    };
    poll();
  });
}

console.log('\n  Starting LiquidAI API server...\n');

const server = spawn('node', ['server.js'], {
  cwd: ROOT,
  env: { ...process.env },
  stdio: 'inherit',
  shell: isWin,
});

let vite = null;

try {
  const apiPort = await waitForApiPort();
  console.log(`\n  API ready on port ${apiPort} — starting Vite...\n`);

  vite = spawn('npx', ['vite'], {
    cwd: ROOT,
    env: { ...process.env, VITE_API_PORT: String(apiPort) },
    stdio: 'inherit',
    shell: isWin,
  });
} catch (err) {
  console.error('\n  ⚠ ', err.message, '\n');
  server.kill();
  process.exit(1);
}

function shutdown() {
  server.kill();
  vite?.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.on('exit', (code) => {
  vite?.kill();
  if (code && code !== 0) process.exit(code);
});

vite.on('exit', (code) => {
  server.kill();
  process.exit(code || 0);
});
