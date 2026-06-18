'use strict';

const net = require('net');
const fs  = require('fs');
const path = require('path');

function checkPort(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', err => resolve({ free: false, error: err.code }));
    srv.once('listening', () => srv.close(() => resolve({ free: true })));
    srv.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort, maxAttempts = 10) {
  const base = Number(startPort) || 3001;
  for (let i = 0; i < maxAttempts; i++) {
    const port = base + i;
    const result = await checkPort(port);
    if (result.free) return port;
  }
  return null;
}

function writeApiPort(port, rootDir) {
  const file = path.join(rootDir || path.join(__dirname, '..'), '.api-port');
  fs.writeFileSync(file, String(port), 'utf8');
}

function listenApp(app, port) {
  return new Promise((resolve, reject) => {
    const srv = app.listen(port, '127.0.0.1', () => resolve({ srv, port }));
    srv.once('error', reject);
  });
}

async function startApp(app, { preferredPort = 3001, rootDir, maxAttempts = 10 } = {}) {
  const base = Number(process.env.PORT) || preferredPort;

  for (let i = 0; i < maxAttempts; i++) {
    const port = base + i;
    try {
      const { srv } = await listenApp(app, port);
      writeApiPort(port, rootDir);
      return { srv, port, preferredBusy: i > 0 ? base : null };
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
    }
  }

  const err = new Error(`No free port found between ${base} and ${base + maxAttempts - 1}`);
  err.code = 'NO_FREE_PORT';
  throw err;
}

module.exports = {
  checkPort,
  findAvailablePort,
  writeApiPort,
  startApp,
};
