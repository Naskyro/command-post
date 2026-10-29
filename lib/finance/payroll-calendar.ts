import type { FinRecord } from './model';
import { AppError } from '../shared/errors.ts';
export type PayrollPolicy = {
    effective: string;
    startDay: number;
    payDelayDays: number;
    changedBy?: string;
    changedAt?: string;
};
export const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const add = (day: string, n: number) => { const d = new Date(day + 'T12:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function payrollPolicies(company?: FinRecord): PayrollPolicy[] { return [{ effective: '1900-01-01', startDay: 0, payDelayDays: 6 }, ...((company?.payrollPolicies || []) as unknown as PayrollPolicy[])].sort((a, b) => a.effective.localeCompare(b.effective)); }
const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T12:00Z')) && new Date(s + 'T12:00Z').toISOString().slice(0, 10) === s;
export function configuredWeek(day: string, company?: FinRecord) {
    if (!validDay(day) || day < '1900-01-01')
        throw new AppError('Choose a valid workweek date.');
    const policies = payrollPolicies(company), policy = policies.filter(p => p.effective <= day).at(-1)!;
    const weekday = new Date(day + 'T12:00Z').getUTCDay();
    let start = add(day, -((weekday - policy.startDay + 7) % 7));
    if (start < policy.effective)
        start = policy.effective;
    let end = add(start, 6);
    const next = policies.find(p => p.effective > day);
    if (next && next.effective <= end)
        end = add(next.effective, -1);
    return { start, end, payday: add(end, policy.payDelayDays), transition: (Date.parse(end) - Date.parse(start)) / 86400000 !== 6 };
}
export function validatePayrollPolicy(policy: PayrollPolicy, company: FinRecord, records: FinRecord[], today: string) {
    if (!validDay(policy.effective) || policy.effective <= today)
        throw new AppError('Choose a future effective date.');
    if (!Number.isInteger(policy.startDay) || policy.startDay < 0 || policy.startDay > 6 || !Number.isInteger(policy.payDelayDays) || policy.payDelayDays < 0 || policy.payDelayDays > 21)
        throw new AppError('Choose a weekday and 0–21 days until payday.');
    if (new Date(policy.effective + 'T12:00Z').getUTCDay() !== policy.startDay)
        throw new AppError('The effective date must fall on the selected first weekday.');
    if (payrollPolicies(company).some(p => p.effective >= policy.effective))
        throw new AppError('Choose a date after the last saved payroll calendar change.');
    if (records.some(r => r.kind === 'payrun' && ['Approved', 'Released'].includes(String(r.status)) && String(r.periodEnd) >= policy.effective))
        throw new AppError('This change would affect a reviewed payroll. Choose a later date.');
}
