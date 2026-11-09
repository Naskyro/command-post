import type { FinRecord, Viewer } from './model';
import { hrCan } from '../hr/permissions.ts';
import { personView, canReadPay } from '../people/policy.ts';
import { recordAccess, canAccess } from './access.ts';
import { managesPerson } from './timeclock.ts';
export function visible(v: Viewer, records: FinRecord[], surface = 'finance') {
    const personAllowed = (id: unknown) => v.owner || id === v.person || managesPerson(v, String(id), records) || (v.canRelease && canAccess(v, 'Finance', 'Payroll'));
    const payrollRead = canAccess(v, 'Finance', 'Payroll');
    const outflowsRead = canAccess(v, 'Finance', 'Outflows');
    const payAllowed = (id: unknown) => v.owner || id === v.person || payrollRead && personAllowed(id);
    const fullPayroll = v.owner || v.canRelease && payrollRead;
    const timeKinds = new Set(['shift', 'shiftTemplate', 'clock', 'time', 'timeCorrection', 'leaveRequest', 'leaveCredit', 'overtime', 'shiftRequest', 'person', 'department']);
    const base = records.filter(r => recordAccess(v, r) || r.id === 'company').filter(r => {
        if (surface === 'timeclock' && !timeKinds.has(r.kind) && r.id !== 'company')
            return false;
        if (r.kind === 'person')
            return personAllowed(r.id) || surface === 'finance' && hrCan(v, 'manageCompensation', r.id, records) || surface === 'timeclock' && r.department === v.department;
        if (r.kind === 'department')
            return true;
        if (['shift', 'shiftTemplate'].includes(r.kind))
            return v.owner || managesPerson(v, String(r.person), records) || r.department === v.department;
        if (['clock', 'time', 'timeCorrection', 'leaveRequest', 'leaveCredit', 'overtime', 'shiftRequest'].includes(r.kind))
            return personAllowed(r.person);
        if (['earning', 'taxInput', 'deduction', 'payIssue', 'yearDocument'].includes(r.kind))
            return payAllowed(r.person) && (r.kind !== 'yearDocument' || v.owner || r.status === 'Released');
        if (r.kind === 'reimbursement')
            return payAllowed(r.person) || outflowsRead && personAllowed(r.person);
        if (r.kind === 'expense' || r.kind === 'expenseReport')
            return outflowsRead || r.person === v.person;
        if (r.kind === 'payrun')
            return fullPayroll || (r.status === 'Released' && Array.isArray(r.lines) && (r.lines as Record<string, unknown>[]).some(l => payAllowed(l.person)));
        if (r.kind === 'payment')
            return outflowsRead || payAllowed(r.person);
        if (r.kind === 'settings')
            return r.id === 'company';
        if (r.kind === 'file')
            return false;
        return true;
    });
    const attachments = surface === 'timeclock' ? [] : records.filter(r => r.kind === 'file' && base.some(p => (p.id === r.parent || p.fileId === r.id) && (p.kind !== 'person' || canReadPay(v, p, records)) && (p.kind !== 'payrun' || fullPayroll)));
    return [...base, ...attachments].map(r => {
        if (r.kind === 'person') return personView(r, v, records, surface);
        if (r.kind === 'payrun' && !fullPayroll) {
            const lines = ((r.lines || []) as Record<string, unknown>[]).filter(l => payAllowed(l.person));
            return { ...r, lines, people: lines.map(l => String(l.person)) };
        }
        if (r.id === 'company' && !canAccess(v, 'Finance', 'Settings')) return { id: r.id, kind: r.kind, version: r.version, payrollPolicies: r.payrollPolicies, expenseDeadline: r.expenseDeadline };
        return r;
    });
}
