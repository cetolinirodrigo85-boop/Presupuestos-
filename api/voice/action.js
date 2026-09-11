// api/voice/action.js
// POST /api/voice/action  { type: 'expense'|'income'|'transfer'|'extra-money'|'confirm', ...campos }
//
// Se consolidaron acá todas las acciones que MODIFICAN datos
// (antes eran archivos separados: expense.js, income.js, transfer.js,
// extra-money.js, confirm.js) porque el plan Hobby de Vercel permite
// como máximo 12 funciones serverless por deployment.

const {
  getDB, checkAuth,
  getPrimaryAccountId, findOrCreateCategory, findOrCreateIncomeSource, findAccountByName,
  insertExpense, insertIncome, insertTransfer,
  sumExpensesForCategoryThisMonth, sumIncomeThisMonth,
  getEmergencyFund, addToSavingsGoal,
  savePendingAction, getPendingAction, resolvePendingAction,
} = require('./_lib/store');
const { money, distribuirDineroExtra } = require('./_lib/engine');

async function aplicarGasto({ amount, categoryName, description }) {
  const cat = await findOrCreateCategory(categoryName);
  const accountId = await getPrimaryAccountId();
  await insertExpense({ amount, categoryId: cat.id, accountId, description });
  return cat;
}

async function handleExpense(req, res) {
  const { amount, category, description } = req.body || {};
  if (!amount || amount <= 0) return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuánto gastaste?' });
  if (!category) return res.status(200).json({ status: 'necesita_info', mensaje: '¿En qué gastaste?' });

  const db = await getDB();
  const umbral = (db.profile && db.profile.voiceConfirmationThreshold) || 100000;

  if (amount > umbral) {
    const pendingId = await savePendingAction({ type: 'gasto', payload: { amount, categoryName: category, description } });
    return res.status(200).json({ status: 'necesita_confirmacion', pendingId, mensaje: `Estás registrando un gasto de ${money(amount)}. ¿Querés confirmar?` });
  }

  const cat = await aplicarGasto({ amount, categoryName: category, description });
  const gastadoEnCategoria = await sumExpensesForCategoryThisMonth(cat.id);
  return res.status(200).json({ status: 'ok', mensaje: `Registrado. Llevás ${money(gastadoEnCategoria)} gastados en ${cat.name} este mes.` });
}

async function handleIncome(req, res) {
  const { amount, source } = req.body || {};
  if (!amount || amount <= 0) return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuánto cobraste?' });
  if (!source) return res.status(200).json({ status: 'necesita_info', mensaje: '¿De dónde provino el ingreso?' });

  const src = await findOrCreateIncomeSource(source);
  const accountId = await getPrimaryAccountId();
  await insertIncome({ amount, incomeSourceId: src.id, accountId });
  const totalMes = await sumIncomeThisMonth();
  return res.status(200).json({ status: 'ok', mensaje: `Registrado. Tus ingresos del mes son ${money(totalMes)}.` });
}

async function handleTransfer(req, res) {
  const { amount, from, to } = req.body || {};
  if (!amount || amount <= 0) return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuánto querés transferir?' });
  if (!from || !to) return res.status(200).json({ status: 'necesita_info', mensaje: '¿Entre qué cuentas?' });

  const cuentaOrigen = await findAccountByName(from);
  const cuentaDestino = await findAccountByName(to);
  if (!cuentaOrigen || !cuentaDestino) return res.status(200).json({ status: 'error', mensaje: 'No encontré alguna de esas cuentas.' });

  await insertTransfer({ amount, fromAccountId: cuentaOrigen.id, toAccountId: cuentaDestino.id });
  return res.status(200).json({ status: 'ok', mensaje: `Transferí ${money(amount)} de ${cuentaOrigen.name} a ${cuentaDestino.name}.` });
}

async function handleExtraMoney(req, res) {
  const { amount } = req.body || {};
  if (!amount || amount <= 0) return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuánto tenés de extra?' });

  const db = await getDB();
  const fondo = db.savingsGoals.find((g) => g.kind === 'fondo_emergencia');
  const d = distribuirDineroExtra(amount, fondo);

  const pendingId = await savePendingAction({ type: 'distribucion_extra', payload: { amount } });
  return res.status(200).json({
    status: 'necesita_confirmacion', pendingId,
    mensaje: `${money(d.fondoEmergencia)} para fondo de emergencia. ${money(d.inversion)} para inversión. ${money(d.libre)} disponibles. ¿Confirmás?`,
  });
}

async function handleConfirm(req, res) {
  const { pendingId, confirm } = req.body || {};
  if (!pendingId) return res.status(400).json({ error: 'missing_pendingId' });

  const action = await getPendingAction(pendingId);
  if (!action) return res.status(200).json({ status: 'error', mensaje: 'Esa operación ya expiró o no existe.' });

  if (!confirm) {
    await resolvePendingAction(pendingId, 'rechazado');
    return res.status(200).json({ status: 'ok', mensaje: 'Listo, no se registró nada.' });
  }

  if (action.type === 'gasto') {
    await aplicarGasto(action.payload);
    await resolvePendingAction(pendingId, 'confirmado');
    return res.status(200).json({ status: 'ok', mensaje: 'Gasto confirmado y registrado.' });
  }

  if (action.type === 'distribucion_extra') {
    const fondo = await getEmergencyFund();
    if (fondo) {
      const faltante = Math.max(0, fondo.target_amount - fondo.current_amount);
      const aFondo = Math.min(faltante, Math.round(action.payload.amount * 0.6 * 100) / 100);
      if (aFondo > 0) await addToSavingsGoal(fondo.id, aFondo);
    }
    await resolvePendingAction(pendingId, 'confirmado');
    return res.status(200).json({ status: 'ok', mensaje: 'Listo. Distribución aplicada.' });
  }

  return res.status(200).json({ status: 'error', mensaje: 'Tipo de acción no reconocido.' });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const { type } = req.body || {};
  switch (type) {
    case 'expense': return handleExpense(req, res);
    case 'income': return handleIncome(req, res);
    case 'transfer': return handleTransfer(req, res);
    case 'extra-money': return handleExtraMoney(req, res);
    case 'confirm': return handleConfirm(req, res);
    default: return res.status(400).json({ error: 'unknown_type', mensaje: 'Tipo de acción no reconocido.' });
  }
};
