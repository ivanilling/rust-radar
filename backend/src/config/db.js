import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import env from './env.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let memServer = null;
let localMongod = null;

const LOCAL_DB_PORT = 27017;
const LOCAL_DB_URI = `mongodb://127.0.0.1:${LOCAL_DB_PORT}/rust-radar`;

/** Ищем mongod, скачанный ранее mongodb-memory-server (он уже на диске). */
function findMongodBinary() {
  const dirs = [
    path.join(os.homedir(), '.cache', 'mongodb-binaries'),
    path.join(process.cwd(), 'node_modules', '.cache', 'mongodb-binaries'),
  ];
  for (const dir of dirs) {
    try {
      const f = fs
        .readdirSync(dir)
        .find((f) => f.startsWith('mongod') && (f.endsWith('.exe') || !f.includes('.')));
      if (f) return path.join(dir, f);
    } catch {
      /* папки нет — пропускаем */
    }
  }
  return null;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port }, () => {
      s.end();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.setTimeout(400, () => {
      s.destroy();
      resolve(false);
    });
  });
}

/**
 * Поднимаем НАСТОЯЩУЮ персистентную MongoDB локально: бинарник уже скачан
 * mongodb-memory-server'ом, данные пишем на диск (backend/.mongo-data).
 * Запущенный mongod живёт и после перезапуска бэкенда — данные не теряются.
 */
async function ensureLocalMongod() {
  if (await portOpen(LOCAL_DB_PORT)) return true; // уже кто-то работает — просто подключимся
  const bin = findMongodBinary();
  if (!bin) return false;
  const dbDir = path.resolve(__dirname, '../../.mongo-data');
  fs.mkdirSync(dbDir, { recursive: true });
  try {
    localMongod = spawn(
      bin,
      ['--dbpath', dbDir, '--port', String(LOCAL_DB_PORT), '--bind_ip', '127.0.0.1', '--quiet'],
      { stdio: 'ignore', detached: true }
    );
    localMongod.unref();
  } catch (err) {
    logger.warn('Не удалось запустить локальный mongod:', err.message);
    return false;
  }
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await portOpen(LOCAL_DB_PORT)) return true;
  }
  return false;
}

/**
 * Порядок подключения:
 *  1) MONGO_URI из env (для хостинга — Atlas или свой mongod);
 *  2) локальная персистентная MongoDB (бинарник из кэша, данные в .mongo-data);
 *  3) dev-fallback: mongodb-memory-server (in-memory, только если совсем ничего).
 * В production без рабочей MONGO_URI процесс падает.
 */
export async function connectDB() {
  const attempts = [];
  if (env.mongoUri) attempts.push({ label: 'MONGO_URI', uri: env.mongoUri });
  if (env.nodeEnv !== 'production') {
    if (await ensureLocalMongod()) {
      attempts.push({ label: 'локальная персистентная', uri: LOCAL_DB_URI });
    }
    attempts.push({ label: 'in-memory', uri: 'memory' });
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      if (attempt.uri === 'memory') {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        memServer = await MongoMemoryServer.create();
        await mongoose.connect(memServer.getUri('rust-radar'));
        logger.warn('MongoDB: IN-MEMORY (fallback) — данные пропадут при перезапуске');
      } else {
        await mongoose.connect(attempt.uri, { serverSelectionTimeoutMS: 5000 });
        logger.ok(
          `MongoDB подключена (${attempt.label})` +
            (attempt.label === 'локальная персистентная'
              ? ' — данные сохраняются в backend/.mongo-data'
              : '')
        );
      }
      return { mode: attempt.uri === 'memory' ? 'memory' : 'persistent' };
    } catch (err) {
      lastError = err;
      logger.warn(`MongoDB недоступна (${attempt.label}): ${err.message}`);
      mongoose.disconnect().catch(() => {});
    }
  }
  throw lastError || new Error('Нет доступной MongoDB');
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

/** Полная остановка (smoke-тест): разрыв соединения + останов in-memory mongod. */
export async function shutdownDB() {
  await mongoose.disconnect();
  if (memServer) {
    await memServer.stop();
    memServer = null;
  }
  if (localMongod) {
    try {
      localMongod.kill();
      localMongod = null;
    } catch {
      /* уже мёртв */
    }
  }
}
