import type { FinRecord, Viewer } from './model';
import { personView, canReadPay } from '../people/policy.ts';
import { recordAccess, canAccess } from './access.ts';
import { managesPerson } from './timeclock.ts';
export function visible(v: Viewer, records: FinRecord[], surface = 'finance') {
    const personAllowed = (id: unknown) => v.owner || id === v.person || managesPerson(v, String(id), records) || (v.canRelease && canAccess(v, 'Finance', 'Payroll'));
    const timeKinds = new Set(['shift', 'shiftTemplate', 'clock', 'time', 'timeCorrection', 'leaveRequest', 'leaveCredit', 'overtime', 'shiftRequest', 'person', 'department']);
    const base = records.filter(r => recordAccess(v, r) || r.id === 'company').filter(r => {
        if (surface === 'timeclock' && !timeKinds.has(r.kind) && r.id !== 'company')
            return false;
        if (r.kind === 'person')
            return personAllowed(r.id) || surface === 'timeclock' && r.department === v.department;
        if (r.kind === 'department')
            return true;
        if (['shift', 'shiftTemplate'].includes(r.kind))
            return v.owner || managesPerson(v, String(r.person), records) || r.department === v.department;
        if (['clock', 'time', 'timeCorrection', 'leaveRequest', 'leaveCredit', 'overtime', 'shiftRequest'].includes(r.kind))
            return personAllowed(r.person);
        if (['earning', 'taxInput', 'deduction', 'reimbursement', 'payIssue', 'yearDocument'].includes(r.kind))
            return personAllowed(r.person) && (r.kind !== 'yearDocument' || v.owner || r.status === 'Released');
        if (r.kind === 'expense' || r.kind === 'expenseReport')
            return canAccess(v, 'Finance', 'Outflows') || personAllowed(r.person);
        if (r.kind === 'payrun')
            return canAccess(v, 'Finance', 'Payroll') && (v.owner || v.canRelease) || (r.status === 'Released' && Array.isArray(r.lines) && (r.lines as Record<string, unknown>[]).some(l => personAllowed(l.person)));
        if (r.kind === 'payment')
            return canAccess(v, 'Finance', 'Outflows') || personAllowed(r.person);
        if (r.kind === 'settings')
            return r.id === 'company';
        if (r.kind === 'file')
            return false;
        return true;
    });
    const attachments = surface === 'timeclock' ? [] : records.filter(r => r.kind === 'file' && base.some(p => (p.id === r.parent || p.fileId === r.id) && (p.kind !== 'person' || canReadPay(v, p, records))));
    return [...base, ...attachments].map(r => r.kind === 'person' ? personView(r, v, records, surface) : r.kind === 'payrun' && !v.owner && !v.canRelease ? { ...r, lines: ((r.lines || []) as Record<string, unknown>[]).filter(l => personAllowed(l.person)) } : r.id === 'company' && !canAccess(v, 'Finance', 'Settings') ? { id: r.id, kind: r.kind, version: r.version, payrollPolicies: r.payrollPolicies, expenseDeadline: r.expenseDeadline } : r);
}
