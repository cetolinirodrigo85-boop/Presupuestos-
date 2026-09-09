// api/voice/expenses-summary.js
// GET /api/voice/expenses-summary?period=hoy|semana|mes&category=Comida
// "Siri, ¿cuánto gasté hoy/esta semana/este mes?" / "¿en qué gasté más?" / "¿cuánto gasté en comida?"

const { getDB, checkAuth } = require('./_lib/store');
const { gastosDeHoy, gastosDeSemana, presupuestoMensual, topCategoriaDelMes, gastoEnCategoriaDelMes, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const now = new Date();
  const period = (req.query.period || 'mes').toLowerCase();
  const category = req.query.category;

  if (category) {
    const r = gastoEnCategoriaDelMes(db, category, now.getFullYear(), now.getMonth() + 1);
    if (!r) return res.status(200).json({ status: 'ok', mensaje: `No encontré gastos en ${category} este mes.` });
    return res.status(200).json({ status: 'ok', mensaje: `Este mes gastaste ${money(r.amount)} en ${r.name}.` });
  }

  if (period === 'top') {
    const top = topCategoriaDelMes(db, now.getFullYear(), now.getMonth() + 1);
    const mensaje = top ? `Tu mayor gasto este mes fue en ${top.name}, con ${money(top.amount)}.` : 'Todavía no registraste gastos este mes.';
    return res.status(200).json({ status: 'ok', mensaje });
  }

  if (period === 'hoy') {
    return res.status(200).json({ status: 'ok', mensaje: `Hoy gastaste ${money(gastosDeHoy(db))}.` });
  }
  if (period === 'semana') {
    return res.status(200).json({ status: 'ok', mensaje: `Esta semana gastaste ${money(gastosDeSemana(db))}.` });
  }

  const resumen = presupuestoMensual(db, now.getFullYear(), now.getMonth() + 1);
  return res.status(200).json({ status: 'ok', mensaje: `Este mes gastaste ${money(resumen.expenses)}.` });
};
