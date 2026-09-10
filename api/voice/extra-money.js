// api/voice/extra-money.js
// POST /api/voice/extra-money  { amount }
// "Siri, tengo 300.000 pesos extra. ¿Qué hago?"
// Nunca aplica nada solo: siempre devuelve un pendingId para
// confirmar en /api/voice/confirm.

const { getDB, savePendingAction, checkAuth } = require('./_lib/store');
const { distribuirDineroExtra, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const { amount } = req.body || {};
  if (!amount || amount <= 0) {
    return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuánto tenés de extra?' });
  }

  const db = await getDB();
  const fondo = db.savingsGoals.find((g) => g.kind === 'fondo_emergencia');
  const d = distribuirDineroExtra(amount, fondo);

  const pendingId = await savePendingAction({ type: 'distribucion_extra', payload: { amount } });

  return res.status(200).json({
    status: 'necesita_confirmacion',
    pendingId,
    mensaje: `${money(d.fondoEmergencia)} para fondo de emergencia. ${money(d.inversion)} para inversión. ${money(d.libre)} disponibles. ¿Confirmás?`,
  });
};
