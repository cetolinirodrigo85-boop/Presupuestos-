// api/voice/savings.js
// GET /api/voice/savings
// "Siri, ¿cuánto ahorré este mes?" / "¿cuánto puedo ahorrar?"

const { getDB, checkAuth } = require('./_lib/store');
const { presupuestoMensual, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const now = new Date();
  const resumen = presupuestoMensual(db, now.getFullYear(), now.getMonth() + 1);
  const pct = resumen.income > 0 ? Math.round((resumen.savings / resumen.income) * 100) : 0;

  const mensaje = resumen.savings >= 0
    ? `Llevás ahorrado ${money(resumen.savings)} este mes, un ${pct}% de tus ingresos.`
    : `Este mes vas gastando ${money(Math.abs(resumen.savings))} más de lo que ingresó.`;

  return res.status(200).json({ status: 'ok', mensaje });
};
