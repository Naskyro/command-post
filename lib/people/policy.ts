import { importedJobTitles } from './imported-titles.ts';
import type { FinRecord, Viewer, Value } from '../finance/model';
import { canAccess, accessCatalog, type AccessGrant } from '../finance/access.ts';
import { managesPerson, isExempt } from '../finance/timeclock.ts';
import { AppError, ForbiddenError } from '../shared/errors.ts';
export const roles = ['Owner', 'Department Head', 'Supervisor', 'Employee'];
export function allowedRoles(v: Viewer) { const rank: Record<string, number> = { Owner: 4, 'Department Head': 3, Supervisor: 2, Employee: 1 }; return roles.filter(r => r === 'Owner' ? v.owner : rank[r] <= (rank[v.role] || 1)); }
export const profileFields = ['name', 'email', 'emailAliases', 'title', 'department', 'supervisor', 'status', 'startDate', 'endDate', 'workerType', 'onboardingStatus', 'onboardingChecks', 'profileNotes'];
export const payFields = ['payType', 'rate', 'netTarget', 'exempt', 'date', 'notes', 'overtimeEstimateRate', 'commissionNotes'];
export const accessFields = ['role', 'accessMode', 'access', 'userId', 'accountStatus'];
export const bankFields = ['stripe_customer_id', 'stripe_bank_account_id', 'stripe_connected_account_id', 'stripe_connected_account_status', 'bank_last_4', 'bank_name', 'bank_account_type', 'bank_verified', 'bank_account_added_at'];
const baseFields = ['id', 'kind', 'version', 'updatedBy', 'updatedAt'];
export function pickPerson(p: FinRecord, fields: string[]): FinRecord { return Object.fromEntries([...baseFields, ...fields].filter(k => p[k] !== undefined).map(k => [k, p[k]])) as FinRecord; }
export function canReadPay(v: Viewer, p: FinRecord, records: FinRecord[]) { return (canAccess(v, 'Finance', 'Payroll') || canAccess(v, 'People & HR', 'pay')) && (v.owner || v.canRelease || p.id === v.person || managesPerson(v, p.id, records)); }
export function personView(p: FinRecord, v: Viewer, records: FinRecord[], surface = 'finance') {
    if (surface === 'admin')
        return pickPerson(p, ['name', 'email', 'emailAliases', 'title', 'department', 'supervisor', 'status', ...accessFields, ...bankFields]);
    if (surface === 'hr')
        return pickPerson(p, [...profileFields, ...bankFields]);
    if (surface === 'timeclock')
        return { ...pickPerson(p, ['name', 'title', 'department', 'supervisor', 'status', 'workerType', ...bankFields]), exempt: isExempt(p) };
    return pickPerson(p, [...profileFields.filter(k => k !== 'profileNotes' && k !== 'onboardingChecks'), ...(canReadPay(v, p, records) ? payFields : []), ...bankFields]);
}
export function canEditAccess(v: Viewer, p: FinRecord, records: FinRecord[]) { return canAccess(v, 'Admin', 'users', true) && (v.owner || p.id !== v.person && p.role !== 'Owner' && managesPerson(v, p.id, records)); }
export function boundedGrants(input: unknown, v: Viewer): AccessGrant[] {
    if (!Array.isArray(input) || input.length > 400)
        throw new AppError('Choose valid module and tab permissions.');
    const grants: AccessGrant[] = [];
    const seen = new Set<string>();
    for (const value of input) {
        if (!value || typeof value !== 'object')
            throw new AppError('Invalid permission.');
        const g = value as AccessGrant, key = g.module + '|' + g.tab;
        if (!accessCatalog[g.module]?.[g.tab] || !['View', 'Edit'].includes(g.level) || seen.has(key))
            throw new AppError('Invalid or duplicate permission.');
        if (!canAccess(v, g.module, g.tab, g.level === 'Edit'))
            throw new ForbiddenError('You cannot give access above your own level.');
        seen.add(key);
        grants.push({ module: g.module, tab: g.tab, level: g.level });
    }
    return grants;
}
export function validateRole(role: unknown, v: Viewer, targetId: string) {
    if (!roles.includes(String(role)))
        throw new AppError('Choose Owner, Department Head, Supervisor, or Employee.');
    if (role === 'Owner' && (!v.owner || !['jerson', 'jendel', 'jeidy'].includes(targetId)))
        throw new ForbiddenError('Owner access is reserved for the three company owners.');
    if (!allowedRoles(v).includes(String(role)))
        throw new ForbiddenError('You cannot assign a role above your own.');
}
export function sanitizeFields(input: Record<string, unknown>, allowed: string[]): Record<string, Value> {
    const out: Record<string, Value> = {};
    for (const [k, v] of Object.entries(input)) {
        if (!allowed.includes(k))
            throw new AppError('This form cannot change ' + k + '.');
        if (typeof v === 'string') {
            if (v.length > 5000)
                throw new AppError('A field exceeds 5,000 characters.');
            out[k] = v.trim();
        }
        else if (typeof v === 'number' || typeof v === 'boolean' || v === null || Array.isArray(v))
            out[k] = v as Value;
        else
            throw new AppError('Invalid field value.');
    }
    return out;
}
export function validateProfile(next: FinRecord, old: FinRecord | undefined, v: Viewer, records: FinRecord[]) {
    for (const k of ['name', 'email', 'title', 'department', 'supervisor', 'status', 'startDate', 'endDate', 'workerType', 'profileNotes'])
        if (next[k] !== undefined && typeof next[k] !== 'string')
            throw new AppError('Invalid ' + k + ' value.');
    if (!['Employee', 'Contractor', 'Owner'].includes(String(next.workerType)))
        throw new AppError('Choose an employment type.');
    if (next.workerType === 'Owner' && !v.owner && old?.workerType !== 'Owner')
        throw new ForbiddenError('Only owners can assign owner records.');
    if (!String(next.name || '').trim())
        throw new AppError('Enter the employee’s name.');
    if (!['Operations', 'Dispatch', 'Drivers', 'Account Managers'].includes(String(next.department)))
        throw new AppError('Choose a department.');
    if (!['Active', 'Former', 'Leave', 'Onboarding'].includes(String(next.status)))
        throw new AppError('Choose a valid employment status.');
    const email = String(next.email || '').toLowerCase(), match = email.match(/^([a-z0-9._+-]+)@(gtowingtransport\.com|parkingtowingenforcement\.com)$/);
    if (!match)
        throw new AppError('Use the employee’s company email address.');
    next.email = email;
    next.emailAliases = [match[1] + '@gtowingtransport.com', match[1] + '@parkingtowingenforcement.com'].filter(e => e !== email);
    if (records.some(r => r.kind === 'person' && r.id !== next.id && [r.email, ...(Array.isArray(r.emailAliases) ? r.emailAliases : [])].some(e => [email, ...next.emailAliases as string[]].includes(String(e)))))
        throw new AppError('That mailbox belongs to another user.');
    if (!v.owner) {
        if (next.supervisor !== old?.supervisor && next.supervisor !== v.person && !managesPerson(v, String(next.supervisor), records))
            throw new ForbiddenError('Choose a supervisor in your own team.');
        if (!old && next.supervisor !== v.person && !managesPerson(v, String(next.supervisor), records))
            throw new ForbiddenError('New hires must report within your team.');
    }
    const seen = new Set([next.id]);
    let parent = String(next.supervisor || '');
    while (parent) {
        if (seen.has(parent))
            throw new AppError('The reporting chain cannot contain a loop.');
        seen.add(parent);
        const p = records.find(r => r.kind === 'person' && r.id === parent);
        if (!p)
            throw new AppError('Choose an existing supervisor.');
        parent = String(p.supervisor || '');
    }
}
export function normalizePerson(p: FinRecord): FinRecord { return { ...p, role: p.role === 'Department head' || p.role === 'Director of Operations' ? 'Department Head' : p.role, title: p.title || importedJobTitles[p.id] || (p.role === 'Director of Operations' ? 'Director of Operations' : ''), accountStatus: p.accountStatus || 'Enabled' }; }
export function safePersonHistory(rows: Record<string, string>[], v: Viewer, records: FinRecord[], surface: string) { return rows.flatMap(a => { const before = a.before ? personView(JSON.parse(a.before), v, records, surface) : null, after = personView(JSON.parse(a.after), v, records, surface); const meaningful = (r: FinRecord | null) => Object.fromEntries(Object.entries(r || {}).filter(([k]) => !baseFields.includes(k))); if (before && JSON.stringify(meaningful(before)) === JSON.stringify(meaningful(after)))
    return []; return [{ ...a, reason: surface !== 'admin' && surface !== 'hr' && !canReadPay(v, JSON.parse(a.after), records) ? 'Employee record updated' : surface === 'admin' ? 'System access or profile updated' : surface === 'hr' ? 'Employee profile updated' : a.reason, before: before ? JSON.stringify(before) : null, after: JSON.stringify(after) }]; }); }
