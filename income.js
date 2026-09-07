// api/voice/income.js
// POST /api/voice/income  { amount, source }
// "Siri, cobré 25.000 pesos de la pizzería."

const { getDB, saveDB, checkAuth, uid } = require('./_lib/store');
const { presupuestoMensual, money } = require('./_lib/engine');

function findOrCreateSource(db, nombre) {
  const norm = (nombre || '').trim().toLowerCase();
  let src = db.incomeSources.find((s) => s.name.toLowerCase() === norm);
  if (!src) {
    src = { id: uid(), name: nombre || 'Otro ingreso', expectedAmount: null, frequency: 'variable' };
    db.incomeSources.push(src);
  }
  return src;
}

function aplicarIngreso(db, { amount, sourceName }) {
  const src = findOrCreateSource(db, sourceName);
  const account = db.accounts.find((a) => a.isActive);
  db.incomeTransactions.push({
    id: uid(), incomeSourceId: src.id, accountId: account ? account.id : null,
    amount, occurredOn: new Date().toISOString().slice(0, 10),
  });
  if (account) account.balanceTotal = Math.round((account.balanceTotal + amount) * 100) / 100;
  return src;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const { amount, source } = req.body || {};
  if (!amount || amount <= 0) {
    return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuánto cobraste?' });
  }
  if (!source) {
    return res.status(200).json({ status: 'necesita_info', mensaje: '¿De dónde provino el ingreso?' });
  }

  const db = await getDB();
  aplicarIngreso(db, { amount, sourceName: source });
  await saveDB(db);

  const now = new Date();
  const resumen = presupuestoMensual(db, now.getFullYear(), now.getMonth() + 1);

  return res.status(200).json({
    status: 'ok',
    mensaje: `Registrado. Tus ingresos del mes son ${money(resumen.income)}.`,
  });
};

module.exports._aplicarIngreso = aplicarIngreso; // usado por confirm.js
