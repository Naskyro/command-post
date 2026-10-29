import type { FinRecord } from './model';
/** One category owns its identically named bookkeeping account. */
export function alignBookkeeping(records: FinRecord[]): FinRecord[] {
    const categories = records.filter(r => r.kind === 'category');
    const result = records.filter(r => r.kind !== 'chart' && r.kind !== 'category');
    for (const category of categories) {
        const accountCode = String(category.accountCode || 'C-' + category.id.replace('category-', ''));
        const saved = records.find(r => r.kind === 'chart' && (r.categoryId === category.id || r.code === accountCode));
        result.push({ ...category, budgetMode: category.budgetMode || 'No budget set', accountCode, status: category.status === 'Mapping needed' ? 'Active' : category.status });
        result.push({ ...saved, id: saved?.id || 'chart-for-' + category.id, kind: 'chart', version: saved?.version || 0, code: accountCode, name: category.name, categoryId: category.id, accountType: category.accountType, status: category.status === 'Archived' ? 'Archived' : 'Active', source: category.source });
    }
    // Keep previously posted account references available in history.
    for (const old of records.filter(r => r.kind === 'chart'))
        if (!result.some(r => r.kind === 'chart' && r.code === old.code))
            result.push({ ...old, status: 'Archived' });
    return result;
}
