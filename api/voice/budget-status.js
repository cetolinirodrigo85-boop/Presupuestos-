// api/voice/budget-status.js
// GET /api/voice/budget-status
// "Siri, ¿cómo voy con mi presupuesto?" / "¿estoy gastando demasiado?"

const { getDB, checkAuth } = require('./_lib/store');
const { gastosDelMes, sum, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const now = new Date();
  const gastos = gastosDelMes(db, now.getFullYear(), now.getMonth() + 1);

  const excedidas = db.expenseCategories
    .filter((c) => c.monthlyBudget)
    .map((c) => {
      const gastado = sum(gastos.filter((e) => e.categoryId === c.id).map((e) => e.amount));
      return { name: c.name, pct: Math.round((gastado / c.monthlyBudget) * 100) };
    })
    .filter((c) => c.pct >= 85);

  if (!excedidas.length) {
    return res.status(200).json({ status: 'ok', mensaje: 'Vas bien con tu presupuesto, ninguna categoría está en alerta.' });
  }

  const detalle = excedidas.map((c) => `${c.name} al ${c.pct}%`).join(', ');
  return res.status(200).json({ status: 'ok', mensaje: `Ojo con: ${detalle}.` });
};
