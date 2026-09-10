// api/voice/goals-status.js
// GET /api/voice/goals-status
// "Siri, ¿cómo van mis metas de ahorro?"

const { getDB, checkAuth } = require('./_lib/store');
const { money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const metas = db.savingsGoals.filter((g) => g.kind === 'ahorro');

  if (!metas.length) {
    return res.status(200).json({ status: 'ok', mensaje: 'Todavía no tenés metas de ahorro cargadas.' });
  }

  const detalle = metas
    .map((g) => {
      const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
      return `${g.name} al ${pct}%`;
    })
    .join(', ');

  return res.status(200).json({ status: 'ok', mensaje: `Tus metas: ${detalle}.` });
};
