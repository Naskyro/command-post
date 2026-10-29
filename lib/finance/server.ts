import { validateCategory, validateTransaction } from './quick-edit';
export { visible } from './visibility';
import { normalizePerson } from '../people/policy';
import { financeDb } from '@/db/finance';
import { initialRecords, sourceTransactions } from './seed';
import { FinRecord, Viewer, num, payrollLine } from './model';
import { alignBookkeeping } from './bookkeeping';
import { validateBillEdit } from './bills';
import { validateAsset } from './assets';
import { recordAccess, canAccess } from './access';
import { financeIdentity } from './identity';
import { deriveTime, managesPerson } from './timeclock';
import { expandSchedule } from './schedule';
import { timeKinds, validateTime } from './time-validation';
export async function allRecords() { const result = await financeDb().prepare('SELECT payload FROM finance_records').all<{
    payload: string;
}>(); const records = new Map(initialRecords.map(r => [r.id, r])); for (const row of result.results) {
    const r = JSON.parse(row.payload) as FinRecord;
    records.set(r.id, r);
} return deriveTime(expandSchedule(alignBookkeeping([...records.values()].map(r => r.kind === 'person' ? normalizePerson(r) : r)), new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10))); }
export function identify(records: FinRecord[], requestHeaders: Pick<Headers, 'get'>): Viewer { return financeIdentity(requestHeaders, records); }
export function branch(v: Viewer, records: FinRecord[]) { const ids = new Set([v.person]); let added = true; while (added) {
    added = false;
    for (const p of records.filter(r => r.kind === 'person'))
        if (ids.has(String(p.supervisor)) && !ids.has(p.id)) {
            ids.add(p.id);
            added = true;
        }
} return ids; }
export async function persist(old: FinRecord | undefined, next: FinRecord, v: Viewer, reason: string) {
    const db = financeDb(), at = new Date().toISOString(), version = (old?.version || 0) + 1;
    const value = { ...next, version, updatedAt: at, updatedBy: v.name };
    const payload = JSON.stringify(value);
    const auditId = crypto.randomUUID();
    // Both statements are transactional; a duplicate audit key rolls the batch back.
    const write = old?.version ? db.prepare('UPDATE finance_records SET payload=?,version=?,updated_by=?,updated_at=? WHERE id=? AND version=?').bind(payload, version, v.name, at, next.id, old.version) : db.prepare('INSERT OR IGNORE INTO finance_records (id,kind,payload,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)').bind(next.id, next.kind, payload, version, v.name, at);
    const effects = [];
    if (next.kind === 'shiftRequest' && next.status === 'Approved') {
        effects.push(db.prepare('INSERT INTO finance_records (id,kind,payload,version,updated_by,updated_at) SELECT ?,?,?,?,?,? FROM finance_audit WHERE id=?').bind('shift-claim:' + next.shiftId, 'shiftClaim', JSON.stringify({ id: 'shift-claim:' + next.shiftId, kind: 'shiftClaim', version: 1, person: next.person, shiftId: next.shiftId, request: next.id }), 1, v.name, at, auditId));
    }
    if (next.kind === 'clock' && next.status === 'Stopped' && next.id.startsWith('clock-active:')) {
        const archive = { ...value, id: 'clock:' + next.person + ':' + next.startedAt };
        effects.push(db.prepare('INSERT INTO finance_records (id,kind,payload,version,updated_by,updated_at) SELECT ?,?,?,?,?,? FROM finance_audit WHERE id=?').bind(archive.id, 'clock', JSON.stringify(archive), version, v.name, at, auditId));
    }
    if (next.kind === 'payrun' && next.status === 'Released')
        for (const line of next.lines as Record<string, unknown>[]) {
            effects.push(db.prepare('INSERT INTO finance_payroll_claims (id,run) SELECT ?,? FROM finance_audit WHERE id=?').bind(String(line.person) + ':' + String(next.period), next.id, auditId));
            effects.push(db.prepare('INSERT INTO finance_payroll_balances (id,remaining) SELECT ?,? FROM finance_audit WHERE id=?').bind(next.id + ':' + String(line.person), Math.round(num(line.payment) * 100), auditId));
        }
    if (next.kind === 'payment' && next.payrun) {
        const inactive = (r: FinRecord | undefined) => r && ['Voided', 'Returned', 'Failed'].includes(String(r.status));
        const delta = (inactive(next) ? 0 : Math.round(num(next.amount) * 100)) - (old && !inactive(old) ? Math.round(num(old.amount) * 100) : 0);
        effects.push(db.prepare('UPDATE finance_payroll_balances SET remaining=remaining-? WHERE id=? AND EXISTS (SELECT 1 FROM finance_audit WHERE id=?)').bind(delta, next.payrun + ':' + next.person, auditId));
    }
    const results = await db.batch([write, db.prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1').bind(auditId, next.id, v.name, v.id, at, reason, old ? JSON.stringify(old) : null, payload), ...effects]);
    if (results[0].meta.changes !== 1)
        throw new Error('Someone changed this record. Reload it before saving.');
    return value;
}
const kinds = new Set(['person', 'settings', 'department', 'transaction', 'expense', 'expenseReport', 'time', 'earning', 'taxInput', 'deduction', 'reimbursement', 'overtime', 'payrun', 'payment', 'payIssue', 'vendor', 'bill', 'subscription', 'invoice', 'recovery', 'receipt', 'cashBag', 'cashMovement', 'debt', 'debtPayment', 'asset', 'ownerMoney', 'journal', 'reconciliation', 'category', 'chart', 'budget', 'tax', 'close', 'yearDocument', 'supply', 'file', 'sourceImport', 'sourceIssue', 'depositMatch', 'shift', 'timeCorrection', 'leaveRequest', 'leaveCredit', 'shiftTemplate', 'shiftRequest']);
export function validate(next: FinRecord, old: FinRecord | undefined, v: Viewer, records: FinRecord[]) {
    if (!recordAccess(v, next, true))
        throw new Error('You have view-only access or no access to this tab.');
    if (next.kind === 'category')
        validateCategory(next, records);
    if (next.kind === 'transaction')
        validateTransaction(next, old, records);
    if (next.kind === 'debt' && (!Number.isFinite(Number(next.payment ?? 0)) || Number(next.payment) < 0))
        throw new Error('Monthly payments must be zero or greater.');
    if (next.kind === 'asset')
        validateAsset(next);
    if (next.kind === 'bill')
        validateBillEdit(next, old);
    if (next.kind === 'category' && records.some(r => r.kind === 'category' && r.id !== next.id && (r.name === next.name || next.accountCode && r.accountCode === next.accountCode)))
        throw new Error('This category name or account number already exists.');
    if (next.kind === 'chart') {
        const category = records.find(r => r.kind === 'category' && r.accountCode === next.code);
        if (!category || category.name !== next.name)
            throw new Error('Edit the linked category to change this account name.');
    }
    if (!kinds.has(next.kind))
        throw new Error('Unknown record type.');
    if (old && !v.canManage && old.person !== next.person)
        throw new Error('You cannot move another worker’s record into your own account.');
    if (old && old.kind !== next.kind)
        throw new Error('Record type cannot be changed.');
    if (old && ['Paid', 'Filed', 'Closed', 'Released', 'Posted'].includes(String(old.status)))
        throw new Error('This record is locked. Add a linked adjustment to preserve its history.');
    if (next.kind === 'person')
        throw new Error('Use People & HR, Admin access settings, or the pay agreement form.');
    if (next.kind === 'settings' && JSON.stringify(next.payrollPolicies) !== JSON.stringify(old?.payrollPolicies))
        throw new Error('Use the Payroll calendar settings to change workweeks.');
    if (next.kind === 'department')
        throw new Error('Use Admin Departments to change department settings.');
    if (next.kind === 'settings' && !v.owner)
        throw new Error('Only owners can change company settings.');
    if (timeKinds.includes(next.kind))
        validateTime(next, old, v, records);
    if (!v.canManage && !timeKinds.includes(next.kind)) {
        const own = next.person === v.person;
        const subordinate = next.person !== v.person && branch(v, records).has(String(next.person)) && ['Supervisor', 'Department Head'].includes(v.role);
        const payrollEditor = ['earning', 'taxInput', 'deduction', 'reimbursement', 'payment'].includes(next.kind) && canAccess(v, 'Finance', 'Payroll', true) && (v.canRelease || managesPerson(v, String(next.person), records));
        const delegated = recordAccess(v, next, true) && !['person', 'settings', 'earning', 'time', 'taxInput', 'deduction', 'reimbursement', 'payment', 'payrun', 'yearDocument'].includes(next.kind);
        if (!(payrollEditor || delegated || (own && ['expense', 'expenseReport', 'payIssue', 'time', 'reimbursement'].includes(next.kind)) || (subordinate && ['time', 'overtime', 'expenseReport'].includes(next.kind))))
            throw new Error('You do not have permission to change this record.');
        if (!subordinate && !payrollEditor && ['Approved', 'Released', 'Paid'].includes(String(next.status)))
            throw new Error('This action requires your reviewer.');
    }
    if (next.kind === 'transaction') {
        const original = sourceTransactions.find(r => r.id === next.id) || old;
        if (original)
            for (const key of ['amount', 'date', 'description', 'account', 'source'])
                if (next[key] !== original[key])
                    throw new Error('Original bank evidence is preserved. Edit its category or matching details instead.');
        if (!original && (!next.source || !Number.isFinite(Number(next.amount))))
            throw new Error('An imported transaction needs a source and valid amount.');
    }
    for (const key of ['amount', 'hours', 'rate', 'payment', 'federal', 'socialSecurity', 'medicare', 'employerTaxes'])
        if (typeof next[key] === 'number' && !Number.isFinite(next[key]))
            throw new Error('Enter a valid number.');
    if (next.kind !== 'transaction' && next.kind !== 'account' && num(next.amount) < 0)
        throw new Error('Enter a positive amount and choose the appropriate record type.');
    if (next.kind === 'time' && (num(next.hours) < 0 || num(next.hours) > 24))
        throw new Error('Time entries must contain 0–24 hours per day.');
    if (next.kind === 'earning' && next.sourceId && records.some(r => r.kind === 'earning' && r.id !== next.id && r.person === next.person && r.sourceId === next.sourceId && r.type === next.type && r.status !== 'Voided'))
        throw new Error('That source item is already recorded for this worker.');
    if (next.kind === 'expense' && next.receipt === 'No receipt provided' && !next.receiptReason)
        throw new Error('Add the reason no receipt was provided.');
    if (next.kind === 'expense' && next.method === 'Personal funds' && next.bankMatch)
        throw new Error('A personal expense cannot also be matched to a company-card purchase.');
    if (['expense', 'transaction'].includes(next.kind) && Array.isArray(next.splits)) {
        const splits = next.splits as Record<string, unknown>[];
        if (splits.length && Math.abs(splits.reduce((s, r) => s + num(r.amount), 0) - Math.abs(num(next.amount))) > .005)
            throw new Error('Split amounts must add up to the full purchase amount.');
        if (splits.some(r => !r.category || num(r.amount) < 0))
            throw new Error('Each split needs a category and a positive amount.');
    }
    if (next.kind === 'depositMatch' && next.status === 'Matched') {
        const bank = sourceTransactions.find(r => r.id === next.bankId) || records.find(r => r.kind === 'transaction' && r.id === next.bankId);
        const expected = num(next.gross) - num(next.fees) - num(next.refunds) - num(next.loanWithheld) - num(next.cashPaidOut) - num(next.cashRetained);
        if (!bank || Math.abs(num(bank.amount) - expected) > .005)
            throw new Error('The deposit does not balance with the receipts and deductions. Keep it in Draft until the difference is explained.');
        if (records.some(r => r.kind === 'depositMatch' && r.id !== next.id && r.bankId === next.bankId && r.status === 'Matched'))
            throw new Error('This deposit already has a matched record.');
    }
    if (next.kind === 'deduction' && next.status === 'Approved' && (next.authorizationConfirmed !== true || !next.authorizationReference))
        throw new Error('A deduction needs its employee authorization or applicable order and review confirmation.');
    if (next.kind === 'deduction' && next.status === 'Approved' && records.find(r => r.id === next.person)?.netTarget)
        throw new Error('The current pay agreement specifies no additional deductions.');
    if (next.kind === 'expenseReport' && next.status === 'In review' && next.cashConfirmed !== true)
        throw new Error('Confirm that all cash spending is included before submitting.');
    if (next.kind === 'tax' && next.status === 'Filed' && (!next.reference || !next.filedDate))
        throw new Error('Enter the filing date and confirmation reference.');
    if (next.kind === 'yearDocument' && next.status === 'Released' && (!v.owner || !next.fileId))
        throw new Error('An owner must attach the completed tax document before releasing it.');
    if (next.kind === 'journal') {
        const lines = next.lines as Record<string, unknown>[] | undefined;
        if (!lines || lines.length < 2)
            throw new Error('A journal needs at least two lines.');
        const debit = lines.reduce((s, l) => s + num(l.debit), 0), credit = lines.reduce((s, l) => s + num(l.credit), 0);
        if (debit <= 0 || Math.abs(debit - credit) > .005 || lines.some(l => !l.account || num(l.debit) < 0 || num(l.credit) < 0 || (num(l.credit) > 0 && num(l.debit) > 0)))
            throw new Error('Debits and credits must balance, with one amount per line.');
        if (records.some(r => r.kind === 'close' && r.status === 'Closed' && String(next.date).startsWith(String(r.period))))
            throw new Error('That accounting month is closed. Use an open period for the adjustment.');
    }
    if (next.kind === 'close' && next.status === 'Closed' && ['checksComplete', 'bankDone', 'cashDone', 'payrollDone', 'receivablesDone', 'assetsDone', 'taxDone'].some(k => next[k] !== true))
        throw new Error('Complete every monthly review check before closing.');
    if (next.kind === 'bill' && next.invoice && records.some(r => r.kind === 'bill' && r.id !== next.id && r.vendor === next.vendor && r.invoice === next.invoice))
        throw new Error('This vendor invoice is already recorded.');
    if (next.kind === 'expenseReport' && records.some(r => r.kind === 'expenseReport' && r.id !== next.id && r.person === next.person && r.period === next.period))
        throw new Error('This person already has a report for that week. Open the existing report.');
    if (next.kind === 'reconciliation' && next.status === 'Closed' && Math.abs(num(next.statementBalance) + num(next.depositsInTransit) - num(next.outstandingPayments) - num(next.bookBalance)) > .005)
        throw new Error('The statement and adjusted book balance do not match.');
    if (next.kind === 'payment' && (!next.reference || !next.person || !next.method))
        throw new Error('Record the recipient, payment method, and receipt or payment reference.');
    if (next.kind === 'payment' && next.payrun) {
        if (old && (next.payrun !== old.payrun || next.person !== old.person || next.amount !== old.amount))
            throw new Error('Void and replace a payment to change its recipient, payroll, or amount.');
        const run = records.find(r => r.id === next.payrun);
        if (!run || run.status !== 'Released')
            throw new Error('Release this payroll before recording payment.');
        const line = (run.lines as Record<string, unknown>[]).find(l => l.person === next.person);
        const paid = records.filter(r => r.kind === 'payment' && r.payrun === next.payrun && r.person === next.person && r.id !== next.id && !['Voided', 'Returned', 'Failed'].includes(String(r.status))).reduce((s, r) => s + num(r.amount), 0);
        if (!line || paid + num(next.amount) > num(line.payment) + .005)
            throw new Error('This would exceed the unpaid balance for this person.');
    }
    if (next.kind === 'payrun')
        throw new Error('Use payroll review and release actions.');
}
export function runSnapshot(records: FinRecord[], start: string, end: string, peopleIds: string[]) { return records.filter(r => r.kind === 'person' && peopleIds.includes(r.id)).map(p => payrollLine(p, records, start, end)); }
