import {commandUsername,prepareContactIdentity,workContactEmail} from './work-contact.ts';
import {isDelegatedGrant,isResetGrant,hasAdminPair} from '../admin/delegated-grants.ts';
import { importedJobTitles } from './imported-titles.ts';
import type { FinRecord, Viewer, Value } from '../finance/model';
import { canAccess, accessCatalog, type AccessGrant } from '../finance/access.ts';
import { managesPerson, isExempt } from '../finance/timeclock.ts';
import { AppError, ForbiddenError } from '../shared/errors.ts';
import { hrCan } from '../hr/permissions.ts';
import { genderOptions, canViewDemographics } from '../hr/demographics.ts';
import { departmentFor } from './departments.ts';
import { publicPersonIdentity, legalPersonName } from './display-name.ts';
export const roles = ['Owner', 'Department Head', 'Supervisor', 'Employee'];
/** Internal software authority tiers; job titles and reporting lines remain separate. */
export const authorityLevels = ['Coordinator', 'Manager', 'Department Lead / Director', 'Executive'] as const;
export function normalizeAuthorityLevel(value: unknown): string {
    return value === 'Department Lead' || value === 'Director' ? 'Department Lead / Director' : typeof value === 'string' ? value : '';
}
export function authorityLevelOf(person: FinRecord): string {
    return normalizeAuthorityLevel(person.authorityLevel !== undefined ? person.authorityLevel : person.organizationalLevel);
}
export function allowedRoles(v: Viewer) { const rank: Record<string, number> = { Owner: 4, 'Department Head': 3, Supervisor: 2, Employee: 1 }; return roles.filter(r => r === 'Owner' ? v.owner : rank[r] <= (rank[v.role] || 1)); }
export const profileFields = ['name', 'preferredName', 'pronouns', 'username', 'email', 'companyEmail', 'title', 'authorityLevel', 'department', 'departmentId', 'employmentClass', 'setupPath', 'supervisor', 'status', 'startDate', 'endDate', 'workerType', 'gender', 'profileNotes'];
export const payFields = ['payComponents','payTimeline','payBaseline','payType', 'rate', 'netTarget', 'exempt', 'date', 'notes', 'overtimeEstimateRate'];
export const accessFields = ['role', 'authorityLevel', 'accessMode', 'access', 'userId', 'accountStatus', 'hrResponsibilities'];
const baseFields = ['id', 'kind', 'version', 'updatedBy', 'updatedAt'];
export function pickPerson(p: FinRecord, fields: string[]): FinRecord { return Object.fromEntries([...baseFields, ...fields].filter(k => p[k] !== undefined).map(k => [k, p[k]])) as FinRecord; }
export function canReadPay(v: Viewer, p: FinRecord, records: FinRecord[]) { return (canAccess(v, 'Finance', 'Payroll') || canAccess(v, 'People & HR', 'pay')) && (v.owner || v.canRelease || p.id === v.person || hrCan(v, 'manageCompensation', p.id, records) || managesPerson(v, p.id, records)); }
export function canViewAuthorityLevel(v: Viewer, p: FinRecord, records: FinRecord[]) {
    return v.owner || p.id !== v.person && (canEditAccess(v,p,records) || hrCan(v,'managePersonnel',p.id,records) || hrCan(v,'manageOnboarding',p.id,records));
}
export function personView(p: FinRecord, v: Viewer, records: FinRecord[], surface = 'finance'):FinRecord {
    const authority = canViewAuthorityLevel(v,p,records) && authorityLevelOf(p) ? {authorityLevel:authorityLevelOf(p)} : {};
    const identity=publicPersonIdentity(p),workContact={companyEmail:workContactEmail(p,records)},standalone={username:commandUsername(p)};
    const canReadLegalName=v.owner||p.id===v.person||(surface==='hr'?['viewPersonnel','managePersonnel','manageOnboarding','issueCorrective','manageTaxBank','manageCompensation','manageOffboarding','manageTwc'].some(action=>hrCan(v,action,p.id,records)):surface==='admin'?canEditAccess(v,p,records):surface==='finance'?canReadPay(v,p,records):false);
    const legal=canReadLegalName&&surface!=='timeclock'?{legalName:legalPersonName(p)}:{};
    if (surface === 'admin')
        return {...pickPerson(p, ['title', 'department', 'departmentId', 'supervisor', 'status', 'setupPath','onboardingRequired','onboardingStatus','onboardingClearedAt','accountDeactivatedAt','accountDeactivatedBy','accountDeactivationReason','accountReactivatedAt','accountReactivatedBy','schoolAccessConfigured','accessTemplateId','accessTemplateName','accessTemplateVersion','accessTemplateAppliedAt','accessTemplateAppliedBy','accessTemplateBaseline','accessTemplateHrBaseline', ...accessFields.filter(k=>k!=='authorityLevel')]),...identity,...legal,...authority,...standalone,...workContact};
    if (surface === 'hr')
        return {...pickPerson(p, [...profileFields.filter(k => k !== 'authorityLevel' && k !== 'email' && k !== 'username' && (k !== 'gender' || canViewDemographics(v,p.id,records)) && (k !== 'profileNotes' || v.owner || p.id !== v.person && (hrCan(v, 'managePersonnel', p.id, records) || hrCan(v, 'recordPerformance', p.id, records)))), 'onboardingStatus', 'onboardingRequired', 'onboardingClearedAt']),...identity,...legal,...authority,...workContact,...(canReadLegalName?standalone:{})};
    if (surface === 'timeclock')
        return { ...pickPerson(p, ['title', 'department', 'departmentId', 'departmentKey', 'employmentClass', 'supervisor', 'status', 'workerType', 'startDate', 'onboardingRequired', 'onboardingClearedAt']),...identity, exempt: isExempt(p) };
    return {...pickPerson(p, [...profileFields.filter(k => k !== 'authorityLevel' && k !== 'email' && k !== 'username' && k !== 'profileNotes' && k !== 'gender' && k !== 'onboardingChecks'), ...(canReadPay(v, p, records) ? payFields : [])]),...identity,...legal,...workContact};
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
    if(grants.some(isResetGrant)&&(!v.owner||!['users','password-resets'].every(tab=>grants.some(g=>g.module==='Admin'&&g.tab===tab&&g.level==='Edit'))))throw new ForbiddenError('Only a company owner may assign Reset Staff Passwords and Users & Access together with Edit permission.');
    if(grants.some(isDelegatedGrant)&&(!v.owner||!hasAdminPair(grants)))throw new ForbiddenError('A company owner must assign Users & Access and Delegated Access together with Edit permission.');
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
    for (const [inputKey, v] of Object.entries(input)) {
        const k = inputKey === 'organizationalLevel' ? 'authorityLevel' : inputKey;
        if (!allowed.includes(k))
            throw new AppError('This form cannot change ' + k + '.');
        if (k === 'authorityLevel') {
            if (typeof v !== 'string') throw new AppError('Choose a valid authority level.');
            const level = normalizeAuthorityLevel(v.trim());
            if (level && !authorityLevels.includes(level as typeof authorityLevels[number])) throw new AppError('Choose Coordinator, Manager, Department Lead / Director, or Executive.');
            if (out.authorityLevel !== undefined && out.authorityLevel !== level) throw new AppError('Submit one authority level.');
            out.authorityLevel = level;
            continue;
        }
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
export function validateProfile(next: FinRecord, old: FinRecord | undefined, v: Viewer, records: FinRecord[], contactFields?:Record<string,unknown>) {
    for (const k of ['name', 'preferredName', 'pronouns', 'username', 'email', 'companyEmail', 'title', 'authorityLevel', 'department', 'departmentId', 'employmentClass', 'setupPath', 'supervisor', 'status', 'startDate', 'endDate', 'workerType', 'gender', 'profileNotes'])
        if (next[k] !== undefined && typeof next[k] !== 'string')
            throw new AppError('Invalid ' + k + ' value.');
    for(const [key,limit] of [['preferredName',150],['pronouns',100]] as const){if(next[key]!==undefined){next[key]=String(next[key]).trim();if(String(next[key]).length>limit)throw new AppError(key==='preferredName'?'Use a preferred name of 150 characters or fewer.':'Use pronouns of 100 characters or fewer.');}}
    if (next.gender && !genderOptions.includes(String(next.gender) as typeof genderOptions[number])) throw new AppError('Choose a valid self-reported gender or leave it blank.');
    if (next.authorityLevel !== undefined) {
        next.authorityLevel = normalizeAuthorityLevel(next.authorityLevel);
        if (next.authorityLevel && !authorityLevels.includes(next.authorityLevel as typeof authorityLevels[number])) throw new AppError('Choose Coordinator, Manager, Department Lead / Director, or Executive.');
    }
    if (!['Employee', 'Contractor', 'Owner'].includes(String(next.workerType)))
        throw new AppError('Choose an employment type.');
    if (next.workerType === 'Owner' && !v.owner && old?.workerType !== 'Owner')
        throw new ForbiddenError('Only owners can assign owner records.');
    if (!String(next.name || '').trim())
        throw new AppError('Enter the employee’s name.');
    const department = departmentFor(records, next.departmentId || next.department);
    if (!department || department.status === 'Retired' && old?.departmentId !== department.id && old?.department !== department.name)
        throw new AppError('Choose a department.');
    next.department = department.name;
    next.departmentId = department.id;
    if (next.employmentClass && !['Full-Time', 'Part-Time', 'Temporary', 'Seasonal'].includes(String(next.employmentClass)))
        throw new AppError('Choose a valid employment class.');
    if (!['Active', 'Former', 'Leave', 'Onboarding'].includes(String(next.status)))
        throw new AppError('Choose a valid employment status.');
    for (const key of ['startDate','endDate']) if (next[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(String(next[key])) || !Number.isFinite(Date.parse(String(next[key]))) || new Date(String(next[key])).toISOString().slice(0,10) !== next[key])) throw new AppError('Enter a valid '+key+'.');
    if (!old && !next.startDate && next.setupPath !== 'Existing Worker') throw new AppError('Enter the original hire or start date.');
    prepareContactIdentity(next,old,records,contactFields);
    if (!v.owner && !hrCan(v, 'manageOnboarding', undefined, records) && !hrCan(v, 'managePersonnel', undefined, records)) {
        const supervisorAllowed = next.supervisor === v.person || managesPerson(v, String(next.supervisor), records) || hrCan(v, 'manageOnboarding', String(next.supervisor), records) || hrCan(v, 'managePersonnel', String(next.supervisor), records);
        if (next.supervisor !== old?.supervisor && !supervisorAllowed)
            throw new ForbiddenError('Choose a supervisor in your own team.');
        if (!old && !supervisorAllowed)
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
