import {verifiedRosterHeader,standaloneActorKey} from '../auth/edge-identity.ts';
import {delegatedPrincipal} from '../admin/delegated-principal.ts';
import {hasDirectDelegationApproval} from '../admin/delegated-grants.ts';
import { displayPersonName } from '../people/display-name.ts';
import type { FinRecord, Viewer } from './model';
import { grantsFor } from './access.ts';
import { responsibilityGrants } from '../hr/permissions.ts';
export class FinanceAccessError extends Error {
    status: 401 | 403;
    constructor(message: string, status: 401 | 403) { super(message); this.name = 'FinanceAccessError'; this.status = status; }
}
// Identity match only. Does not grant any operational access.
export function linkedPerson(requestHeaders:Pick<Headers,'get'>,records:FinRecord[]){
    const delegated=delegatedPrincipal(requestHeaders);
    if(delegated){
        const p=records.find(r=>r.kind==='person'&&r.id===delegated.person);
        if(!p||p.accountStatus==='Disabled'||p.status==='Former'||p.commandSignInRevoked===true)throw new FinanceAccessError('This employee view is no longer available. Return to Admin.',403);
        return {p,id:delegated.id,email:String(p.email||'')};
    }
    const verifiedPerson=requestHeaders.get(verifiedRosterHeader);
    if(verifiedPerson!==null){
        const p=records.find(r=>r.kind==='person'&&r.id===verifiedPerson);
        if(!p)throw new FinanceAccessError('This sign-in is not linked to an employee profile. Contact your administrator.',403);
        if(p.accountStatus==='Disabled'||p.status==='Former'||p.commandSignInRevoked===true)throw new FinanceAccessError('Command sign-in is deactivated. Contact your administrator.',403);
        return {p,id:standaloneActorKey(p.id),email:String(p.email||'')};
    }
    const id = requestHeaders.get('oai-authenticated-user-id')?.trim() || '';
    const email = requestHeaders.get('oai-authenticated-user-email')?.trim().toLowerCase() || '';
    if (!id && !email)
        throw new FinanceAccessError('Your Command Post session has expired. Sign in to continue.', 401);
    const people = records.filter(r => r.kind === 'person');
    const assigned = id ? people.find(r => r.userId === id) : undefined;
    // Match only explicitly assigned sign-in addresses and verified company mailbox aliases.
    const mailbox = people.find(r => ([r.email, ...(Array.isArray(r.emailAliases) ? r.emailAliases : [])] as unknown[]).some(a => String(a || '').toLowerCase() === email && email !== '') && (!r.userId || r.userId === id));
    const p = assigned || mailbox;
    if (!p)
        throw new FinanceAccessError('This sign-in is not linked to a Command user. Ask your administrator to check your account setup.', 403);
    return {p,id,email};
}
/** Read only the identity forwarded by the Sites gateway on the server request. */
export const verifiedOwnerRecord=(p:FinRecord)=>p.role==='Owner'&&['jerson','jendel','jeidy'].includes(p.id);
export function financeIdentity(requestHeaders: Pick<Headers, 'get'>, records: FinRecord[], options: { allowOnboarding?: boolean } = {}): Viewer {
    const {p,id,email}=linkedPerson(requestHeaders,records);
    const viewer=viewerForLinkedPerson(p,id,email,records,options);
    if(delegatedPrincipal(requestHeaders))viewer.delegatedReadOnly=true;
    return viewer;
}
// Only server-selected roster records may enter this factory. Sign-ins still pass linkedPerson first.
export function viewerForLinkedPerson(p:FinRecord,id:string,email:string,records:FinRecord[],options:{allowOnboarding?:boolean}={}):Viewer {
    const onboardingOnly = p.status === 'Onboarding' || p.onboardingRequired === true && !p.onboardingClearedAt;
    if (p.accountStatus === 'Disabled' || p.status === 'Former' || onboardingOnly && !options.allowOnboarding)
        throw new FinanceAccessError('This account is not active. Ask your supervisor to complete onboarding.', 403);
    const owner = verifiedOwnerRecord(p), role = String(p.role || 'Employee');
    const operationsHead = records.some(r => r.kind === 'department' && (r.id === 'department-0' || r.name === 'Operations') && r.head === p.id);
    return { onboardingOnly, directDelegationApproved:!onboardingOnly&&hasDirectDelegationApproval(p), companyPolicyReader: !onboardingOnly&&p.status==='Active'&&['Employee','Owner'].includes(String(p.workerType)), hrResponsibilities: onboardingOnly ? [] : responsibilityGrants(p), customAccess: p.accessMode === 'Custom', access: onboardingOnly ? [] : grantsFor(p), id: id || `verified-email:${email}`, email: email || String(p.email || ''), name: displayPersonName(p), person: p.id, role, department: String(p.department), owner: owner && !onboardingOnly, canManage: owner && !onboardingOnly, canRelease: !onboardingOnly && (owner || operationsHead) };
}
