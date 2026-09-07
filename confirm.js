// api/voice/confirm.js
// POST /api/voice/confirm  { pendingId, confirm: true|false }
// Se llama después de que el usuario confirmó con Face ID en el
// dispositivo (ver VoiceIntents.swift). Ninguna operación de
// monto alto ni distribución de dinero extra se aplica sin pasar
// por acá.

const { getDB, saveDB, getPendingAction, deletePendingAction, checkAuth } = require('./_lib/store');
const expenseModule = require('./expense');
const incomeModule = require('./income');
const { distribuirDineroExtra, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const { pendingId, confirm } = req.body || {};
  if (!pendingId) return res.status(400).json({ error: 'missing_pendingId' });

  const action = await getPendingAction(pendingId);
  if (!action) {
    return res.status(200).json({ status: 'error', mensaje: 'Esa operación ya expiró o no existe.' });
  }

  if (!confirm) {
    await deletePendingAction(pendingId);
    return res.status(200).json({ status: 'ok', mensaje: 'Listo, no se registró nada.' });
  }

  const db = await getDB();

  if (action.type === 'gasto') {
    expenseModule._aplicarGasto(db, action.payload);
    await saveDB(db);
    await deletePendingAction(pendingId);
    return res.status(200).json({ status: 'ok', mensaje: 'Gasto confirmado y registrado.' });
  }

  if (action.type === 'distribucion_extra') {
    const fondo = db.savingsGoals.find((g) => g.kind === 'fondo_emergencia');
    const d = distribuirDineroExtra(action.payload.amount, fondo);
    if (fondo && d.fondoEmergencia > 0) {
      fondo.currentAmount = Math.round((fondo.currentAmount + d.fondoEmergencia) * 100) / 100;
    }
    await saveDB(db);
    await deletePendingAction(pendingId);
    return res.status(200).json({ status: 'ok', mensaje: 'Listo. Distribución aplicada.' });
  }

  return res.status(200).json({ status: 'error', mensaje: 'Tipo de acción no reconocido.' });
};
