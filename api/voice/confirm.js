// api/voice/confirm.js
// POST /api/voice/confirm  { pendingId, confirm: true|false }
// Se llama después de que el usuario confirmó con Face ID en el
// dispositivo (ver VoiceIntents.swift). Ninguna operación de
// monto alto ni distribución de dinero extra se aplica sin pasar
// por acá.

const { checkAuth, getPendingAction, resolvePendingAction, getEmergencyFund, addToSavingsGoal } = require('./_lib/store');
const expenseModule = require('./expense');

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
    await resolvePendingAction(pendingId, 'rechazado');
    return res.status(200).json({ status: 'ok', mensaje: 'Listo, no se registró nada.' });
  }

  if (action.type === 'gasto') {
    await expenseModule._aplicarGasto(action.payload);
    await resolvePendingAction(pendingId, 'confirmado');
    return res.status(200).json({ status: 'ok', mensaje: 'Gasto confirmado y registrado.' });
  }

  if (action.type === 'distribucion_extra') {
    const fondo = await getEmergencyFund();
    if (fondo) {
      const faltante = Math.max(0, fondo.target_amount - fondo.current_amount);
      const aFondo = Math.min(faltante, Math.round(action.payload.amount * 0.6 * 100) / 100);
      if (aFondo > 0) await addToSavingsGoal(fondo.id, aFondo);
    }
    await resolvePendingAction(pendingId, 'confirmado');
    return res.status(200).json({ status: 'ok', mensaje: 'Listo. Distribución aplicada.' });
  }

  return res.status(200).json({ status: 'error', mensaje: 'Tipo de acción no reconocido.' });
};
