// api/voice/income-summary.js
// GET /api/voice/income-summary
// "Siri, ¿cuánto cobré este mes?"

const { getDB, checkAuth } = require('./_lib/store');
const { presupuestoMensual, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const now = new Date();
  const resumen = presupuestoMensual(db, now.getFullYear(), now.getMonth() + 1);

  return res.status(200).json({ status: 'ok', mensaje: `Este mes ingresaste ${money(resumen.income)}.` });
};
