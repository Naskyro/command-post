import { configuredWeek } from './payroll-calendar.ts';
import { weekHours, isExempt } from './timeclock.ts';
export type Value = string | number | boolean | null | undefined | string[] | Record<string, unknown>[];
export type FinRecord = {
    id: string;
    kind: string;
    version: number;
    [key: string]: Value;
};
export type Viewer = {
    customAccess?: boolean;
    access?: import('./access').AccessGrant[];
    id: string;
    name: string;
    email: string;
    person: string;
    role: string;
    department: string;
    owner: boolean;
    canManage: boolean;
    canRelease: boolean;
};
export type FinanceData = {
    overtime?: import('./overtime').OvertimeSummary[];
    records: FinRecord[];
    transactions: FinRecord[];
    viewer: Viewer;
    sourceDate: string;
    transactionThrough: string;
};
export const departments = ['Operations', 'Dispatch', 'Drivers', 'Account Managers'];
export const paymentMethods = ['Cash', 'Check', 'Cash App', 'Zelle', 'Venmo', 'Apple Pay', 'PayPal', 'Direct Deposit'];
export const deductionTypes = ['Health insurance', 'Dental insurance', 'Vision insurance', 'Retirement — traditional', 'Retirement — Roth', 'HSA', 'FSA', 'Pay advance', 'Employee loan', 'Truck repayment', 'Company card repayment', 'Overpayment repayment', 'Child support', 'Tax levy', 'Other authorized deduction'];
export const money = (v: unknown) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0);
export const num = (v: unknown) => Number(v) || 0;
export const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const addDays = (day: string, n: number) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function workweek(day = today(), company?: FinRecord) { return configuredWeek(day, company); }
export function spendingWeek(day = today()) { const d = new Date(day + 'T12:00:00Z'); const start = addDays(day, -((d.getUTCDay() + 1) % 7)); return { start, end: addDays(start, 6) }; }
export function inPeriod(r: FinRecord, start: string, end: string) { return String(r.date || '') >= start && String(r.date || '') <= end; }
export function payrollLine(person: FinRecord, records: FinRecord[], start: string, end: string, projected = false) {
    const items = records.filter(r => r.person === person.id && inPeriod(r, start, end) && r.status !== 'Voided');
    const time = items.filter(r => r.kind === 'time' && (projected || r.status !== 'Scheduled'));
    const hours = projected ? weekHours(records, person.id, start, end).projected : time.reduce((s, r) => s + num(r.hours), 0);
    const paidLeave = items.filter(r => r.kind === 'leaveRequest' && r.status === 'Approved' && r.type !== 'Unpaid');
    const leaveHours = paidLeave.reduce((s, r) => s + num(r.hours), 0);
    const earnings = items.filter(r => r.kind === 'earning' && r.status === 'Approved');
    const commission = round(earnings.reduce((s, r) => s + num(r.amount), 0));
    const noncash = round(earnings.filter(r => r.destination === 'Truck credit').reduce((s, r) => s + num(r.amount), 0));
    const hourly = String(person.payType).includes('Hourly');
    const overtime = person.workerType === 'Employee' && hourly ? Math.max(0, hours - 40) : 0;
    const base = hourly ? hours * num(person.rate) : ['Per tow', 'Pending method'].includes(String(person.payType)) ? 0 : num(person.rate);
    const premium = overtime ? .5 * ((base + commission) / hours) * overtime : 0;
    const taxes = items.find(r => r.kind === 'taxInput');
    const transition = (Date.parse(end) - Date.parse(start)) / 86400000 !== 6;
    const gross = transition && taxes?.transitionReviewed === true && Number.isFinite(Number(taxes?.transitionGross)) ? round(num(taxes?.transitionGross)) : round(base + commission + premium + (hourly ? leaveHours * num(person.rate) : 0));
    const withheld = person.workerType === 'Employee' ? num(taxes?.federal) + num(taxes?.socialSecurity) + num(taxes?.medicare) + num(taxes?.stateTax) : 0;
    const deductions = records.filter(r => r.kind === 'deduction' && r.person === person.id && r.status === 'Approved' && String(r.date || '') <= end && (!r.endDate || String(r.endDate) >= start) && (r.recurring === true || inPeriod(r, start, end)));
    const priorDeductions = records.filter(r => r.kind === 'payrun' && r.status === 'Released' && String(r.period) < start).flatMap(r => (r.lines || []) as Record<string, unknown>[]).flatMap(l => (l.details || []) as Record<string, unknown>[]).filter(r => r.kind === 'deduction');
    const appliedDeductions = deductions.map(r => { const collected = priorDeductions.filter(d => d.id === r.id && d.version === r.version).reduce((s, d) => s + num(d.appliedAmount), 0); const remaining = r.remaining !== '' && r.remaining !== null && r.remaining !== undefined ? Math.max(0, num(r.remaining) - collected) : Infinity; return { ...r, appliedAmount: round(Math.min(r.basis === 'Percent of gross' ? gross * num(r.amount) / 100 : num(r.amount), remaining)) }; });
    const deducted = round(appliedDeductions.reduce((s, r) => s + r.appliedAmount, 0));
    const reimbursements = items.filter(r => r.kind === 'reimbursement' && r.status === 'Approved' && !r.paidReference);
    const reimbursed = round(reimbursements.reduce((s, r) => s + num(r.amount), 0));
    const net = round(gross - withheld - deducted - noncash);
    const employerTaxes = num(taxes?.employerTaxes);
    const issues: string[] = [];
    if (transition && person.workerType === 'Employee' && (taxes?.transitionReviewed !== true || taxes?.transitionGross === '' || taxes?.transitionGross === undefined))
        issues.push('Review transition-period wages and overtime');
    if (person.workerType === 'Employee' && !hourly && !isExempt(person))
        issues.push('Confirm salary exemption and overtime method');
    if (!projected && weekHours(records, person.id, start, end).running > 0)
        issues.push('Open timeclock entry needs review');
    if (items.some(r => r.kind === 'timeCorrection' && r.status === 'Requested'))
        issues.push('Time correction needs review');
    if (person.workerType === 'Employee' && taxes?.verified !== true)
        issues.push('Verify taxes and YTD');
    if (hourly && !time.some(r => r.status === 'Approved'))
        issues.push('Approve time');
    if (time.some(r => r.status !== 'Approved' && r.status !== 'Scheduled'))
        issues.push('Time needs review');
    if (person.payType === 'Net salary' && Math.abs(net - num(person.netTarget)) > .01)
        issues.push('Gross-up must produce ' + money(person.netTarget));
    if (person.netTarget && deductions.length)
        issues.push('Current agreement has no additional deductions');
    if (net < 0)
        issues.push('Deductions exceed available wages');
    const taxDetail = { federal: num(taxes?.federal), socialSecurity: num(taxes?.socialSecurity), medicare: num(taxes?.medicare), stateTax: num(taxes?.stateTax), priorYtdWages: num(taxes?.ytdWages), priorYtdFederal: num(taxes?.ytdFederal) };
    const details: FinRecord[] = [...paidLeave, ...earnings, ...appliedDeductions, ...reimbursements].map(r => ({ ...r }));
    return { person: person.id, name: String(person.name), workerType: String(person.workerType), department: String(person.department), hours, leaveHours, overtime, gross, commission, noncash, withheld, deducted, reimbursed, net, payment: round(net + reimbursed), employerTaxes, cost: round(gross + employerTaxes + reimbursed), issues, earnings: earnings.map(r => r.id), deductions: deductions.map(r => r.id), reimbursements: reimbursements.map(r => r.id), taxDetail, details, period: start, periodEnd: end };
}
export type PayLine = ReturnType<typeof payrollLine>;
