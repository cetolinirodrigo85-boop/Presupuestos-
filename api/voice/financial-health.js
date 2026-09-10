// api/voice/financial-health.js
// GET /api/voice/financial-health
// "Siri, ¿cómo está mi salud financiera?"

const { getDB, checkAuth } = require('./_lib/store');
const { saludFinanciera } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const now = new Date();
  const salud = saludFinanciera(db, now.getFullYear(), now.getMonth() + 1);

  return res.status(200).json({ status: 'ok', resultado: salud.resultado, mensaje: salud.mensaje });
};
