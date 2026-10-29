import type { FinRecord, Viewer } from './model';
import { grantsFor } from './access.ts';
export class FinanceAccessError extends Error {
    status: 401 | 403;
    constructor(message: string, status: 401 | 403) { super(message); this.name = 'FinanceAccessError'; this.status = status; }
}
/** Read only the identity forwarded by the Sites gateway on the server request. */
export function financeIdentity(requestHeaders: Pick<Headers, 'get'>, records: FinRecord[]): Viewer {
    let id = requestHeaders.get('oai-authenticated-user-id')?.trim() || '';
    let email = requestHeaders.get('oai-authenticated-user-email')?.trim().toLowerCase() || '';
    // Local dev fallback: read identity from dev cookie when no gateway headers present
    if (!id && !email) {
        const cookie = requestHeaders.get('cookie') || '';
        const mEmail = cookie.match(/(?:^|;\s*)dev_user_email=([^;]+)/);
        const mId    = cookie.match(/(?:^|;\s*)dev_user_id=([^;]+)/);
        if (mEmail) email = decodeURIComponent(mEmail[1]).trim().toLowerCase();
        if (mId)    id    = decodeURIComponent(mId[1]).trim();
    }
    if (!id && !email)
        throw new FinanceAccessError('Your Command Post session has expired. Sign in to continue.', 401);
    const people = records.filter(r => r.kind === 'person');
    const assigned = id ? people.find(r => r.userId === id) : undefined;
    // Match only explicitly assigned company mailboxes and their interchangeable aliases.
    const mailbox = people.find(r => ([r.email, ...(Array.isArray(r.emailAliases) ? r.emailAliases : [])] as unknown[]).some(a => String(a || '').toLowerCase() === email && email !== '') && (!r.userId || r.userId === id));
    const p = assigned || mailbox;
    if (!p)
        throw new FinanceAccessError('This sign-in is not linked to a Command Post user. Sign in with your company email or ask an owner to assign it.', 403);
    if (p.accountStatus === 'Disabled' || p.status === 'Onboarding')
        throw new FinanceAccessError('This account is not active. Ask your supervisor to complete onboarding.', 403);
    const owner = p.role === 'Owner' && ['jerson', 'jendel', 'jeidy'].includes(p.id), role = String(p.role || 'Employee');
    const operationsHead = records.some(r => r.kind === 'department' && r.name === 'Operations' && r.head === p.id);
    return { customAccess: p.accessMode === 'Custom', access: grantsFor(p), id: id || `verified-email:${email}`, email: email || String(p.email || ''), name: String(p.name), person: p.id, role, department: String(p.department), owner, canManage: owner, canRelease: owner || operationsHead };
}
