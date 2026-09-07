// api/voice/_lib/store.js
// ============================================================
// RODRI CFO — Capa de datos
// Supabase como fuente de verdad.
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function getUserId() {
  const userId = process.env.RODRICFO_USER_ID;

  if (!userId) {
    throw new Error('RODRICFO_USER_ID_NOT_CONFIGURED');
  }

  return userId;
}

// ============================================================
// GET DB
// Devuelve los datos en el formato que actualmente utiliza
// engine.js y los endpoints de voz.
// ============================================================

async function getDB() {
  const userId = getUserId();

  const [
    profile,
    accounts,
    incomeSources,
    incomeTransactions,
    expenseCategories,
    expenses,
    recurringExpenses,
    installments,
    savingsGoals,
    investments,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(),

    supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('income_sources')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('income_transactions')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('expense_categories')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('recurring_expenses')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('installments')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('investments')
      .select('*')
      .eq('user_id', userId),
  ]);

  const results = [
    profile,
    accounts,
    incomeSources,
    incomeTransactions,
    expenseCategories,
    expenses,
    recurringExpenses,
    installments,
    savingsGoals,
    investments,
  ];

  for (const result of results) {
    if (result.error) {
      console.error('Supabase error:', result.error);
      throw result.error;
    }
  }

  const p = profile.data;

  return {
    profile: p
      ? {
          ...p,
          voiceConfirmationThreshold:
            p.voice_confirmation_threshold ?? 100000,
          faceIdRequired: p.face_id_required ?? true,
        }
      : {
          voiceConfirmationThreshold: 100000,
          faceIdRequired: true,
        },

    accounts: (accounts.data || []).map((a) => ({
      ...a,
      isActive: a.is_active,
      balanceTotal: Number(a.balance_total || 0),
      balanceReserved: Number(a.balance_reserved || 0),
      balanceInvested: Number(a.balance_invested || 0),
    })),

    incomeSources: (incomeSources.data || []).map((s) => ({
      ...s,
    })),

    incomeTransactions: (incomeTransactions.data || []).map((t) => ({
      ...t,
      occurredOn: t.occurred_on,
      amount: Number(t.amount || 0),
    })),

    expenseCategories: (expenseCategories.data || []).map((c) => ({
      ...c,
    })),

    expenses: (expenses.data || []).map((e) => ({
      ...e,
      occurredOn: e.occurred_on,
      amount: Number(e.amount || 0),
    })),

    recurringExpenses: (recurringExpenses.data || []).map((r) => ({
      ...r,
      isActive: r.is_active,
      amount: Number(r.amount || 0),
    })),

    installments: (installments.data || []).map((i) => ({
      ...i,
      isCompleted: i.is_completed,
      installmentAmount: Number(i.installment_amount || 0),
      installmentsTotal: Number(i.installments_total || 0),
      installmentsPaid: Number(i.installments_paid || 0),
    })),

    savingsGoals: (savingsGoals.data || []).map((g) => ({
      ...g,
      targetAmount: Number(g.target_amount || 0),
      currentAmount: Number(g.current_amount || 0),
    })),

    investments: (investments.data || []).map((i) => ({
      ...i,
      quantity: Number(i.quantity || 0),
      currentPrice: Number(i.current_price || 0),
      avgPurchasePrice: Number(i.avg_purchase_price || 0),
    })),
  };
}

// ============================================================
// SAVE DB
// En esta primera etapa los endpoints existentes siguen
// trabajando con objetos JS. Esta función sincroniza los cambios
// principales hacia Supabase.
// ============================================================

async function saveDB(db) {
  const userId = getUserId();

  // ----------------------------------------------------------
  // CUENTAS
  // ----------------------------------------------------------

  if (Array.isArray(db.accounts)) {
    for (const account of db.accounts) {
      if (!account.id) continue;

      const { error } = await supabase
        .from('accounts')
        .update({
          balance_total: Number(account.balanceTotal || 0),
          balance_reserved: Number(account.balanceReserved || 0),
          balance_invested: Number(account.balanceInvested || 0),
        })
        .eq('id', account.id)
        .eq('user_id', userId);

      if (error) throw error;
    }
  }

  // ----------------------------------------------------------
  // GASTOS
  // ----------------------------------------------------------

  if (Array.isArray(db.expenses)) {
    for (const expense of db.expenses) {
      if (!expense.id) continue;

      const { error } = await supabase
        .from('expenses')
        .update({
          amount: Number(expense.amount || 0),
          occurred_on: expense.occurredOn,
          description: expense.description || null,
        })
        .eq('id', expense.id)
        .eq('user_id', userId);

      if (error) throw error;
    }
  }

  // ----------------------------------------------------------
  // INGRESOS
  // ----------------------------------------------------------

  if (Array.isArray(db.incomeTransactions)) {
    for (const income of db.incomeTransactions) {
      if (!income.id) continue;

      const { error } = await supabase
        .from('income_transactions')
        .update({
          amount: Number(income.amount || 0),
          occurred_on: income.occurredOn,
        })
        .eq('id', income.id)
        .eq('user_id', userId);

      if (error) throw error;
    }
  }
}

// ============================================================
// PENDING ACTIONS
// Ahora se guardan en Supabase en vez de Vercel KV.
// ============================================================

async function savePendingAction(id, action) {
  const userId = getUserId();

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('pending_actions')
    .upsert({
      id,
      user_id: userId,
      action_type: action.actionType || action.type || null,
      payload: action,
      status: 'pendiente',
      source: action.source || 'siri',
      expires_at: expiresAt,
    });

  if (error) {
    console.error('Error saving pending action:', error);
    throw error;
  }
}

async function getPendingAction(id) {
  const userId = getUserId();

  const { data, error } = await supabase
    .from('pending_actions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'pendiente')
    .maybeSingle();

  if (error) {
    console.error('Error getting pending action:', error);
    throw error;
  }

  if (!data) return null;

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    await deletePendingAction(id);
    return null;
  }

  return data.payload;
}

async function deletePendingAction(id) {
  const userId = getUserId();

  const { error } = await supabase
    .from('pending_actions')
    .update({
      status: 'expirada',
    })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting pending action:', error);
    throw error;
  }
}

// ============================================================
// AUTENTICACIÓN DE LA API DE VOZ
// ============================================================

function checkAuth(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token || token !== process.env.RODRICFO_API_TOKEN) {
    return false;
  }

  return true;
}

// ============================================================
// ID LOCAL PARA ACCIONES PENDIENTES
// ============================================================

function uid() {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}

module.exports = {
  getDB,
  saveDB,
  savePendingAction,
  getPendingAction,
  deletePendingAction,
  checkAuth,
  uid,
};
