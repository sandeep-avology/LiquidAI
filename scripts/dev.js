'use strict';
// Cross-platform dev launcher:
// 1. Free the preferred API port
// 2. Start server.js and wait until it is listening
// 3. Start vite with the correct API proxy port
const { execSync, spawn } = require('child_process');
const fs   = require('fs');
const net  = require('net');
const os   = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3001;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isPortFree(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

function killPort(port) {
  try {
    if (os.platform() === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const pids = new Set();
      for (const line of out.split('\n')) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && /^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'pipe' });
          console.log(`  Stopped process ${pid} on port ${port}.`);
        } catch {
          // already gone
        }
      }
      if (pids.size) console.log(`  Freed port ${port}.`);
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'pipe' });
      console.log(`  Freed port ${port}.`);
    }
  } catch {
    // port wasn't in use
  }
}

async function waitForPortFree(port, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    if (await isPortFree(port)) return true;
    await sleep(150);
  }
  return false;
}

async function waitForServer(portFile, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    if (fs.existsSync(portFile)) {
      const port = Number(fs.readFileSync(portFile, 'utf8').trim());
      if (port && !(await isPortFree(port))) return port;
    }
    await sleep(250);
  }
  return null;
}

function spawnProc(command, args, env = {}) {
  return spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
    env: { ...process.env, ...env },
  });
}

async function main() {
  killPort(PORT);
  await waitForPortFree(PORT);

  console.log('\n  Starting API server…\n');

  const serverProc = spawnProc(process.execPath, [path.join(ROOT, 'server.js')]);
  const portFile = path.join(ROOT, '.api-port');

  const apiPort = await waitForServer(portFile);
  if (!apiPort) {
    console.error('\n  API server failed to start. Check errors above.\n');
    serverProc.kill('SIGTERM');
    process.exit(1);
  }

  console.log(`\n  API ready on port ${apiPort}. Starting Vite…\n`);

  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const viteProc = spawnProc(process.execPath, [viteBin], { VITE_API_PORT: String(apiPort) });

  const shutdown = signal => {
    viteProc.kill(signal);
    serverProc.kill(signal);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  serverProc.on('exit', code => {
    if (code) {
      console.error('\n  API server stopped. Shutting down Vite.\n');
      viteProc.kill('SIGTERM');
      process.exit(code ?? 1);
    }
  });

  viteProc.on('exit', code => {
    if (code) {
      console.error('\n  Vite stopped. Shutting down API server.\n');
      serverProc.kill('SIGTERM');
      process.exit(code ?? 1);
    }
  });
}

main().catch(err => {
  console.error('Dev launcher failed:', err.message);
  process.exit(1);
});
