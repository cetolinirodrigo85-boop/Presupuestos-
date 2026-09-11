// api/voice/_lib/engine.js
// ============================================================
// Mismo motor financiero que vive en index.html, portado a
// CommonJS para que lo usen las funciones serverless.
// Si cambiás una regla, cambiala en los dos lugares (por ahora
// son independientes a propósito, para no acoplar el front al back).
// ============================================================

function round2(n) { return Math.round(n * 100) / 100; }
function sum(arr) { return round2(arr.reduce((a, b) => a + b, 0)); }

function isSameMonth(iso, year, month) {
  const d = new Date(iso + 'T00:00:00');
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

function calcularDineroDisponible(db) {
  const activas = db.accounts.filter((a) => a.isActive);
  const saldoTotal = sum(activas.map((a) => a.balanceTotal));
  const saldoReservado = sum(activas.map((a) => a.balanceReserved));
  const saldoInvertido = sum(activas.map((a) => a.balanceInvested));
  const gastosFijos = sum(db.recurringExpenses.filter((r) => r.isActive).map((r) => r.amount));
  const cuotas = sum(db.installments.filter((i) => !i.isCompleted).map((i) => i.installmentAmount));
  const saldoComprometido = gastosFijos + cuotas;
  const saldoDisponible = saldoTotal - saldoReservado - saldoInvertido;
  const saldoDisponibleReal = saldoDisponible - saldoComprometido;
  return { saldoTotal, saldoReservado, saldoComprometido, saldoInvertido, saldoDisponible, saldoDisponibleReal };
}

function gastosDelMes(db, year, month) {
  return db.expenses.filter((e) => isSameMonth(e.occurredOn, year, month));
}

function presupuestoMensual(db, year, month) {
  const ingresos = sum(db.incomeTransactions.filter((t) => isSameMonth(t.occurredOn, year, month)).map((t) => t.amount));
  const gastos = gastosDelMes(db, year, month);
  const totalGastos = sum(gastos.map((e) => e.amount));
  return { income: ingresos, expenses: totalGastos, savings: ingresos - totalGastos };
}

function puedoGastar(monto, m, ahorroMensual) {
  if (monto <= m.saldoDisponibleReal) {
    return { resultado: 'verde', mensaje: 'Sí, podés hacerlo sin comprometer tus objetivos.' };
  }
  if (monto > m.saldoDisponible) {
    return { resultado: 'rojo', mensaje: 'No es recomendable. Ese gasto comprometería una obligación próxima.' };
  }
  const excedente = monto - m.saldoDisponibleReal;
  const dias = ahorroMensual > 0 ? Math.ceil((excedente / ahorroMensual) * 30) : null;
  return {
    resultado: 'amarillo',
    mensaje: dias
      ? `Podés hacerlo, pero retrasaría aproximadamente ${dias} días tu objetivo.`
      : 'Podés hacerlo, pero afecta tus objetivos de ahorro.',
  };
}

function distribuirDineroExtra(monto, fund) {
  const faltante = fund ? Math.max(0, fund.targetAmount - fund.currentAmount) : 0;
  let aFondo = 0, aInversion = 0, libre = 0;
  if (faltante > 0) {
    aFondo = Math.min(faltante, round2(monto * 0.6));
    const resto = monto - aFondo;
    aInversion = round2(resto * 0.6);
    libre = round2(resto - aInversion);
  } else {
    aInversion = round2(monto * 0.7);
    libre = round2(monto - aInversion);
  }
  return { fondoEmergencia: aFondo, inversion: aInversion, libre };
}

function calcularPatrimonio(db) {
  const activosCuentas = sum(db.accounts.filter((a) => a.isActive).map((a) => a.balanceTotal));
  const activosInversiones = sum(db.investments.map((i) => i.quantity * (i.currentPrice || i.avgPurchasePrice || 0)));
  const activos = activosCuentas + activosInversiones;
  const pasivos = sum(
    db.installments.filter((i) => !i.isCompleted).map((i) => i.installmentAmount * (i.installmentsTotal - i.installmentsPaid))
  );
  return { activos, pasivos, patrimonioNeto: activos - pasivos };
}

function gastosEnRango(db, desdeISO, hastaISO) {
  return db.expenses.filter((e) => e.occurredOn >= desdeISO && e.occurredOn <= hastaISO);
}

function gastosDeHoy(db) {
  const hoy = new Date().toISOString().slice(0, 10);
  return sum(gastosEnRango(db, hoy, hoy).map((e) => e.amount));
}

function gastosDeSemana(db) {
  const hoy = new Date();
  const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 6);
  return sum(gastosEnRango(db, hace7.toISOString().slice(0, 10), hoy.toISOString().slice(0, 10)).map((e) => e.amount));
}

function topCategoriaDelMes(db, year, month) {
  const gastos = gastosDelMes(db, year, month);
  const porCategoria = {};
  gastos.forEach((e) => { porCategoria[e.categoryId] = (porCategoria[e.categoryId] || 0) + e.amount; });
  let top = null;
  for (const catId in porCategoria) {
    if (!top || porCategoria[catId] > top.amount) top = { categoryId: catId, amount: porCategoria[catId] };
  }
  if (!top) return null;
  const cat = db.expenseCategories.find((c) => c.id === top.categoryId);
  return { name: cat ? cat.name : 'Sin categoría', amount: round2(top.amount) };
}

function gastoEnCategoriaDelMes(db, categoryName, year, month) {
  const cat = db.expenseCategories.find((c) => c.name.toLowerCase() === (categoryName || '').toLowerCase());
  if (!cat) return null;
  const total = sum(gastosDelMes(db, year, month).filter((e) => e.categoryId === cat.id).map((e) => e.amount));
  return { name: cat.name, amount: total };
}

function calcularCapacidadInversion(freeMoney, fund) {
  if (freeMoney <= 0) return 0;
  const fondoCompleto = !fund || fund.currentAmount >= fund.targetAmount;
  return fondoCompleto ? freeMoney : round2(freeMoney * 0.3);
}

function proximoVencimiento(db) {
  const hoy = new Date();
  const diaHoy = hoy.getDate();
  const activos = db.recurringExpenses.filter((r) => r.isActive && r.dayOfMonth);
  if (!activos.length) return null;

  let mejor = null;
  activos.forEach((r) => {
    let diasFaltan = r.dayOfMonth - diaHoy;
    if (diasFaltan < 0) diasFaltan += 30; // aproximado: pasa al mes que viene
    if (!mejor || diasFaltan < mejor.diasFaltan) mejor = { name: r.name, amount: r.amount, diasFaltan };
  });
  return mejor;
}

function saludFinanciera(db, year, month) {
  const presu = presupuestoMensual(db, year, month);
  const fondo = db.savingsGoals.find((g) => g.kind === 'fondo_emergencia');
  const pctFondo = fondo && fondo.targetAmount > 0 ? (fondo.currentAmount / fondo.targetAmount) * 100 : 0;
  const tasaAhorro = presu.income > 0 ? (presu.savings / presu.income) * 100 : 0;

  if (tasaAhorro >= 15 && pctFondo >= 50) {
    return { resultado: 'verde', mensaje: 'Tu situación financiera está sólida: estás ahorrando bien y tu fondo de emergencia avanza.' };
  }
  if (tasaAhorro < 0) {
    return { resultado: 'rojo', mensaje: 'Este mes estás gastando más de lo que ingresa. Conviene revisar los gastos variables.' };
  }
  return { resultado: 'amarillo', mensaje: 'Vas encaminado, pero todavía hay margen para mejorar el ahorro o el fondo de emergencia.' };
}

/** Calcula en cuántos meses, con este aporte y rendimiento, se alcanza un objetivo de patrimonio. */
function mesesParaObjetivo(actual, objetivo, aporteMensual, rendimientoAnualPct) {
  if (actual >= objetivo) return 0;
  const rMensual = rendimientoAnualPct / 100 / 12;
  let patrimonio = actual;
  let meses = 0;
  const limite = 12 * 80; // corte de seguridad: 80 años
  while (patrimonio < objetivo && meses < limite) {
    patrimonio = patrimonio * (1 + rMensual) + aporteMensual;
    meses++;
  }
  return meses >= limite ? null : meses;
}

function money(n) {
  const v = Math.round(n || 0);
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('es-AR');
}

module.exports = {
  round2, sum, isSameMonth, calcularDineroDisponible, gastosDelMes,
  presupuestoMensual, puedoGastar, distribuirDineroExtra, calcularPatrimonio, money,
  gastosEnRango, gastosDeHoy, gastosDeSemana, topCategoriaDelMes, gastoEnCategoriaDelMes,
  calcularCapacidadInversion, proximoVencimiento, saludFinanciera, mesesParaObjetivo,
};
