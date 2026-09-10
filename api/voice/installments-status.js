// api/voice/installments-status.js
// GET /api/voice/installments-status
// "Siri, ¿cómo van mis cuotas?"

const { getDB, checkAuth } = require('./_lib/store');
const { money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const activas = db.installments.filter((i) => !i.isCompleted);

  if (!activas.length) {
    return res.status(200).json({ status: 'ok', mensaje: 'No tenés cuotas activas.' });
  }

  const detalle = activas
    .map((i) => `${i.name}: ${i.installmentsPaid} de ${i.installmentsTotal}`)
    .join('. ');
  const totalMensual = activas.reduce((acc, i) => acc + i.installmentAmount, 0);

  return res.status(200).json({
    status: 'ok',
    mensaje: `Tenés ${activas.length} cuota${activas.length === 1 ? '' : 's'} activa${activas.length === 1 ? '' : 's'}, por ${money(totalMensual)} al mes. ${detalle}.`,
  });
};
