// api/voice/next-payment.js
// GET /api/voice/next-payment
// "Siri, ¿cuál es mi próximo pago?"

const { getDB, checkAuth } = require('./_lib/store');
const { proximoVencimiento, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const prox = proximoVencimiento(db);

  const mensaje = prox
    ? `Tu próximo vencimiento es ${prox.name} por ${money(prox.amount)}, en ${prox.diasFaltan} día${prox.diasFaltan === 1 ? '' : 's'}.`
    : 'No tenés gastos fijos configurados con fecha.';

  return res.status(200).json({ status: 'ok', mensaje });
};
