
// api/voice/expense.js
// POST /api/voice/expense  { amount, category, description? }
// "Siri, gasté 15.000 pesos en comida."
//
// Si el monto supera el umbral de confirmación, no se registra:
// se devuelve un pendingId que el cliente (Swift) debe confirmar
// con Face ID contra /api/voice/confirm.

const {
  getDB, checkAuth,
  getPrimaryAccountId, findOrCreateCategory,
  insertExpense, sumExpensesForCategoryThisMonth,
  savePendingAction,
} = require('./_lib/store');
const { money } = require('./_lib/engine');

async function aplicarGasto({ amount, categoryName, description }) {
  const cat = await findOrCreateCategory(categoryName);
  const accountId = await getPrimaryAccountId();
  await insertExpense({ amount, categoryId: cat.id, accountId, description });
  return cat;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const { amount, category, description } = req.body || {};
  if (!amount || amount <= 0) {
    return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuánto gastaste?' });
  }
  if (!category) {
    return res.status(200).json({ status: 'necesita_info', mensaje: '¿En qué gastaste?' });
  }

  const db = await getDB();
  const umbral = (db.profile && db.profile.voiceConfirmationThreshold) || 100000;

  if (amount > umbral) {
    const pendingId = await savePendingAction({ type: 'gasto', payload: { amount, categoryName: category, description } });
    return res.status(200).json({
      status: 'necesita_confirmacion',
      pendingId,
      mensaje: `Estás registrando un gasto de ${money(amount)}. ¿Querés confirmar?`,
    });
  }

  const cat = await aplicarGasto({ amount, categoryName: category, description });
  const gastadoEnCategoria = await sumExpensesForCategoryThisMonth(cat.id);

  return res.status(200).json({
    status: 'ok',
    mensaje: `Registrado. Llevás ${money(gastadoEnCategoria)} gastados en ${cat.name} este mes.`,
  });
};

module.exports._aplicarGasto = aplicarGasto; // usado por confirm.js
