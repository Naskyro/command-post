import type { FinRecord, Value } from './model';
import { num } from './model.ts';
import { AppError } from '../shared/errors.ts';
export function isCashWithdrawal(r: FinRecord) { return num(r.amount) < 0 && (/\batm\b.*(?:withdraw|cash)|(?:withdraw|cash).*\batm\b|\bcash withdrawal\b/i.test(String(r.description || '')) || r.category === 'Bank Withdrawal'); }
export function needsCashReview(r: FinRecord) { return isCashWithdrawal(r) && !(r.cashReviewed === true && r.person && r.category && r.cashPurpose && r.cashDestination); }
export function validateCategory(next: FinRecord, records: FinRecord[]) {
    if (!String(next.name || '').trim() || String(next.name).length > 150)
        throw new AppError('Enter a category name of 150 characters or fewer.');
    if (records.some(r => r.kind === 'category' && r.id !== next.id && String(r.name).toLowerCase() === String(next.name).toLowerCase()))
        throw new AppError('That category already exists.');
    if (!['Income', 'Expense', 'Transfer', 'Asset', 'Liability', 'Equity', 'Unconfirmed'].includes(String(next.accountType)))
        throw new AppError('Choose an accounting type.');
    if (next.budgetMode && !['No budget set', 'Monthly budget'].includes(String(next.budgetMode)))
        throw new AppError('Choose a budget option.');
    if (next.budgetMode === 'Monthly budget' && (next.budgetAmount === '' || !Number.isFinite(Number(next.budgetAmount)) || Number(next.budgetAmount) < 0))
        throw new AppError('Enter a monthly budget of zero or greater.');
}
export function validateTransaction(next: FinRecord, old: FinRecord | undefined, records: FinRecord[]) {
    if (next.category && !records.some(r => r.kind === 'category' && r.name === next.category && (r.status !== 'Archived' || old?.category === next.category)))
        throw new AppError('Choose an established active category.');
    if (next.person && !records.some(r => r.kind === 'person' && r.id === next.person))
        throw new AppError('Choose the person responsible for this transaction.');
    if (isCashWithdrawal(next) && next.cashReviewed === true && (!next.person || !next.category || !String(next.cashPurpose || '').trim() || !String(next.cashDestination || '').trim()))
        throw new AppError('A cash withdrawal needs a responsible person, category, purpose, and cash destination before review is complete.');
}
export type QuickField = {
    type: 'select' | 'number' | 'date' | 'text';
    options?: string[];
    nullable?: boolean;
};
export function quickField(r: FinRecord, key: string, records: FinRecord[]): QuickField | undefined {
    if (['Paid', 'Filed', 'Closed', 'Released', 'Posted', 'Reconciled'].includes(String(r.status)))
        return;
    if (key === 'category' && ['transaction', 'expense', 'reimbursement', 'bill', 'receipt', 'budget'].includes(r.kind))
        return { type: 'select', options: records.filter(c => c.kind === 'category' && c.status !== 'Archived').map(c => String(c.name)) };
    if (r.kind === 'debt' && key === 'payment')
        return { type: 'number' };
    if (r.kind === 'category' && key === 'budgetAmount')
        return r.budgetMode === 'Monthly budget' ? { type: 'number' } : undefined;
    if (r.kind === 'category' && key === 'budgetMode')
        return { type: 'select', options: ['No budget set', 'Monthly budget'] };
    if (r.kind === 'category' && key === 'group')
        return { type: 'text' };
    if (key === 'due' && ['debt', 'bill', 'invoice', 'subscription', 'tax'].includes(r.kind))
        return { type: 'date' };
    if (r.kind === 'subscription' && key === 'amount')
        return { type: 'number' };
    if (r.kind === 'subscription' && key === 'frequency')
        return { type: 'select', options: ['Weekly', 'Monthly', 'Quarterly', 'Yearly'] };
    if (r.kind === 'vendor' && key === 'terms')
        return { type: 'text' };
    if (r.kind === 'vendor' && key === 'w9')
        return { type: 'select', options: ['Needed', 'Received', 'Not applicable'] };
}
export function quickPatch(r: FinRecord, key: string, value: Value, records: FinRecord[]): FinRecord {
    const field = quickField(r, key, records);
    if (!field)
        throw new AppError('Open the record to change this field.');
    if (field.type === 'number' && (value === '' || !Number.isFinite(Number(value)) || Number(value) < 0))
        throw new AppError('Enter a number of zero or greater.');
    if (field.options && !field.options.includes(String(value)))
        throw new AppError('Choose an available option.');
    if (field.type === 'text' && String(value).length > 150)
        throw new AppError('Keep this value under 150 characters.');
    const next = { ...r, [key]: field.type === 'number' ? Number(value) : value };
    if (r.kind === 'category' && key === 'budgetMode' && value === 'Monthly budget' && next.budgetAmount === undefined)
        next.budgetAmount = 0;
    if (r.kind === 'transaction' && key === 'category') {
        next.accountCode = records.find(c => c.kind === 'category' && c.name === value)?.accountCode;
        if (isCashWithdrawal(r))
            next.cashReviewed = false;
    }
    return next;
}
export function expenseGroups(transactions: FinRecord[], records: FinRecord[], group: 'Category' | 'Group' | 'Department' | 'Person', includeUnclassified = false) {
    const sums = new Map<string, number>();
    for (const t of transactions) {
        if (num(t.amount) >= 0)
            continue;
        const cat = records.find(c => c.kind === 'category' && c.name === t.category);
        if (!includeUnclassified && (cat?.accountType !== 'Expense' || needsCashReview(t)))
            continue;
        const label = group === 'Category' ? String(t.category || 'Uncategorized') : group === 'Group' ? String(cat?.group || 'No group') : group === 'Department' ? String(t.department || records.find(p => p.id === t.person)?.department || 'Unassigned') : String(records.find(p => p.id === t.person)?.name || 'Unassigned');
        sums.set(label, (sums.get(label) || 0) - num(t.amount));
    }
    return [...sums].map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount);
}
