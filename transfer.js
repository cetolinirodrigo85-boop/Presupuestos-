// api/voice/transfer.js
// POST /api/voice/transfer  { amount, from, to }
// "Siri, transferí 20.000 de efectivo a Mercado Pago."

const { checkAuth, findAccountByName, insertTransfer } = require('./_lib/store');
const { money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const { amount, from, to } = req.body || {};
  if (!amount || amount <= 0) return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuánto querés transferir?' });
  if (!from || !to) return res.status(200).json({ status: 'necesita_info', mensaje: '¿Entre qué cuentas?' });

  const cuentaOrigen = await findAccountByName(from);
  const cuentaDestino = await findAccountByName(to);
  if (!cuentaOrigen || !cuentaDestino) {
    return res.status(200).json({ status: 'error', mensaje: 'No encontré alguna de esas cuentas.' });
  }

  await insertTransfer({ amount, fromAccountId: cuentaOrigen.id, toAccountId: cuentaDestino.id });

  return res.status(200).json({
    status: 'ok',
    mensaje: `Transferí ${money(amount)} de ${cuentaOrigen.name} a ${cuentaDestino.name}.`,
  });
};
