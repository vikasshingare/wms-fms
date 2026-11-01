import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'server');
const require = createRequire(path.join(serverDir, 'package.json'));
require('dotenv').config({ path: path.join(serverDir, '.env'), quiet: true });
const mysql = require('mysql2/promise');
// The exact database generated here is the only database this runner cleans up.
const testDatabase = `service360_test_${Date.now()}`;
const env = { ...process.env, DB_NAME: testDatabase, PORT: '4001', HOST: '127.0.0.1', TEST_API_URL: 'http://127.0.0.1:4001/api' };
let api;
let created = false;
async function run(file, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { cwd, env, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(file)} exited ${code}`)));
  });
}
try {
  await new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', () => reject(new Error('Test port 4001 is in use. No existing process was stopped.')));
    listener.listen(4001, '127.0.0.1', () => listener.close(resolve));
  });
  created = true;
  await run(path.join(serverDir, 'src/setup.js'), serverDir);
  api = spawn(process.execPath, [path.join(serverDir, 'src/index.js')], { cwd: serverDir, env, stdio: 'inherit', windowsHide: true });
  api.on('error', error => console.error(error.message));
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (api.exitCode !== null) throw new Error('Isolated test API exited before becoming ready.');
    try { ready = (await fetch(env.TEST_API_URL + '/health', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error('Test API did not become ready.');
  await run(path.join(root, 'tests/integration.mjs'), root);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (api && api.exitCode === null) {
    const exited = new Promise(resolve => api.once('exit', resolve));
    api.kill();
    await exited;
  }
  if (created) {
    if (!/^service360_test_[0-9]+$/.test(testDatabase)) throw new Error('Unsafe test cleanup target');
    const db = await mysql.createConnection({ host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306), user: env.DB_ADMIN_USER || 'root', password: env.DB_ADMIN_PASSWORD || '' });
    await db.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
    await db.end();
    console.log('Temporary integration database removed; demonstration data was preserved.');
  }
}
