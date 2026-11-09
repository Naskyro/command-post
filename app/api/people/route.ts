import {stampDirectDelegation} from '@/lib/admin/delegated-grants';
import {savePeopleBatch} from '@/lib/people/atomic';
import {requireTemplate,templateAllowed} from '@/lib/admin/access-templates';
import { publicPersonIdentity } from '@/lib/people/display-name';
import {setWorkContact} from '@/lib/people/work-contact';
import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify, persist } from '@/lib/finance/server';
import { financeDb } from '@/db/finance';
import { canAccess, grantsFor } from '@/lib/finance/access';
import { hrCan, boundedHrResponsibilities } from '@/lib/hr/permissions';
import { canManageDepartments, departmentFor } from '@/lib/people/departments';
import { managesPerson, validDepartmentDelegateExpiry, localDate } from '@/lib/finance/timeclock';
import type { FinRecord } from '@/lib/finance/model';
import { profileFields, payFields, accessFields, personView, pickPerson, canReadPay, canEditAccess, boundedGrants, validateRole, sanitizeFields, validateProfile, safePersonHistory } from '@/lib/people/policy';
import { AppError, ForbiddenError, ConflictError, readPayload, safeFailure } from '@/lib/shared/errors';
import { applyAuthorityLevel, captureAuthorityOverrides, authorityAssignmentCapabilities, authorityTemplate } from '@/lib/people/authority';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: NextRequest) {
    try {
        const records = await allRecords(), v = identify(records, request.headers), surface = request.nextUrl.searchParams.get('surface') || 'hr';
        if (surface === 'admin' ? !canAccess(v, 'Admin') : !canAccess(v, 'People & HR') && !canAccess(v, 'Finance', 'Payroll'))
            throw new ForbiddenError();
        const canReadDirectory = surface !== 'admin' || canAccess(v,'Admin','users') || canAccess(v,'Admin','departments');
        const people = records.filter(r => canReadDirectory && r.kind === 'person' && (surface === 'admin' || v.owner || surface === 'finance' && v.canRelease || r.id === v.person || managesPerson(v, r.id, records) || ['viewPersonnel','managePersonnel','manageOnboarding','manageCompensation'].some(action => hrCan(v, action, r.id, records))));
        const historyId = request.nextUrl.searchParams.get('history');
        if (historyId) {
            const person = people.find(r => r.id === historyId);
            if (!person)
                throw new ForbiddenError();
            const audit = await financeDb().prepare('SELECT id,actor,at,reason,before,after FROM finance_audit WHERE record_id=? ORDER BY at DESC LIMIT 100').bind(historyId).all<Record<string, string>>();
            return json({ history: safePersonHistory(audit.results, v, records, surface) });
        }
        return json({ viewer: v, authorityAssignment:canReadDirectory?authorityAssignmentCapabilities(v,records):{levels:[],editablePersonIds:[],canCreate:false}, records: [...people.map(p => personView(p, v, records, surface)), ...records.filter(r => canReadDirectory && r.kind === 'department')], departments: records.filter(r => canReadDirectory && r.kind === 'department'), supervisors: records.filter(r => canReadDirectory && r.kind === 'person' && (v.owner || r.id === v.person || managesPerson(v, r.id, records) || ['viewPersonnel','managePersonnel','manageOnboarding','manageCompensation'].some(action => hrCan(v, action, r.id, records)))).map(p => ({...pickPerson(p, ['title', 'department', 'status', 'supervisor']),...publicPersonIdentity(p)})) });
    }
    catch (e) {
        const f = safeFailure(e, 'people.read');
        return json(f.body, f.status);
    }
}
export async function POST(request: NextRequest) {
    try {
        if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==request.nextUrl.origin)throw new ForbiddenError('Cross-origin request rejected.');
        const body = await readPayload(request), records = await allRecords(), v = identify(records, request.headers), action = String(body.action || ''), id = String(body.id || '');
        if (!/^[a-zA-Z0-9:_-]{1,150}$/.test(id))
            throw new AppError('Invalid person record.');
        const old = records.find(r => r.id === id && r.kind === (action === 'saveDepartment' ? 'department' : 'person'));
        if (old && old.version !== body.version)
            throw new ConflictError();
        if (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields))
            throw new AppError('Submit the form fields.');
        const reason = String(body.reason || '').trim();
        if (old && !reason)
            throw new AppError('Enter the reason for this change.');
        const input = body.fields as Record<string, unknown>;
        let next: FinRecord;
        let surface = 'hr';
        if (action === 'saveDepartment') {
            if (!canManageDepartments(v, records))
                throw new ForbiddenError('Department administration is not assigned to your account.');
            const fields = sanitizeFields(input, ['name', 'status', 'head', 'backup', 'expires', 'coverageDays', 'coverageStart', 'coverageEnd']);
            const departmentName = String(fields.name ?? old?.name ?? '').trim();
            if (!departmentName || departmentName.length > 100) throw new AppError('Enter a department name of 1–100 characters.');
            const duplicate = departmentFor(records, departmentName);
            if (duplicate && duplicate.id !== id) throw new AppError('A department already uses that name or historical name.');
            if (fields.status && !['Active','Retired'].includes(String(fields.status))) throw new AppError('Choose Active or Retired.');
            if ((id === 'department-0' || old?.name === 'Operations') && fields.head !== undefined && fields.head !== old?.head && !v.owner && !v.canRelease) throw new ForbiddenError('Only an owner or the current payroll release authority may reassign the Operations head.');
            const aliases = [...new Set([...(Array.isArray(old?.aliases) ? old.aliases as string[] : []), ...(old?.name && old.name !== departmentName ? [String(old.name)] : [])])];
            for (const key of ['head', 'backup'])
                if (fields[key] && fields[key] !== old?.[key] && !records.some(r => r.kind === 'person' && r.id === fields[key] && r.status === 'Active'))
                    throw new AppError('Choose an active user.');
            // Retain historical coverage fields when unchanged, but never let a
            // department form redefine staff rota windows or conceal 24/7 gaps.
            for(const key of ['coverageDays','coverageStart','coverageEnd']){
                if(fields[key]!==undefined&&fields[key]!==old?.[key])throw new AppError('Department leadership does not set coverage hours. Manage staffing in Timeclock → Schedule.');
                delete fields[key];
            }
            const proposedBackup=String(fields.backup??old?.backup??''),proposedExpiry=String(fields.expires??old?.expires??''),proposedHead=String(fields.head??old?.head??'');
            const delegationChanged=fields.backup!==undefined&&fields.backup!==old?.backup||fields.expires!==undefined&&fields.expires!==old?.expires;
            if(proposedBackup&&(delegationChanged||fields.head!==undefined&&fields.head!==old?.head)){
                if(proposedBackup===proposedHead)throw new AppError('The department head already has responsibility. Choose a different temporary delegate or clear the delegate.');
                if(!validDepartmentDelegateExpiry(proposedExpiry)||proposedExpiry<localDate(Date.now()))throw new AppError('Choose a valid delegation end date on or after today.');
                if(!records.some(p=>p.kind==='person'&&p.id===proposedBackup&&p.status==='Active'&&p.accountStatus!=='Disabled'))throw new AppError('Choose an active user for temporary delegation.');
            }
            const department:FinRecord={id,kind:'department',version:old?.version||0,...old,...fields,name:departmentName,aliases,status:fields.status||old?.status||'Active'};
            const changes:{old?:FinRecord;next:FinRecord}[]=[{old,next:department}];
            if(old?.head&&department.head!==old.head){
              const transition=body.transition as Record<string,unknown>|undefined;
              if(!transition||!['Keep Current Position','Update Position'].includes(String(transition.action)))throw new AppError('Review the outgoing department head’s next position before saving.');
              const previous=records.find(p=>p.kind==='person'&&p.id===old.head);
              if(transition.action==='Update Position'&&previous){
                if(!hrCan(v,'managePersonnel',previous.id,records))throw new ForbiddenError('Personnel administration is required to change the outgoing head’s position.');
                const title=String(transition.title||'').trim(),supervisor=String(transition.supervisor||'');
                if(!title||title.length>150)throw new AppError('Enter the outgoing head’s next position.');
                if(supervisor&&(supervisor===previous.id||!records.some(p=>p.kind==='person'&&p.id===supervisor&&p.status==='Active')))throw new AppError('Choose a valid supervisor.');
                let cursor=supervisor;const seen=new Set<string>();while(cursor&&!seen.has(cursor)){if(cursor===previous.id)throw new AppError('This reporting change would create a cycle.');seen.add(cursor);cursor=String(records.find(p=>p.id===cursor)?.supervisor||'');}
                changes.push({old:previous,next:{...previous,title,supervisor}});
              }
              department.leadershipTransitions=[...(Array.isArray(old.leadershipTransitions)?old.leadershipTransitions as Record<string,unknown>[]:[]),{from:old.head,to:department.head,action:transition.action,at:new Date().toISOString(),by:v.name}];
            }
            await savePeopleBatch(changes,v,reason||'Created department');
            return json({record:department});
        }
        else if (action === 'createHire') {
            if (old)
                throw new ConflictError('This new hire was already saved. Refresh the directory.');
            if (!canAccess(v, 'People & HR', 'hiring', true))
                throw new ForbiddenError();
            const fields = sanitizeFields(input, [...profileFields, ...accessFields]);
            validateRole(fields.role || 'Employee', v, id);
            const selectedTemplate=authorityTemplate(String(fields.authorityLevel||''));
            const access = boundedGrants(fields.access === undefined ? selectedTemplate.access : fields.access, v);
            const existingWorker = fields.setupPath === 'Existing Worker';
            if (fields.setupPath && !['New Hire','Existing Worker'].includes(String(fields.setupPath))) throw new AppError('Choose New Hire or Existing Worker.');
            next = { id, kind: 'person', version: 0, ...fields, role: fields.role || 'Employee', accessMode: 'Custom', access, status: existingWorker ? 'Active' : 'Onboarding', accountStatus: existingWorker ? 'Enabled' : 'Onboarding', onboardingRequired: !existingWorker, setupPath: existingWorker ? 'Existing Worker' : 'New Hire', payType: 'Pending method', rate: 0, netTarget: 0, exempt: false, onboardingStatus: existingWorker ? 'Historical Records Pending' : 'In Progress' };
            validateProfile(next, undefined, v, records);
            next.hrResponsibilities = boundedHrResponsibilities(fields.hrResponsibilities === undefined ? selectedTemplate.hrResponsibilities : fields.hrResponsibilities, v, next, [...records, next]);
            if (!hrCan(v, 'manageOnboarding', id, [...records, next])) throw new ForbiddenError('Hiring responsibility is not assigned for this employee.');
            if (!next.employmentClass && next.workerType === 'Employee') throw new AppError('Select Full-Time, Part-Time, Temporary, or Seasonal.');
            next = applyAuthorityLevel(undefined,next,v,records);
        }
        else {
            if (!old)
                throw new AppError('Person not found.', 404);
            if (action === 'saveAccess') {
                if (!canEditAccess(v, old, records))
                    throw new ForbiddenError('You can change access only for users in your reporting branch.');
                const fields = sanitizeFields(input, [...accessFields,'companyEmail']);
                validateRole(fields.role || old.role, v, id);
                const access = boundedGrants(fields.access || grantsFor(old), v);
                if (fields.accountStatus !== undefined && fields.accountStatus !== old.accountStatus) throw new AppError('Use Deactivate User or Reactivate User to change site access status.');
                if (fields.accountStatus && !['Enabled', 'Disabled', 'Onboarding'].includes(String(fields.accountStatus)))
                    throw new AppError('Choose Enabled, Disabled, or Onboarding.');
                if (old.role === 'Owner' && (fields.role !== 'Owner' || fields.accountStatus === 'Disabled'))
                    throw new ForbiddenError('Owner accounts must keep owner access.');
                if (fields.userId && records.some(r => r.kind === 'person' && r.id !== id && r.userId === fields.userId))
                    throw new AppError('That sign-in identity belongs to another user.');
                next = { ...old, ...fields, accessMode: 'Custom', access, hrResponsibilities: boundedHrResponsibilities(fields.hrResponsibilities || old.hrResponsibilities || [], v, old, records) };
                setWorkContact(next,old,records,fields.companyEmail);
                next = applyAuthorityLevel(old,captureAuthorityOverrides(old,next),v,records);
                if (next.accountStatus !== 'Disabled' && old.status === 'Former') throw new AppError('Rehire the employee through People & HR before restoring site access.');
                if (old.accountStatus === 'Disabled' && next.accountStatus !== 'Disabled') throw new AppError('Use Reactivate User to review permissions before restoring site access.');
                if (old.onboardingRequired === true && !old.onboardingClearedAt && next.accountStatus === 'Enabled') throw new AppError('Complete the onboarding readiness review before enabling ordinary access.');
                surface = 'admin';
            }
            else if (action === 'savePay') {throw new AppError('Use Pay Agreements to save an effective-dated agreement and preserve history.');}
            else if (action === 'saveProfile' || action === 'completeOnboarding') {
                if (!canAccess(v, 'People & HR', action === 'completeOnboarding' ? 'hiring' : 'people', true) || !hrCan(v, 'managePersonnel', id, records) && !hrCan(v, 'manageOnboarding', id, records))
                    throw new ForbiddenError();
                if (input.profileNotes !== undefined && input.profileNotes !== old.profileNotes && !hrCan(v,'managePersonnel',id,records) && !hrCan(v,'recordPerformance',id,records)) throw new ForbiddenError('Internal personnel notes require the assigned personnel or performance responsibility.');
                next = { ...old, ...sanitizeFields(input, profileFields) };
                if(old.status!=='Former'&&next.status==='Former')throw new AppError('Use End Employment on the employee profile to record the departure and end access together.');
                if (action === 'completeOnboarding') throw new AppError('Open the onboarding checklist and use Approve Start Readiness after the required documents and reviews are complete.');
                if (old.onboardingRequired === true && !old.onboardingClearedAt && next.status === 'Active' && old.status !== 'Active') throw new AppError('An authorized onboarding approver must release this new hire before activation.');
                validateProfile(next, old, v, records,input);
                const proposed = [...records.filter(r=>r.id!==id),next];
                if (!hrCan(v,'managePersonnel',id,proposed) && !hrCan(v,'manageOnboarding',id,proposed)) throw new ForbiddenError('The proposed assignment is outside your personnel responsibility scope.');
                next = applyAuthorityLevel(old,next,v,records);
            }
            else
                throw new AppError('Unknown people action.');
        }
        if(['createHire','saveAccess'].includes(action)){next.schoolAccessConfigured=true;next=stampDirectDelegation(next,v,Array.isArray(input.access));}
        if(body.templateId){
            if(!['createHire','saveAccess'].includes(action))throw new AppError('Permission sets belong in access setup.');
            const t=requireTemplate(records,body.templateId,body.templateVersion);
            if(t.status!=='Active'||!templateAllowed(t,v))throw new ForbiddenError('This permission set is no longer available within your authority.');
            next={...next,accessTemplateId:t.id,accessTemplateName:t.name,accessTemplateVersion:t.version,accessTemplateAppliedAt:new Date().toISOString(),accessTemplateAppliedBy:v.name,accessTemplateBaseline:t.access,accessTemplateHrBaseline:t.hrResponsibilities};
        }
        if(old&&action==='saveProfile'&&['title','department','supervisor','employmentClass'].some(k=>old[k]!==next[k]))next.careerHistory=[...((old.careerHistory||[]) as Record<string,unknown>[]),{id:crypto.randomUUID(),title:next.title,previousTitle:old.title,department:next.department,previousDepartment:old.department,supervisor:next.supervisor,effectiveDate:new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'}),reasonType:'Reassignment',reason,recordedAt:new Date().toISOString(),recordedBy:v.name,recordedById:v.id}];
        const saved = await persist(old, next, v, reason || 'Created new hire');
        return json({ record: personView(saved, v, [...records.filter(r => r.id !== id), saved], surface) });
    }
    catch (e) {
        const f = safeFailure(e, 'people.write');
        return json(f.body, f.status);
    }
}
