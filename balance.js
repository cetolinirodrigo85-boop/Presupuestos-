// api/voice/balance.js
// GET /api/voice/balance
// "Siri, ¿cuánto dinero tengo?" / "¿cuánto tengo disponible?"

const { getDB, checkAuth } = require('./_lib/store');
const { calcularDineroDisponible, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  const m = calcularDineroDisponible(db);

  const mensaje = `Tenés ${money(m.saldoTotal)} en total. ${money(m.saldoComprometido + m.saldoInvertido)} están comprometidos y tenés ${money(m.saldoDisponibleReal)} disponibles.`;

  return res.status(200).json({ status: 'ok', mensaje, data: m });
};
