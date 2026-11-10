import { importedJobTitles } from '../people/imported-titles';
import source from './source-data.json';
import type { FinRecord } from './model';
import { scheduleTemplates } from './schedule';
const make = (id: string, kind: string, fields: Record<string, unknown>): FinRecord => ({ id, kind, version: 0, ...fields }) as FinRecord;
const staff = [
    ['austin', 'Austin Koska', 'Operations', 'Employee', 'Net salary', 0, 'Department Head'],
    ['alex', 'Alex Englert', 'Account Managers', 'Employee', 'Salary + commission', 1400, 'Department Head'],
    ['braden', 'Braden Martinelli', 'Operations', 'Employee', 'Hourly + commission', 21.63, 'Employee'],
    ['dalila', 'Dalila Ferrer', 'Dispatch', 'Employee', 'Hourly', 20, 'Employee'],
    ['juan', 'Juan Garza', 'Operations', 'Employee', 'Hourly', 20, 'Employee'],
    ['gabrielle', 'Gabrielle Jones', 'Dispatch', 'Employee', 'Hourly', 19, 'Employee'],
    ['nessa', 'Nessa Rios', 'Dispatch', 'Employee', 'Hourly', 19, 'Employee'],
    ['jarif', 'Jarif Garcia', 'Account Managers', 'Contractor', 'Hourly', 20, 'Employee'],
    ['wesley', 'Wesley Jackson', 'Drivers', 'Contractor', 'Per tow', 50, 'Employee'],
    ['jendel', 'Jendel Arauz', 'Drivers', 'Owner', 'Owner payment', 0, 'Owner'],
    ['jerson', 'Jerson Arauz', 'Operations', 'Owner', 'Owner payment', 1200, 'Owner'],
    ['jeidy', 'Jeidy Garcia', 'Dispatch', 'Owner', 'Owner payment', 1000, 'Owner'],
    ['mingo', 'Domingo Longoria', 'Drivers', 'Contractor', 'Pending method', 0, 'Employee'],
    ['tori', 'Tori Garza', 'Dispatch', 'Employee', 'Hourly', 20, 'Employee'],
    ['clay', 'Clay Henson', 'Operations', 'Employee', 'Hourly', 15, 'Employee'],
];
export const initialRecords: FinRecord[] = [
    ...scheduleTemplates,
    ...source.records.map(r => r.kind === 'category' ? { ...r, accountCode: 'C-' + r.id.replace('category-', ''), status: 'Active' } : r.kind === 'account' && r.institution === 'Vehicle' ? { ...r, status: 'Sold' } : r) as unknown as FinRecord[],
    make('category-unit5', 'category', { name: 'Vehicle Maintenance & Repairs Unit #5', group: 'Vehicle Costs', accountType: 'Expense', accountCode: 'C-unit5', status: 'Active', source: 'Owner category list · September 5, 2026' }),
    ...staff.map(([id, name, department, workerType, payType, rate, role]) => make(String(id), 'person', { name, title: importedJobTitles[String(id)] || '', department, workerType, payType, rate, role, status: ['tori', 'clay'].includes(String(id)) ? 'Former' : 'Active', email: (id === 'jendel' ? 'manny' : id === 'mingo' ? 'domingo' : id) + '@gtowingtransport.com', emailAliases: [(id === 'jendel' ? 'manny' : id === 'mingo' ? 'domingo' : id) + '@parkingtowingenforcement.com'], accessMode: 'Role defaults', userId: '', supervisor: id === 'austin' || id === 'alex' ? 'jerson' : id === 'jerson' || id === 'jendel' || id === 'jeidy' ? '' : department === 'Dispatch' ? 'jeidy' : department === 'Drivers' ? 'jendel' : department === 'Account Managers' ? 'alex' : 'austin', date: id === 'austin' ? '2026-08-30' : id === 'alex' ? '2026-08-16' : '', exempt: ['austin', 'alex'].includes(String(id)), netTarget: id === 'austin' ? 1500 : 0, source: id === 'austin' ? 'Owner confirmation · September 5, 2026' : 'Galindos Manual Payroll · current master profile', notes: id === 'braden' ? '16% of documented vehicle sales. Taxable truck credits recorded separately.' : id === 'alex' ? '$15 per eligible assigned-account tow; $40 replaces $15 for first three full enforcement weeks. Courtesy: $0. Discounted: proportional.' : id === 'jendel' ? '$60 per eligible car equivalent; actual owner payment entered separately.' : id === 'mingo' ? 'Separate worksheet; payment calculation pending.' : '' })),
    make('company', 'settings', { name: "Galindo’s Towing & Transport LLC", dba: 'Parking & Towing Enforcement', formation: '2023-06-01', operatingStart: '2024-03', accountingMethod: 'Unconfirmed', taxTreatment: 'Unconfirmed', timezone: 'America/Chicago', payrollBaseline: 15000, growth: 0, cushion: 0, expenseDeadline: 'Friday 11:59 PM', payday: 'Friday', expenseWeek: 'Saturday–Friday', slackUrl: '', source: 'Owner instructions' }),
    ...['Operations', 'Dispatch', 'Drivers', 'Account Managers'].map((name, i) => make('department-' + i, 'department', { name, head: name === 'Operations' ? 'austin' : name === 'Account Managers' ? 'alex' : name === 'Dispatch' ? 'jeidy' : 'jendel', backup: '', expires: '', source: 'Owner instructions', date: '2026-08-30' })),
    make('braden-truck', 'debt', { name: 'Braden · 2016 Chevrolet Silverado', person: 'braden', direction: 'Owed to company', original: 5000, downPayment: 2000, credits: 2377.60, amount: 622.40, payment: 0, rate: 0, date: '2026-08-22', status: 'Historical balance', source: 'Manual Payroll · Braden Silverado ledger', notes: '$176 + $408 + $1,232 + $61.60 sale commissions; $100 + $400 contract bonuses. Credits are taxable noncash earnings. Later payments have not been supplied.' }),
    ...source.records.filter(r => r.kind === 'account' && r.accountType === 'Asset' && r.institution === 'Vehicle').map(r => make('asset-' + r.id, 'asset', { name: r.name, amount: r.amount, date: r.date, source: r.source, status: 'Sold', cost: '', truck: r.name, assetType: 'Tow truck', ownership: 'Owned outright', debt: '', sourceAccount: r.id, purchasePrecision: 'Unknown', valueDate: r.date, notes: 'Sale confirmed by owner · September 5, 2026. Sale date and proceeds not supplied.' })),
    ...['2023', '2024', '2025', '2026'].flatMap(year => ['Company return', 'Texas sales tax', 'Payroll filings & deposits', 'Texas unemployment', 'Texas franchise / information report'].map((name, i) => make(`tax-${year}-${i}`, 'tax', { name, year, agency: name.startsWith('Texas') ? 'Texas agency' : 'IRS', date: '', due: '', amount: 0, paid: 0, filingStatus: 'History to verify', paymentStatus: 'Unconfirmed', status: 'Needs review', notes: year === '2023' ? 'LLC formed June 1, 2023. Review entity obligations before operations.' : 'Verify filings, payments, tax treatment, and applicable periods.', source: 'Owner: business tax filing history unknown; operations began March 2024' }))),
];
export const sourceTransactions = source.transactions as FinRecord[];
export const sourceDates = { sourceDate: source.sourceDate, transactionThrough: source.transactionThrough };
