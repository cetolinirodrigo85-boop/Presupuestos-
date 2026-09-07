// api/voice/affordability.js
// POST /api/voice/affordability  { amount }
// "Siri, ¿puedo gastar 50.000 pesos?"

const { getDB, checkAuth } = require('./_lib/store');
const { calcularDineroDisponible, presupuestoMensual, puedoGastar } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const { amount } = req.body || {};
  if (!amount || amount <= 0) {
    return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuánto querés gastar?' });
  }

  const db = await getDB();
  const m = calcularDineroDisponible(db);
  const now = new Date();
  const resumen = presupuestoMensual(db, now.getFullYear(), now.getMonth() + 1);
  const r = puedoGastar(amount, m, Math.max(0, resumen.savings));

  return res.status(200).json({ status: 'ok', resultado: r.resultado, mensaje: r.mensaje });
};
