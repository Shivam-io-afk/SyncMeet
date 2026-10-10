import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const apiPort = Number(process.env.E2E_API_PORT || 5102);
const baseUrl = `http://localhost:${apiPort}`;
const isWindows = process.platform === 'win32';
const childProcesses = [];
const playwrightArgs = process.argv.slice(2);

function isPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => error ? reject(error) : resolve(true));
    });
  });
}

async function waitForProductionHealth(child, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Isolated API exited before becoming ready (exit ${child.exitCode}).`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      const health = await response.json();
      if (response.ok && health.status === 'ok' && health.database?.connected) return;
    } catch {
      // The API may not have opened its listener yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the isolated production API and database.');
}

function startChild(command, args, options) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...options,
  });
  childProcesses.push(child);
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

let mongo;
let failure;

try {
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error('E2E_API_PORT must be a valid TCP port.');
  }
  if (!await isPortAvailable(apiPort)) {
    throw new Error(`Port ${apiPort} is already in use; isolated E2E did not start.`);
  }

  const npm = isWindows ? 'npm.cmd' : 'npm';
  const build = spawnSync(npm, ['run', 'build'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: isWindows,
    env: {
      ...process.env,
      VITE_API_URL: baseUrl,
      VITE_PUBLIC_APP_URL: baseUrl,
    },
  });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error(`Production build failed with exit ${build.status}.`);

  mongo = await MongoMemoryServer.create();
  const api = startChild(process.execPath, [path.join(projectRoot, 'server', 'server.js')], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(apiPort),
      MONGODB_URI: mongo.getUri('syncmeet_e2e'),
      JWT_SECRET: randomBytes(48).toString('hex'),
      CORS_ORIGINS: baseUrl,
      REDIS_URL: '',
      SENTRY_DSN: '',
      GEMINI_API_KEY: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
    },
  });

  await waitForProductionHealth(api);
  console.log(`Isolated production app is ready at ${baseUrl}; test data is held in temporary MongoDB.`);

  const playwright = startChild(process.execPath, [
    path.join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
    'test',
    ...playwrightArgs,
  ], {
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseUrl,
    },
  });

  const [code, signal] = await once(playwright, 'exit');
  if (code !== 0) {
    failure = new Error(`Playwright exited ${signal ? `from ${signal}` : `with code ${code}`}.`);
  }
} catch (error) {
  failure = error;
} finally {
  await Promise.all(childProcesses.reverse().map(stopChild));
  if (mongo) await mongo.stop();
}

if (failure) {
  console.error(failure.message);
  process.exitCode = 1;
}
