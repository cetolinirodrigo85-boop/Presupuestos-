// api/voice/init.js
// ============================================================
// Se llama UNA sola vez para sembrar la base en Vercel KV con
// tus datos reales. Después de correrlo, podés borrar el acceso
// o dejarlo (está protegido por token igual).
//
// Ejemplo de uso (reemplazá TU-DOMINIO y TU-TOKEN):
//   curl -X POST https://TU-DOMINIO.vercel.app/api/voice/init \
//     -H "Authorization: Bearer TU-TOKEN"
// ============================================================

const { saveDB, checkAuth, uid } = require('./_lib/store');

function seedDB() {
  return {
    profile: { name: 'Rodrigo', currency: 'ARS', voiceConfirmationThreshold: 100000 },
    accounts: [
      { id: uid(), name: 'Cuenta principal', type: 'billetera_virtual', balanceTotal: 100000, balanceReserved: 80000, balanceInvested: 0, isActive: true },
    ],
    incomeSources: [
      { id: uid(), name: 'Ferretería', expectedAmount: 1100000, frequency: 'semanal' },
      { id: uid(), name: 'Pizzería', expectedAmount: 585000, frequency: 'variable' },
    ],
    incomeTransactions: [],
    expenseCategories: [
      { id: uid(), name: 'Alquiler', monthlyBudget: 310000, isFixed: true },
      { id: uid(), name: 'Electricidad', monthlyBudget: 80000, isFixed: true },
      { id: uid(), name: 'Comida', monthlyBudget: 350000, isFixed: false },
      { id: uid(), name: 'Cuota iPhone', monthlyBudget: 200000, isFixed: true },
      { id: uid(), name: 'Transporte', monthlyBudget: 60000, isFixed: false },
      { id: uid(), name: 'Otros', monthlyBudget: 50000, isFixed: false },
    ],
    expenses: [],
    recurringExpenses: [
      { id: uid(), name: 'Alquiler', amount: 310000, dayOfMonth: 1, isActive: true },
      { id: uid(), name: 'Electricidad', amount: 80000, dayOfMonth: 10, isActive: true },
    ],
    installments: [
      { id: uid(), name: 'iPhone', installmentAmount: 200000, installmentsTotal: 6, installmentsPaid: 0, isCompleted: false },
    ],
    transfers: [],
    savingsGoals: [
      { id: uid(), kind: 'fondo_emergencia', name: 'Fondo de emergencia', targetAmount: 3000000, currentAmount: 0, priority: 1 },
    ],
    investments: [],
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = seedDB();
  await saveDB(db);
  return res.status(200).json({ status: 'ok', mensaje: 'Base inicializada.' });
};
