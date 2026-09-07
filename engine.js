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

function money(n) {
  const v = Math.round(n || 0);
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('es-AR');
}

module.exports = {
  round2, sum, isSameMonth, calcularDineroDisponible, gastosDelMes,
  presupuestoMensual, puedoGastar, distribuirDineroExtra, calcularPatrimonio, money,
};
