// api/voice/freedom-projection.js
// GET /api/voice/freedom-projection?objetivo=50000000
// "Siri, ¿cuánto me falta para mi libertad financiera?"
//
// Si no se pasa "objetivo", busca una meta guardada de tipo
// 'libertad_financiera'; si no existe ninguna, pide el dato.
// Es una SIMULACIÓN con supuestos fijos (rendimiento medio, 8%
// anual), no una garantía — así se lo aclaramos siempre al usuario.

const { getDB, checkAuth } = require('./_lib/store');
const { calcularPatrimonio, presupuestoMensual, mesesParaObjetivo, money } = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = await getDB();
  let objetivo = req.query.objetivo ? Number(req.query.objetivo) : null;

  if (!objetivo) {
    const meta = db.savingsGoals.find((g) => g.kind === 'libertad_financiera');
    objetivo = meta ? meta.targetAmount : null;
  }
  if (!objetivo) {
    return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuál es tu objetivo de patrimonio para la libertad financiera?' });
  }

  const now = new Date();
  const pat = calcularPatrimonio(db);
  const presu = presupuestoMensual(db, now.getFullYear(), now.getMonth() + 1);
  const aporteMensual = Math.max(0, presu.savings);

  const meses = mesesParaObjetivo(pat.patrimonioNeto, objetivo, aporteMensual, 8);

  if (meses === null) {
    return res.status(200).json({ status: 'ok', mensaje: `Con tu ritmo actual de ahorro, ${money(aporteMensual)} por mes, todavía es difícil estimar una fecha para llegar a ${money(objetivo)}.` });
  }
  if (meses === 0) {
    return res.status(200).json({ status: 'ok', mensaje: 'Ya alcanzaste ese objetivo de patrimonio.' });
  }

  const fecha = new Date(); fecha.setMonth(fecha.getMonth() + meses);
  const anios = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;

  return res.status(200).json({
    status: 'ok',
    mensaje: `Con ${money(aporteMensual)} de ahorro mensual, a un rendimiento estimado del 8% anual, llegarías a ${money(objetivo)} en aproximadamente ${anios} años y ${mesesRestantes} meses. Esto es una simulación, no una garantía.`,
  });
};
