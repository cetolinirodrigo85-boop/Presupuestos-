// api/voice/net-worth.js
// GET /api/voice/net-worth
// "Siri, ¿cómo está mi patrimonio?"

const { getDB, checkAuth } = require('./_lib/store');
const { calcularPatrimonio, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const pat = calcularPatrimonio(db);

  return res.status(200).json({
    status: 'ok',
    mensaje: `Tu patrimonio neto es ${money(pat.patrimonioNeto)}: ${money(pat.activos)} en activos y ${money(pat.pasivos)} en cuotas pendientes.`,
    data: pat,
  });
};
