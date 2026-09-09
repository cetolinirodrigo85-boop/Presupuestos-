// api/voice/investment-capacity.js
// GET /api/voice/investment-capacity
// "Siri, ¿cuánto puedo invertir?"

const { getDB, checkAuth } = require('./_lib/store');
const { presupuestoMensual, calcularCapacidadInversion, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const now = new Date();
  const resumen = presupuestoMensual(db, now.getFullYear(), now.getMonth() + 1);
  const fondo = db.savingsGoals.find((g) => g.kind === 'fondo_emergencia');
  const capacidad = calcularCapacidadInversion(Math.max(0, resumen.savings), fondo);

  const fondoCompleto = !fondo || fondo.currentAmount >= fondo.targetAmount;
  const mensaje = fondoCompleto
    ? `Podés destinar aproximadamente ${money(capacidad)} a inversión este mes.`
    : `Con tu fondo de emergencia todavía incompleto, te recomiendo no más de ${money(capacidad)} a inversión este mes.`;

  return res.status(200).json({ status: 'ok', mensaje });
};
