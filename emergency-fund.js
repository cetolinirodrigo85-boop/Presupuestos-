// api/voice/emergency-fund.js
// GET /api/voice/emergency-fund
// "Siri, ¿cómo va mi fondo de emergencia?"

const { getDB, checkAuth } = require('./_lib/store');
const { money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const fondo = db.savingsGoals.find((g) => g.kind === 'fondo_emergencia');
  if (!fondo) return res.status(200).json({ status: 'ok', mensaje: 'No tenés un fondo de emergencia configurado.' });

  const pct = fondo.targetAmount > 0 ? Math.round((fondo.currentAmount / fondo.targetAmount) * 100) : 0;
  const faltante = Math.max(0, fondo.targetAmount - fondo.currentAmount);

  return res.status(200).json({
    status: 'ok',
    mensaje: `Tu fondo de emergencia está al ${pct}%: tenés ${money(fondo.currentAmount)} de ${money(fondo.targetAmount)}. Te faltan ${money(faltante)}.`,
  });
};
