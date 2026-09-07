// api/voice/expense.js
// POST /api/voice/expense  { amount, category, description? }
// "Siri, gasté 15.000 pesos en comida."
//
// Si el monto supera el umbral de confirmación, no se registra:
// se devuelve un pendingId que el cliente (Shortcuts/Swift) debe
// confirmar con Face ID contra /api/voice/confirm.

const { getDB, saveDB, savePendingAction, checkAuth, uid } = require('./_lib/store');
const { presupuestoMensual, sum, money } = require('./_lib/engine');

function findOrCreateCategory(db, nombre) {
  const norm = (nombre || '').trim().toLowerCase();
  let cat = db.expenseCategories.find((c) => c.name.toLowerCase() === norm);
  if (!cat) {
    cat = { id: uid(), name: nombre || 'Otros', monthlyBudget: null, isFixed: false };
    db.expenseCategories.push(cat);
  }
  return cat;
}

function aplicarGasto(db, { amount, categoryName, description }) {
  const cat = findOrCreateCategory(db, categoryName);
  const account = db.accounts.find((a) => a.isActive);
  db.expenses.push({
    id: uid(), categoryId: cat.id, accountId: account ? account.id : null,
    amount, description: description || '', occurredOn: new Date().toISOString().slice(0, 10),
  });
  if (account) account.balanceTotal = Math.round((account.balanceTotal - amount) * 100) / 100;
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
    const pendingId = uid();
    await savePendingAction(pendingId, { type: 'gasto', payload: { amount, categoryName: category, description } });
    return res.status(200).json({
      status: 'necesita_confirmacion',
      pendingId,
      mensaje: `Estás registrando un gasto de ${money(amount)}. ¿Querés confirmar?`,
    });
  }

  const cat = aplicarGasto(db, { amount, categoryName: category, description });
  await saveDB(db);

  const now = new Date();
  const gastadoEnCategoria = sum(
    db.expenses
      .filter((e) => e.categoryId === cat.id)
      .filter((e) => {
        const d = new Date(e.occurredOn);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .map((e) => e.amount)
  );

  return res.status(200).json({
    status: 'ok',
    mensaje: `Registrado. Llevás ${money(gastadoEnCategoria)} gastados en ${cat.name} este mes.`,
  });
};

module.exports._aplicarGasto = aplicarGasto; // usado por confirm.js
