// api/voice/query.js
// GET /api/voice/query?type=balance
// GET /api/voice/query?type=affordability&amount=50000
// GET /api/voice/query?type=expenses-summary&period=semana
// GET /api/voice/query?type=freedom-projection&objetivo=50000000
// (lista completa de "type" soportados: balance, affordability,
// financial-summary, expenses-summary, income-summary, savings,
// investment-capacity, net-worth, emergency-fund, budget-status,
// financial-health, next-payment, installments-status, goals-status,
// freedom-projection)
//
// Se consolidaron acá todas las consultas de SOLO LECTURA porque el
// plan Hobby de Vercel permite como máximo 12 funciones serverless
// por deployment.

const { getDB, checkAuth } = require('./_lib/store');
const E = require('./_lib/engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const type = req.query.type;
  const db = await getDB();
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth() + 1;

  switch (type) {
    case 'balance': {
      const m = E.calcularDineroDisponible(db);
      return res.status(200).json({
        status: 'ok',
        mensaje: `Tenés ${E.money(m.saldoTotal)} en total. ${E.money(m.saldoComprometido + m.saldoInvertido)} están comprometidos y tenés ${E.money(m.saldoDisponibleReal)} disponibles.`,
        data: m,
      });
    }

    case 'affordability': {
      const amount = Number(req.query.amount);
      if (!amount || amount <= 0) return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuánto querés gastar?' });
      const m = E.calcularDineroDisponible(db);
      const resumen = E.presupuestoMensual(db, year, month);
      const r = E.puedoGastar(amount, m, Math.max(0, resumen.savings));
      return res.status(200).json({ status: 'ok', resultado: r.resultado, mensaje: r.mensaje });
    }

    case 'financial-summary': {
      const m = E.calcularDineroDisponible(db);
      const presupuesto = E.presupuestoMensual(db, year, month);
      const patrimonio = E.calcularPatrimonio(db);
      const fondo = db.savingsGoals.find((g) => g.kind === 'fondo_emergencia');
      const pctFondo = fondo && fondo.targetAmount > 0 ? Math.round((fondo.currentAmount / fondo.targetAmount) * 100) : 0;
      return res.status(200).json({
        status: 'ok',
        mensaje: `Este mes ingresaste ${E.money(presupuesto.income)} y gastaste ${E.money(presupuesto.expenses)}. Tu patrimonio neto es ${E.money(patrimonio.patrimonioNeto)} y tu fondo de emergencia está al ${pctFondo}%.`,
        data: { disponible: m, presupuesto, patrimonio, fondoEmergenciaPct: pctFondo },
      });
    }

    case 'expenses-summary': {
      const period = (req.query.period || 'mes').toLowerCase();
      const category = req.query.category;
      if (category) {
        const r = E.gastoEnCategoriaDelMes(db, category, year, month);
        return res.status(200).json({ status: 'ok', mensaje: r ? `Este mes gastaste ${E.money(r.amount)} en ${r.name}.` : `No encontré gastos en ${category} este mes.` });
      }
      if (period === 'top') {
        const top = E.topCategoriaDelMes(db, year, month);
        return res.status(200).json({ status: 'ok', mensaje: top ? `Tu mayor gasto este mes fue en ${top.name}, con ${E.money(top.amount)}.` : 'Todavía no registraste gastos este mes.' });
      }
      if (period === 'hoy') return res.status(200).json({ status: 'ok', mensaje: `Hoy gastaste ${E.money(E.gastosDeHoy(db))}.` });
      if (period === 'semana') return res.status(200).json({ status: 'ok', mensaje: `Esta semana gastaste ${E.money(E.gastosDeSemana(db))}.` });
      const resumen = E.presupuestoMensual(db, year, month);
      return res.status(200).json({ status: 'ok', mensaje: `Este mes gastaste ${E.money(resumen.expenses)}.` });
    }

    case 'income-summary': {
      const resumen = E.presupuestoMensual(db, year, month);
      return res.status(200).json({ status: 'ok', mensaje: `Este mes ingresaste ${E.money(resumen.income)}.` });
    }

    case 'savings': {
      const resumen = E.presupuestoMensual(db, year, month);
      const pct = resumen.income > 0 ? Math.round((resumen.savings / resumen.income) * 100) : 0;
      const mensaje = resumen.savings >= 0
        ? `Llevás ahorrado ${E.money(resumen.savings)} este mes, un ${pct}% de tus ingresos.`
        : `Este mes vas gastando ${E.money(Math.abs(resumen.savings))} más de lo que ingresó.`;
      return res.status(200).json({ status: 'ok', mensaje });
    }

    case 'investment-capacity': {
      const resumen = E.presupuestoMensual(db, year, month);
      const fondo = db.savingsGoals.find((g) => g.kind === 'fondo_emergencia');
      const capacidad = E.calcularCapacidadInversion(Math.max(0, resumen.savings), fondo);
      const fondoCompleto = !fondo || fondo.currentAmount >= fondo.targetAmount;
      const mensaje = fondoCompleto
        ? `Podés destinar aproximadamente ${E.money(capacidad)} a inversión este mes.`
        : `Con tu fondo de emergencia todavía incompleto, te recomiendo no más de ${E.money(capacidad)} a inversión este mes.`;
      return res.status(200).json({ status: 'ok', mensaje });
    }

    case 'net-worth': {
      const pat = E.calcularPatrimonio(db);
      return res.status(200).json({ status: 'ok', mensaje: `Tu patrimonio neto es ${E.money(pat.patrimonioNeto)}: ${E.money(pat.activos)} en activos y ${E.money(pat.pasivos)} en cuotas pendientes.`, data: pat });
    }

    case 'emergency-fund': {
      const fondo = db.savingsGoals.find((g) => g.kind === 'fondo_emergencia');
      if (!fondo) return res.status(200).json({ status: 'ok', mensaje: 'No tenés un fondo de emergencia configurado.' });
      const pct = fondo.targetAmount > 0 ? Math.round((fondo.currentAmount / fondo.targetAmount) * 100) : 0;
      const faltante = Math.max(0, fondo.targetAmount - fondo.currentAmount);
      return res.status(200).json({ status: 'ok', mensaje: `Tu fondo de emergencia está al ${pct}%: tenés ${E.money(fondo.currentAmount)} de ${E.money(fondo.targetAmount)}. Te faltan ${E.money(faltante)}.` });
    }

    case 'budget-status': {
      const gastos = E.gastosDelMes(db, year, month);
      const excedidas = db.expenseCategories
        .filter((c) => c.monthlyBudget)
        .map((c) => {
          const gastado = E.sum(gastos.filter((e) => e.categoryId === c.id).map((e) => e.amount));
          return { name: c.name, pct: Math.round((gastado / c.monthlyBudget) * 100) };
        })
        .filter((c) => c.pct >= 85);
      const mensaje = excedidas.length ? `Ojo con: ${excedidas.map((c) => `${c.name} al ${c.pct}%`).join(', ')}.` : 'Vas bien con tu presupuesto, ninguna categoría está en alerta.';
      return res.status(200).json({ status: 'ok', mensaje });
    }

    case 'financial-health': {
      const salud = E.saludFinanciera(db, year, month);
      return res.status(200).json({ status: 'ok', resultado: salud.resultado, mensaje: salud.mensaje });
    }

    case 'next-payment': {
      const prox = E.proximoVencimiento(db);
      const mensaje = prox
        ? `Tu próximo vencimiento es ${prox.name} por ${E.money(prox.amount)}, en ${prox.diasFaltan} día${prox.diasFaltan === 1 ? '' : 's'}.`
        : 'No tenés gastos fijos configurados con fecha.';
      return res.status(200).json({ status: 'ok', mensaje });
    }

    case 'installments-status': {
      const activas = db.installments.filter((i) => !i.isCompleted);
      if (!activas.length) return res.status(200).json({ status: 'ok', mensaje: 'No tenés cuotas activas.' });
      const detalle = activas.map((i) => `${i.name}: ${i.installmentsPaid} de ${i.installmentsTotal}`).join('. ');
      const totalMensual = activas.reduce((acc, i) => acc + i.installmentAmount, 0);
      return res.status(200).json({ status: 'ok', mensaje: `Tenés ${activas.length} cuota${activas.length === 1 ? '' : 's'} activa${activas.length === 1 ? '' : 's'}, por ${E.money(totalMensual)} al mes. ${detalle}.` });
    }

    case 'goals-status': {
      const metas = db.savingsGoals.filter((g) => g.kind === 'ahorro');
      if (!metas.length) return res.status(200).json({ status: 'ok', mensaje: 'Todavía no tenés metas de ahorro cargadas.' });
      const detalle = metas.map((g) => {
        const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
        return `${g.name} al ${pct}%`;
      }).join(', ');
      return res.status(200).json({ status: 'ok', mensaje: `Tus metas: ${detalle}.` });
    }

    case 'freedom-projection': {
      let objetivo = req.query.objetivo ? Number(req.query.objetivo) : null;
      if (!objetivo) {
        const meta = db.savingsGoals.find((g) => g.kind === 'libertad_financiera');
        objetivo = meta ? meta.targetAmount : null;
      }
      if (!objetivo) return res.status(200).json({ status: 'necesita_info', mensaje: '¿Cuál es tu objetivo de patrimonio para la libertad financiera?' });

      const pat = E.calcularPatrimonio(db);
      const presu = E.presupuestoMensual(db, year, month);
      const aporteMensual = Math.max(0, presu.savings);
      const meses = E.mesesParaObjetivo(pat.patrimonioNeto, objetivo, aporteMensual, 8);

      if (meses === null) return res.status(200).json({ status: 'ok', mensaje: `Con tu ritmo actual de ahorro, ${E.money(aporteMensual)} por mes, todavía es difícil estimar una fecha para llegar a ${E.money(objetivo)}.` });
      if (meses === 0) return res.status(200).json({ status: 'ok', mensaje: 'Ya alcanzaste ese objetivo de patrimonio.' });

      const anios = Math.floor(meses / 12);
      const mesesRestantes = meses % 12;
      return res.status(200).json({
        status: 'ok',
        mensaje: `Con ${E.money(aporteMensual)} de ahorro mensual, a un rendimiento estimado del 8% anual, llegarías a ${E.money(objetivo)} en aproximadamente ${anios} años y ${mesesRestantes} meses. Esto es una simulación, no una garantía.`,
      });
    }

    default:
      return res.status(400).json({ error: 'unknown_type', mensaje: 'Tipo de consulta no reconocido.' });
  }
};
