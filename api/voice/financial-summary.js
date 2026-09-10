// api/voice/financial-summary.js
// GET /api/voice/financial-summary
// "Siri, dame mi resumen financiero."
// Respuesta corta pensada para leerse en voz alta (sección 25).

const { getDB, checkAuth } = require('./_lib/store');
const { calcularDineroDisponible, presupuestoMensual, calcularPatrimonio, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const now = new Date();
  const m = calcularDineroDisponible(db);
  const presupuesto = presupuestoMensual(db, now.getFullYear(), now.getMonth() + 1);
  const patrimonio = calcularPatrimonio(db);
  const fondo = db.savingsGoals.find((g) => g.kind === 'fondo_emergencia');
  const pctFondo = fondo && fondo.targetAmount > 0 ? Math.round((fondo.currentAmount / fondo.targetAmount) * 100) : 0;

  const mensaje = `Este mes ingresaste ${money(presupuesto.income)} y gastaste ${money(presupuesto.expenses)}. Tu patrimonio neto es ${money(patrimonio.patrimonioNeto)} y tu fondo de emergencia está al ${pctFondo}%.`;

  return res.status(200).json({
    status: 'ok',
    mensaje,
    data: { disponible: m, presupuesto, patrimonio, fondoEmergenciaPct: pctFondo },
  });
};
