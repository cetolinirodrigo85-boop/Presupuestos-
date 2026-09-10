// api/voice/income.js
// POST /api/voice/income  { amount, source }
// "Siri, cobré 25.000 pesos de la pizzería."

const {
  getDB, checkAuth,
  getPrimaryAccountId, findOrCreateIncomeSource,
  insertIncome, sumIncomeThisMonth,
} = require('./_lib/store');
const { money } = require('./_lib/engine');

async function aplicarIngreso({ amount, sourceName }) {
  const src = await findOrCreateIncomeSource(sourceName);
  const accountId = await getPrimaryAccountId();
  await insertIncome({ amount, incomeSourceId: src.id, accountId });
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

  await aplicarIngreso({ amount, sourceName: source });
  const totalMes = await sumIncomeThisMonth();

  return res.status(200).json({
    status: 'ok',
    mensaje: `Registrado. Tus ingresos del mes son ${money(totalMes)}.`,
  });
};

module.exports._aplicarIngreso = aplicarIngreso; // usado por confirm.js
