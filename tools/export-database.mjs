import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'server');
const require = createRequire(path.join(server, 'package.json'));
require('dotenv').config({ path: path.join(server, '.env'), quiet: true });
const mysql = require('mysql2/promise');
const source = `service360_export_${Date.now()}`;
const verify = `${source}_verify`;
const connection = { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_ADMIN_USER || 'root', password: process.env.DB_ADMIN_PASSWORD || '' };
const db = await mysql.createConnection({ ...connection, multipleStatements: true });
const output = path.join(root, 'database', 'service360.sql');
try {
  await mkdir(path.dirname(output), { recursive: true });
  if (process.env.DB_PASSWORD) {
    await db.query("CREATE USER IF NOT EXISTS 'service360_app'@'localhost' IDENTIFIED BY ?", [process.env.DB_PASSWORD]);
  }
  const seed = spawnSync(process.execPath, ['src/setup.js'], { cwd: server, env: { ...process.env, DB_NAME: source }, stdio: 'inherit', windowsHide: true });
  if (seed.status !== 0) throw new Error('Demo database initialization failed');
  const dump = spawnSync(process.env.MYSQLDUMP_PATH || 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe', [
    `--host=${connection.host}`, `--port=${connection.port}`, `--user=${connection.user}`,
    '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--skip-dump-date',
    '--single-transaction', '--default-character-set=utf8mb4', `--result-file=${output}`, source,
  ], { env: { ...process.env, MYSQL_PWD: connection.password }, encoding: 'utf8', windowsHide: true });
  if (dump.status !== 0) throw new Error(dump.stderr || 'mysqldump failed');
  const sql = (await readFile(output, 'utf8')).replaceAll(source, 'service360');
  // Validate a real round-trip import without touching the live application database.
  await db.query(`CREATE DATABASE \`${verify}\` CHARACTER SET utf8mb4`);
  await db.changeUser({ database: verify });
  await db.query(sql);
  const [tables] = await db.query('SHOW TABLES');
  const [[users]] = await db.query('SELECT COUNT(*) AS count FROM users');
  if (tables.length < 20 || users.count !== 4) throw new Error('SQL round-trip verification failed');
  await writeFile(output, '-- Service360 schema and clean demo seed. No local credentials included.\n-- Import into a fresh database; application tables are replaced.\nCREATE DATABASE IF NOT EXISTS `service360` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE `service360`;\n\n' + sql);
  console.log(`Exported and verified ${tables.length} tables and ${users.count} demonstration users: database/service360.sql`);
} finally {
  for (const name of [source, verify]) {
    if (!/^service360_export_\d+(_verify)?$/.test(name)) throw new Error('Unsafe cleanup target');
    await db.query(`DROP DATABASE IF EXISTS \`${name}\``);
  }
  await db.end();
}
