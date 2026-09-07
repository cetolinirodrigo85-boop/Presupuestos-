// api/voice/_lib/store.js
// ============================================================
// Capa de datos para la API de voz.
// Usa Vercel KV (Redis gestionado por Vercel) como única fuente
// de verdad para lo que Siri necesita leer/escribir.
//
// Setup en Vercel:
//   1. Dashboard del proyecto → Storage → Create Database → KV
//   2. Conectala al proyecto (esto agrega las env vars solo)
//   3. En tu proyecto: npm install @vercel/kv
// ============================================================

const { kv } = require('@vercel/kv');

const DB_KEY = 'rodricfo:db';
const PENDING_PREFIX = 'rodricfo:pending:';

async function getDB() {
  const db = await kv.get(DB_KEY);
  if (!db) {
    throw new Error('DB_NOT_SEEDED'); // llamar primero a /api/voice/init
  }
  return db;
}

async function saveDB(db) {
  await kv.set(DB_KEY, db);
}

async function savePendingAction(id, action) {
  // Expira en 10 minutos: si Rodrigo no confirma, se descarta solo.
  await kv.set(PENDING_PREFIX + id, action, { ex: 600 });
}

async function getPendingAction(id) {
  return await kv.get(PENDING_PREFIX + id);
}

async function deletePendingAction(id) {
  await kv.del(PENDING_PREFIX + id);
}

function checkAuth(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || token !== process.env.RODRICFO_API_TOKEN) {
    return false;
  }
  return true;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

module.exports = { getDB, saveDB, savePendingAction, getPendingAction, deletePendingAction, checkAuth, uid };
