import { financeDb } from '@/db/finance';
import { logAudit } from '@/lib/audit';
import { checkAdminPermission } from '@/lib/admin';
import type { Viewer } from '@/lib/finance/model';

export type FinanceActor = Pick<Viewer, 'person' | 'name' | 'role' | 'owner'>;

type PayrollTaxInput = { grossPay: number; allowances?: number; payrollRunId: string; employeeId: string };
type GLPostInput = { transactionId?: string; debitAccount: string; debitAmount: number; creditAccount: string; creditAmount: number; description: string };
type CashWithdrawalInput = { amount: number; purpose: string };
type CashCompleteInput = { receiptAmount: number; returnedCash: number };

async function requirePermission(actor: FinanceActor, module: string, tab: string | null, action: string) {
  const perm = await checkAdminPermission(actor, module, tab, action);
  if (!perm.allowed) throw new Error(perm.reason || `No permission for action: ${action}`);
}

export async function listChartOfAccounts(actor: FinanceActor) {
  await requirePermission(actor, 'finance', 'Chart of Accounts', 'View');
  const db = financeDb();
  const result = await db.prepare('SELECT * FROM finance_accounts ORDER BY account_number').all();
  return (result.results || []) as Record<string, unknown>[];
}

export async function postTransactionToGl(actor: FinanceActor, input: GLPostInput) {
  await requirePermission(actor, 'finance', null, 'Post');
  const db = financeDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (Math.abs(input.debitAmount - input.creditAmount) > 0.001) {
    throw new Error('Debit and credit amounts must balance');
  }

  await db.prepare(
    'INSERT INTO finance_journal_entries (id, transaction_id, debit_account, debit_amount, credit_account, credit_amount, description, posted_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, input.transactionId ?? null, input.debitAccount, input.debitAmount, input.creditAccount, input.creditAmount, input.description, now, actor.person).run();

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'finance_journal_entry', id, 'Post', 'Success', { newValue: input });

  return { journal_entry_id: id, posted_at: now };
}

export async function getGeneralLedger(actor: FinanceActor, accountNumber: string) {
  await requirePermission(actor, 'finance', null, 'View');
  const db = financeDb();
  const account = await db.prepare('SELECT * FROM finance_accounts WHERE account_number = ?').bind(accountNumber).first() as Record<string, unknown> | null;
  const entries = await db.prepare(
    'SELECT * FROM finance_journal_entries WHERE debit_account = ? OR credit_account = ? ORDER BY posted_at DESC'
  ).bind(accountNumber, accountNumber).all();

  const rows = (entries.results || []) as Record<string, unknown>[];
  const debitTotal = rows.reduce((s, r) => s + (r.debit_account === accountNumber ? Number(r.debit_amount) : 0), 0);
  const creditTotal = rows.reduce((s, r) => s + (r.credit_account === accountNumber ? Number(r.credit_amount) : 0), 0);

  return { account, entries: rows, debit_total: debitTotal, credit_total: creditTotal, balance: debitTotal - creditTotal };
}

export async function calculatePayrollTaxes(actor: FinanceActor, input: PayrollTaxInput) {
  const db = financeDb();
  const grossPay = input.grossPay;
  const allowances = input.allowances ?? 0;

  const FICA_RATE = 0.0765;
  const TWC_RATE = 0.0054;
  const TWC_WAGE_BASE = 42300;

  const federalWithholding = Math.max(0, grossPay * 0.12 - allowances * 75);
  const ficaEmployee = grossPay * FICA_RATE;
  const ficaEmployer = grossPay * FICA_RATE;
  const stateWithholding = 0;
  const twcUnemployment = Math.min(grossPay, TWC_WAGE_BASE) * TWC_RATE;
  const totalReserve = federalWithholding + ficaEmployee + ficaEmployer + stateWithholding + twcUnemployment;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.prepare(
    'INSERT INTO finance_tax_reserves (id, payroll_run_id, employee_id, federal_withholding, fica_employee_portion, fica_employer_portion, state_withholding, twc_unemployment, total_reserve_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, input.payrollRunId, input.employeeId, federalWithholding, ficaEmployee, ficaEmployer, stateWithholding, twcUnemployment, totalReserve, now).run();

  return {
    federalWithholding,
    ficaEmployee,
    ficaEmployer,
    stateWithholding,
    twcUnemployment,
    totalReserve,
    taxReserveId: id,
  };
}

export async function postRecoveryToFinance(actor: FinanceActor, recoveryId: string, payrollRunId: string) {
  await requirePermission(actor, 'finance', null, 'Post');
  const db = financeDb();
  const recovery = await db.prepare('SELECT * FROM ccr_employee_recovery WHERE id = ? AND is_active = 1').bind(recoveryId).first() as Record<string, unknown> | null;
  if (!recovery) throw new Error('Recovery record not found');

  const amount = Number(recovery.approved_total);
  const now = new Date().toISOString();

  const result = await postTransactionToGl(actor, {
    transactionId: recoveryId,
    debitAccount: '6100',
    debitAmount: amount,
    creditAccount: '2100',
    creditAmount: amount,
    description: `Recovery deduction for incident ${recovery.incident_id}`,
  });

  await db.prepare('UPDATE ccr_employee_recovery SET posted_deductions = ?, remaining_balance = ?, updated_at = ? WHERE id = ?').bind(amount, Number(recovery.approved_total) - amount, now, recoveryId).run();

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'ccr_employee_recovery', recoveryId, 'Post to Finance', 'Success', { newValue: { journal_entry_id: result.journal_entry_id, amount } });

  return { finance_transaction_id: result.journal_entry_id };
}

export async function getCashRegisterBalance(actor: FinanceActor, fundType = 'petty') {
  await requirePermission(actor, 'finance', 'Cash', 'View');
  const db = financeDb();
  const result = await db.prepare('SELECT * FROM cash_register WHERE fund_type = ?').bind(fundType).first() as Record<string, unknown> | null;
  if (!result) {
    const now = new Date().toISOString();
    await db.prepare('INSERT INTO cash_register (id, fund_type, balance, last_reconciled_at) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), fundType, 0, now).run();
    return { fund_type: fundType, balance: 0, last_reconciled_at: now };
  }
  return result;
}

export async function withdrawCash(actor: FinanceActor, input: CashWithdrawalInput) {
  await requirePermission(actor, 'finance', 'Cash', 'Withdraw');
  const db = financeDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.prepare(
    'INSERT INTO cash_withdrawal (id, amount, purpose, requested_by, approved_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, input.amount, input.purpose, actor.person, actor.person, 'Open', now).run();

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'cash_withdrawal', id, 'Create', 'Success', { newValue: input });
  return { withdrawal_id: id, created_at: now };
}

export async function completeCashWithdrawal(actor: FinanceActor, id: string, input: CashCompleteInput) {
  await requirePermission(actor, 'finance', 'Cash', 'Withdraw');
  const db = financeDb();
  const withdrawal = await db.prepare('SELECT * FROM cash_withdrawal WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
  if (!withdrawal) throw new Error('Withdrawal not found');

  const now = new Date().toISOString();
  const amount = Number(withdrawal.amount);
  const netUsed = amount - Number(input.returnedCash);

  await db.prepare(
    'UPDATE cash_withdrawal SET receipt_amount = ?, returned_cash = ?, status = ?, completed_at = ? WHERE id = ?'
  ).bind(input.receiptAmount, input.returnedCash, 'Completed', now, id).run();

  const current = await getCashRegisterBalance(actor, 'petty') as Record<string, unknown>;
  const newBalance = Number(current.balance) - netUsed;
  await db.prepare('UPDATE cash_register SET balance = ?, last_reconciled_at = ? WHERE fund_type = ?').bind(newBalance, now, 'petty').run();

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'cash_withdrawal', id, 'Complete', 'Success', { newValue: input });
  return { withdrawal_id: id, balance: newBalance };
}

export async function listCashWithdrawals(actor: FinanceActor, limit = 50) {
  await requirePermission(actor, 'finance', 'Cash', 'View');
  const db = financeDb();
  const result = await db.prepare('SELECT * FROM cash_withdrawal ORDER BY created_at DESC LIMIT ?').bind(limit).all();
  return (result.results || []) as Record<string, unknown>[];
}

export async function createPayrollRun(actor: FinanceActor, input: { employeeId: string; grossPay: number; allowances?: number; payrollRunId?: string; periodStart?: string; periodEnd?: string; payDate?: string }) {
  await requirePermission(actor, 'finance', 'Payroll', 'Create');
  const db = financeDb();
  const now = new Date().toISOString();
  const runId = input.payrollRunId || crypto.randomUUID();
  const periodStart = input.periodStart || now.slice(0, 10);
  const periodEnd = input.periodEnd || now.slice(0, 10);
  const payDate = input.payDate || now.slice(0, 10);

  const taxes = await calculatePayrollTaxes(actor, {
    employeeId: input.employeeId,
    grossPay: input.grossPay,
    payrollRunId: runId,
    allowances: input.allowances,
  });

  const netPay = input.grossPay - taxes.federalWithholding - taxes.ficaEmployee - taxes.stateWithholding;

  await db.prepare(
    'INSERT INTO finance_payroll_runs (id, employee_id, period_start, period_end, pay_date, gross_pay, federal_withholding, fica_employee, fica_employer, state_withholding, twc, net_pay, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(runId, input.employeeId, periodStart, periodEnd, payDate, input.grossPay, taxes.federalWithholding, taxes.ficaEmployee, taxes.ficaEmployer, taxes.stateWithholding, taxes.twcUnemployment, netPay, now).run();

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'finance_payroll_run', runId, 'Create', 'Success', { newValue: { employee_id: input.employeeId, gross_pay: input.grossPay, net_pay: netPay } });

  return { run_id: runId, employee_id: input.employeeId, gross_pay: input.grossPay, net_pay: netPay, taxes };
}

export async function createPayrollRunBatch(actor: FinanceActor, items: { employeeId: string; grossPay: number; allowances?: number; periodStart?: string; periodEnd?: string; payDate?: string }[]) {
  const results = [];
  for (const item of items) {
    const result = await createPayrollRun(actor, item);
    results.push(result);
  }
  return results;
}

export async function getPayslips(actor: FinanceActor, limit = 12) {
  await requirePermission(actor, 'me', 'Payslips', 'View');
  const db = financeDb();
  const result = await db.prepare('SELECT * FROM finance_payroll_runs WHERE employee_id = ? ORDER BY pay_date DESC LIMIT ?').bind(actor.person, limit).all();
  const rows = (result.results || []) as Record<string, unknown>[];

  for (const row of rows) {
    const payDate = String(row.pay_date);
    const ytd = await db.prepare('SELECT COALESCE(SUM(gross_pay),0) as ytd_gross, COALESCE(SUM(net_pay),0) as ytd_net FROM finance_payroll_runs WHERE employee_id = ? AND pay_date <= ?').bind(actor.person, payDate).first() as Record<string, unknown> | null;
    row.ytd_gross = ytd?.ytd_gross ?? 0;
    row.ytd_net = ytd?.ytd_net ?? 0;
  }

  return rows;
}

export async function listPayrollRuns(actor: FinanceActor, filters: { employeeId?: string; period?: string; limit?: number }) {
  await requirePermission(actor, 'finance', 'Payroll', 'View');
  const db = financeDb();
  const limit = Math.min(filters.limit ?? 100, 1000);
  let query = 'SELECT * FROM finance_payroll_runs';
  const params: (string | number)[] = [];
  if (filters.employeeId) { query += ' WHERE employee_id = ?'; params.push(filters.employeeId); }
  if (filters.period) { query += (params.length ? ' AND' : ' WHERE') + ' period_start = ?'; params.push(filters.period); }
  query += ' ORDER BY pay_date DESC LIMIT ?';
  params.push(limit);
  const result = await db.prepare(query).bind(...params).all();
  return (result.results || []) as Record<string, unknown>[];
}

export async function getMonthlyReconciliation(actor: FinanceActor, month: string, fundType = 'petty') {
  await requirePermission(actor, 'finance', 'Cash', 'View');
  const db = financeDb();
  const start = `${month}-01T00:00:00.000Z`;
  const nextMonth = `${Number(month.slice(0, 4))}-${String(Number(month.slice(5, 7)) + 1).padStart(2, '0')}-01`;
  const end = new Date(new Date(nextMonth).getTime() - 1).toISOString();

  const register = await getCashRegisterBalance(actor, fundType) as Record<string, unknown>;
  const txs = await db.prepare(
    'SELECT amount, status, created_at FROM cash_withdrawal WHERE created_at >= ? AND created_at <= ?'
  ).bind(start, end).all().then(r => (r.results || []) as Record<string, unknown>[]);

  const deposits = txs.filter(t => t.status === 'Deposit').reduce((s, t) => s + Number(t.amount), 0);
  const withdrawals = txs.filter(t => t.status !== 'Deposit').reduce((s, t) => s + Number(t.amount), 0);
  const net = deposits - withdrawals;
  const actual = Number(register.balance);
  const expectedOpening = actual - net;

  return {
    month,
    fund_type: fundType,
    opening_balance: expectedOpening,
    deposits,
    withdrawals,
    net_change: net,
    expected_closing: expectedOpening + net,
    actual_closing: actual,
    variance: actual - (expectedOpening + net),
    transaction_count: txs.length,
    last_reconciled_at: register.last_reconciled_at,
  };
}

export async function postMonthlyReconciliation(actor: FinanceActor, month: string, fundType = 'petty') {
  await requirePermission(actor, 'finance', 'Cash', 'Post');
  const db = financeDb();
  const now = new Date().toISOString();
  await db.prepare('UPDATE cash_register SET last_reconciled_at = ? WHERE fund_type = ?').bind(now, fundType).run();
  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'cash_register', fundType, 'Reconcile', 'Success', { newValue: { month } });
  return { month, fund_type: fundType, reconciled_at: now };
}

export async function depositCash(actor: FinanceActor, input: { amount: number; fund_type?: string; description?: string }) {
  await requirePermission(actor, 'finance', 'Cash', 'Deposit');
  const db = financeDb();
  const fundType = input.fund_type || 'petty';
  const now = new Date().toISOString();

  const current = await getCashRegisterBalance(actor, fundType) as Record<string, unknown>;
  const newBalance = Number(current.balance) + input.amount;
  await db.prepare('UPDATE cash_register SET balance = ?, last_reconciled_at = ? WHERE fund_type = ?').bind(newBalance, now, fundType).run();

  const id = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO cash_withdrawal (id, amount, purpose, requested_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, input.amount, input.description || 'Deposit', actor.person, 'Deposit', now).run();

  await logAudit({ personId: actor.person, personName: actor.name, role: actor.role }, 'cash_register', fundType, 'Deposit', 'Success', { newValue: { amount: input.amount, new_balance: newBalance } });
  return { deposit_id: id, balance: newBalance, fund_type: fundType };
}
