// api/voice/_lib/store.js
// ============================================================
// RODRI CFO — Capa de datos
// Supabase (Postgres) como única fuente de verdad. Sin Vercel KV.
//
// Variables de entorno necesarias en Vercel:
//   SUPABASE_URL           → URL de tu proyecto Supabase
//   SUPABASE_SECRET_KEY    → la service_role key (NO la anon key,
//                            esta se salta RLS y por eso hay que
//                            tratarla como secreta)
//   RODRICFO_USER_ID       → el UUID de tu usuario en auth.users
//                            (Supabase Dashboard → Authentication → Users)
//   RODRICFO_API_TOKEN     → tu token propio para autenticar a Siri
// ============================================================

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function getUserId() {
  const userId = process.env.RODRICFO_USER_ID;
  if (!userId) throw new Error('RODRICFO_USER_ID_NOT_CONFIGURED');
  return userId;
}

// UUID real — las columnas id de Postgres son tipo uuid, no
// aceptan el id corto que se usaba con Vercel KV.
function newId() {
  return crypto.randomUUID();
}

function checkAuth(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return !!token && token === process.env.RODRICFO_API_TOKEN;
}

function throwIfError(error) {
  if (error) { console.error('Supabase error:', error); throw error; }
}

// ------------------------------------------------------------
// LECTURA AGREGADA — usada por balance / affordability /
// financial-summary / extra-money (son solo lectura, no mutan nada)
// ------------------------------------------------------------
async function getDB() {
  const userId = getUserId();

  const [profile, accounts, incomeSources, incomeTransactions, expenseCategories, expenses, recurringExpenses, installments, savingsGoals, investments] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('accounts').select('*').eq('user_id', userId),
      supabase.from('income_sources').select('*').eq('user_id', userId),
      supabase.from('income_transactions').select('*').eq('user_id', userId),
      supabase.from('expense_categories').select('*').eq('user_id', userId),
      supabase.from('expenses').select('*').eq('user_id', userId),
      supabase.from('recurring_expenses').select('*').eq('user_id', userId),
      supabase.from('installments').select('*').eq('user_id', userId),
      supabase.from('savings_goals').select('*').eq('user_id', userId),
      supabase.from('investments').select('*').eq('user_id', userId),
    ]);

  [profile, accounts, incomeSources, incomeTransactions, expenseCategories, expenses, recurringExpenses, installments, savingsGoals, investments]
    .forEach((r) => throwIfError(r.error));

  const p = profile.data;

  return {
    profile: p
      ? { ...p, voiceConfirmationThreshold: p.voice_confirmation_threshold ?? 100000 }
      : { voiceConfirmationThreshold: 100000 },

    accounts: (accounts.data || []).map((a) => ({
      ...a, isActive: a.is_active,
      balanceTotal: Number(a.balance_total || 0),
      balanceReserved: Number(a.balance_reserved || 0),
      balanceInvested: Number(a.balance_invested || 0),
    })),

    incomeSources: incomeSources.data || [],

    incomeTransactions: (incomeTransactions.data || []).map((t) => ({
      ...t, occurredOn: t.occurred_on, amount: Number(t.amount || 0),
      incomeSourceId: t.income_source_id, accountId: t.account_id,
    })),

    expenseCategories: expenseCategories.data || [],

    expenses: (expenses.data || []).map((e) => ({
      ...e, occurredOn: e.occurred_on, amount: Number(e.amount || 0),
      categoryId: e.category_id, accountId: e.account_id,
    })),

    recurringExpenses: (recurringExpenses.data || []).map((r) => ({
      ...r, isActive: r.is_active, amount: Number(r.amount || 0),
    })),

    installments: (installments.data || []).map((i) => ({
      ...i, isCompleted: i.is_completed,
      installmentAmount: Number(i.installment_amount || 0),
      installmentsTotal: Number(i.installments_total || 0),
      installmentsPaid: Number(i.installments_paid || 0),
    })),

    savingsGoals: (savingsGoals.data || []).map((g) => ({
      ...g, targetAmount: Number(g.target_amount || 0), currentAmount: Number(g.current_amount || 0),
    })),

    investments: (investments.data || []).map((i) => ({
      ...i, quantity: Number(i.quantity || 0),
      currentPrice: Number(i.current_price || 0),
      avgPurchasePrice: Number(i.avg_purchase_price || 0),
    })),
  };
}

// ------------------------------------------------------------
// CUENTAS
// ------------------------------------------------------------
async function getPrimaryAccountId() {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('accounts').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  throwIfError(error);
  return data ? data.id : null;
}

async function adjustAccountBalance(accountId, delta) {
  if (!accountId) return;
  const userId = getUserId();
  const { data: acc, error: selErr } = await supabase
    .from('accounts').select('balance_total').eq('id', accountId).eq('user_id', userId).single();
  throwIfError(selErr);
  const nuevo = Math.round((Number(acc.balance_total || 0) + delta) * 100) / 100;
  const { error } = await supabase
    .from('accounts').update({ balance_total: nuevo }).eq('id', accountId).eq('user_id', userId);
  throwIfError(error);
}

// ------------------------------------------------------------
// CATEGORÍAS DE GASTO / FUENTES DE INGRESO — buscar o crear
// ------------------------------------------------------------
async function findOrCreateCategory(name) {
  const userId = getUserId();
  const nombre = (name || 'Otros').trim();
  const { data: existing, error: selErr } = await supabase
    .from('expense_categories').select('*').eq('user_id', userId).ilike('name', nombre).maybeSingle();
  throwIfError(selErr);
  if (existing) return existing;

  const { data: created, error: insErr } = await supabase
    .from('expense_categories')
    .insert({ id: newId(), user_id: userId, name: nombre, monthly_budget: null, is_fixed: false })
    .select().single();
  throwIfError(insErr);
  return created;
}

async function findOrCreateIncomeSource(name) {
  const userId = getUserId();
  const nombre = (name || 'Otro ingreso').trim();
  const { data: existing, error: selErr } = await supabase
    .from('income_sources').select('*').eq('user_id', userId).ilike('name', nombre).maybeSingle();
  throwIfError(selErr);
  if (existing) return existing;

  const { data: created, error: insErr } = await supabase
    .from('income_sources')
    .insert({ id: newId(), user_id: userId, name: nombre, expected_amount: null, frequency: 'variable' })
    .select().single();
  throwIfError(insErr);
  return created;
}

// ------------------------------------------------------------
// INSERTAR GASTO / INGRESO (con su impacto en la cuenta)
// ------------------------------------------------------------
async function insertExpense({ amount, categoryId, accountId, description }) {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      id: newId(), user_id: userId, account_id: accountId, category_id: categoryId,
      amount, description: description || null, occurred_on: new Date().toISOString().slice(0, 10),
    })
    .select().single();
  throwIfError(error);
  await adjustAccountBalance(accountId, -amount);
  return data;
}

async function insertIncome({ amount, incomeSourceId, accountId }) {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('income_transactions')
    .insert({
      id: newId(), user_id: userId, account_id: accountId, income_source_id: incomeSourceId,
      amount, occurred_on: new Date().toISOString().slice(0, 10),
    })
    .select().single();
  throwIfError(error);
  await adjustAccountBalance(accountId, amount);
  return data;
}

async function sumExpensesForCategoryThisMonth(categoryId) {
  const userId = getUserId();
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabase
    .from('expenses').select('amount').eq('user_id', userId).eq('category_id', categoryId).gte('occurred_on', start);
  throwIfError(error);
  return (data || []).reduce((acc, e) => acc + Number(e.amount || 0), 0);
}

async function sumIncomeThisMonth() {
  const userId = getUserId();
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabase
    .from('income_transactions').select('amount').eq('user_id', userId).gte('occurred_on', start);
  throwIfError(error);
  return (data || []).reduce((acc, t) => acc + Number(t.amount || 0), 0);
}

// ------------------------------------------------------------
// FONDO DE EMERGENCIA / METAS DE AHORRO
// ------------------------------------------------------------
async function getEmergencyFund() {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('savings_goals').select('*').eq('user_id', userId).eq('kind', 'fondo_emergencia').maybeSingle();
  throwIfError(error);
  return data;
}

async function addToSavingsGoal(goalId, amount) {
  const userId = getUserId();
  const { data: goal, error: selErr } = await supabase
    .from('savings_goals').select('current_amount').eq('id', goalId).eq('user_id', userId).single();
  throwIfError(selErr);
  const nuevo = Math.round((Number(goal.current_amount || 0) + amount) * 100) / 100;
  const { error } = await supabase
    .from('savings_goals').update({ current_amount: nuevo }).eq('id', goalId).eq('user_id', userId);
  throwIfError(error);
}

async function insertTransfer({ amount, fromAccountId, toAccountId }) {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('transfers')
    .insert({
      id: newId(), user_id: userId, from_account_id: fromAccountId, to_account_id: toAccountId,
      amount, occurred_on: new Date().toISOString().slice(0, 10),
    })
    .select().single();
  throwIfError(error);
  await adjustAccountBalance(fromAccountId, -amount);
  await adjustAccountBalance(toAccountId, amount);
  return data;
}

async function findAccountByName(name) {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('accounts').select('*').eq('user_id', userId).ilike('name', (name || '').trim()).maybeSingle();
  throwIfError(error);
  return data;
}

// ------------------------------------------------------------
// PENDING ACTIONS (confirmaciones de gasto alto / dinero extra)
// ------------------------------------------------------------
async function savePendingAction(action) {
  const userId = getUserId();
  const id = newId();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await supabase.from('pending_actions').insert({
    id, user_id: userId, action_type: action.type, payload: action.payload,
    status: 'pendiente', source: action.source || 'siri', expires_at: expiresAt,
  });
  throwIfError(error);
  return id;
}

async function getPendingAction(id) {
  const userId = getUserId();
  const { data, error } = await supabase
    .from('pending_actions').select('*').eq('id', id).eq('user_id', userId).eq('status', 'pendiente').maybeSingle();
  throwIfError(error);
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    await resolvePendingAction(id, 'expirado');
    return null;
  }
  return { type: data.action_type, payload: data.payload };
}

async function resolvePendingAction(id, status) {
  // status válido: 'confirmado' | 'rechazado' | 'expirado'
  const userId = getUserId();
  const { error } = await supabase
    .from('pending_actions')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId);
  throwIfError(error);
}

module.exports = {
  getDB, checkAuth,
  getPrimaryAccountId, adjustAccountBalance, findAccountByName,
  findOrCreateCategory, findOrCreateIncomeSource,
  insertExpense, insertIncome, insertTransfer,
  sumExpensesForCategoryThisMonth, sumIncomeThisMonth,
  getEmergencyFund, addToSavingsGoal,
  savePendingAction, getPendingAction, resolvePendingAction,
};
