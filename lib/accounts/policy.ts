import {safetyAccess,safetyKinds} from '@/lib/safety/access';
import {numberError} from './field-rules';
import { canAccess } from '@/lib/finance/access';
import type { Viewer, FinRecord } from '@/lib/finance/model';
import { AppError, ForbiddenError } from '@/lib/shared/errors';
import { healthFactors, vehicleKey } from './insights';
import { contactName, checklistProgress, isWaiting, orderStatuses } from './work';
import { forms, areas, current, today, type Row, type Kind } from './model';
import { workTypeOptions, woStatuses } from './work-options';
import { normalizeContact } from './contact-details';
const legacy: Record<string, string[]> = { relationships: ['accounts', 'setup'], work: ['today', 'lifecycle'], activity: ['interactions', 'notes'], signage: ['compliance'], files: ['agreement', 'compliance'], decisions: ['lifecycle'], performance: ['accounts'] };
export function access(v: Viewer, area: string, edit = false): boolean {
    if (area === 'safety') return safetyAccess(v,edit);
    if (area === 'workOrders') return canAccess(v,'Work Orders','orders',edit) || access(v,'work',edit);
    if (area === 'claims' && canAccess(v, 'Compliance, Claims & Recovery', 'damage', edit)) return true;
    if (area === 'courtesy' && canAccess(v, 'Accounts', 'courtesy', edit))
        return true;
    if (area === 'opportunities' && canAccess(v, 'Sales CRM', undefined, edit))
        return true;
    if (v.access?.some(g => g.module === 'Account Management' && g.tab === area))
        return canAccess(v, 'Account Management', area, edit);
    return canAccess(v, 'Account Management', area, edit) || (legacy[area] || []).some(a => canAccess(v, 'Account Management', a, edit));
}
export function head(v: Viewer, staff: FinRecord[]) { return v.owner || v.role === 'Department Head' && v.department === 'Account Managers' || staff.some(r => r.kind === 'department' && r.name === 'Account Managers' && r.head === v.person); }
export function assigned(v: Viewer, a: Row) { return a.assignee === v.person || a.backup === v.person && !!a.backupUntil && String(a.backupUntil) >= today(); }
export function canEdit(v: Viewer, r: Row, all: Row[], staff: FinRecord[]): boolean {
    if(safetyKinds.includes(r.kind)||r.kind==='file'&&r.category==='Trespass evidence')return false;
    if(r.kind==='salesActivity') {const lead=all.find(a=>a.id===r.opportunityId&&a.kind==='opportunity');return !!lead&&canEdit(v,lead,all,staff);}
    if(r.kind==='workTypes') return access(v,'workOrders',true);
    if(r.kind==='comment') {const parent=all.find(p=>p.id===r.parentId); return !!parent && (!r.authorId||r.authorId===v.person) && canEdit(v,parent,all,staff);}
    if(r.kind==='workOrder' && canAccess(v,'Work Orders','orders')) return !r.readOnly;
    if(['fleetVehicle','fleetInspection','fleetDefect','fleetPM','woAsset','woProvider','woRecurring','woProject'].includes(r.kind) && canAccess(v,'Work Orders','orders',true)) return true;
    if (r.readOnly || !access(v, areas[r.kind], true))
        return false;
    if (r.kind === 'email' && r.authorId && r.authorId !== v.person)
        return false;
    if (r.kind === 'courtesy' && canAccess(v, 'Accounts', 'courtesy', true))
        return true;
    if (r.kind === 'email' && !r.accountId) return r.authorId === v.person;
    if (head(v, staff))
        return true;
    if (r.kind === 'playbook')
        return false;
    if (r.kind === 'account')
        return assigned(v, r);
    if (r.accountId)
        return all.some(a => a.id === r.accountId && assigned(v, a));
    if (r.kind === 'opportunity')
        return r.assignee === v.person;
    if (['contact', 'company'].includes(r.kind))
        return !all.some(a => a.id === r.id) || all.some(a => a.kind === 'account' && assigned(v, a) && (a.companyId === r.id || a.ownerId === r.id || all.some(f => f.kind === 'affiliation' && f.accountId === a.id && f.contactId === r.id && current(f))));
    if (r.companyId)
        return all.some(a => a.companyId === r.companyId && assigned(v, a));
    return false;
}
export function canRead(v: Viewer, r: Row) { return access(v, areas[r.kind]) && (r.kind !== 'email' || r.authorId === v.person || !!r.accountId && ['Linked','Sent'].includes(String(r.status))); }
export function canReadFile(v: Viewer, r: Row) {
    if (r.kind !== 'file')
        return false;
    if (r.category === 'Trespass evidence') return safetyAccess(v);
    if (r.category === 'Contact photo') return access(v,'relationships');
    if (r.category === 'Account photo') return access(v,'accounts') || canAccess(v,'Accounts','overview');
    if (r.category === 'Claim evidence') return access(v, 'claims');
    if (r.category === 'Email attachment')
        return access(v, 'email');
    if (['Internal policy', 'Release request', 'Release approval'].includes(String(r.category)))
        return access(v, 'courtesy');
    if (canRead(v, r))
        return true;
    const tabs: Record<string, string> = { Signage: 'signage', Agreement: 'agreement', 'Resident letter': 'overview', 'Welcome letter': 'overview', Timeline: 'overview' };
    return !!tabs[String(r.category)] && canAccess(v, 'Accounts', tabs[String(r.category)]);
}
export function clean(input: unknown, old: Row | undefined, v: Viewer, all: Row[], staff: FinRecord[], system = false): Row {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new AppError('Submit a record.');
    const p = input as Record<string, unknown>, kind = p.kind as Kind;
    if (!forms[kind] || !/^[A-Za-z0-9:_-]{1,150}$/.test(String(p.id)) || !Number.isSafeInteger(p.version) || Number(p.version) < 0)
        throw new AppError('Invalid record identity.');
    if(kind==='accountView'||safetyKinds.includes(kind)||old?.kind==='file'&&old.category==='Trespass evidence'||p.category==='Trespass evidence')throw new ForbiddenError('Use the trespass register.');
    if(kind==='workTypes') throw new ForbiddenError('Use Manage work types.');
    if (old && (old.kind !== kind || old.id !== p.id))
        throw new AppError('Record identity cannot change.');
    const result: Row = { ...old, id: String(p.id), kind, version: Number(p.version), name: String(old?.name || '') };
    const fields = [...forms[kind], { key: 'accountId', label: 'Account' }, { key: 'name', label: 'Name' }];
    for (const [key, value] of Object.entries(p)) {
        if (['id', 'kind', 'version'].includes(key))
            continue;
        const f = fields.find(f => f.key === key);
        if (!f)
            throw new AppError('Unsupported field: ' + key);
        if (f.type === 'checkbox') {
            if (typeof value !== 'boolean')
                throw new AppError('Invalid checkbox value.');
            result[key] = value;
        }
        else if (f.type === 'number') {
            if (value === '' || value == null) {
                delete result[key];
                continue;
            }
            if (typeof value !== 'number' && typeof value !== 'string' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1e9)
                throw new AppError('Enter a valid nonnegative ' + f.label + '.');
            const issue=numberError(f,value);if(issue)throw new AppError(issue);
            result[key] = Number(value);
        }
        else if (['attachments','checklist','ids'].includes(String(f.type))) {
            if (!Array.isArray(value) || value.length > (f.type==='attachments'?15:50) || value.some(a => typeof a !== 'string' || a.length > (f.type==='checklist'?600:150)))
                throw new AppError('Choose valid '+f.label.toLowerCase()+' within the allowed limit.');
            result[key] = [...new Set(value)] as string[];
        }
        else {
            if (typeof value !== 'string' || value.length > (f.type === 'textarea' ? 20000 : 1000) || value.includes('\0'))
                throw new AppError('Invalid ' + f.label + '.');
            result[key] = value.trim();
        }
        if (f.options && result[key] && !(kind==='workOrder'&&key==='type'?workTypeOptions(all):f.options).includes(String(result[key])) && result[key] !== old?.[key])
            throw new AppError('Choose a valid ' + f.label + '.');
        if (f.type === 'date' && result[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(String(result[key])) || !Number.isFinite(Date.parse(String(result[key]))) || new Date(String(result[key]) + 'T00:00:00Z').toISOString().slice(0, 10) !== result[key]))
            throw new AppError('Choose a valid date.');
    }
    if (['claim','courtesy','vehicle'].includes(kind)) {
        if (result.vin) { result.vin=vehicleKey(result.vin); if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(String(result.vin))) throw new AppError('Enter a 17-character VIN (no I, O or Q).'); }
        if (result.plate) result.plate=vehicleKey(result.plate);
        if (result.plateState) {result.plateState=vehicleKey(result.plateState); if(!/^[A-Z]{2}$/.test(String(result.plateState))) throw new AppError('Use a two-letter plate state.');}
    }
    if (kind === 'contact') {
        Object.assign(result,normalizeContact(result));
        if(result.linkedInUrl && !/^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%.-]+\/?$/.test(String(result.linkedInUrl))) throw new AppError('Use a LinkedIn profile URL beginning https://www.linkedin.com/in/.');
        if(result.dateOfBirth && String(result.dateOfBirth)>today()) throw new AppError('Date of birth cannot be in the future.');
        if(typeof result.approximateAge==='number' && (!Number.isInteger(result.approximateAge)||result.approximateAge>120||!result.ageAsOf)) throw new AppError('Enter a whole age up to 120 and when it was estimated.');
        if(result.ageAsOf && String(result.ageAsOf)>today()) throw new AppError('Use today or an earlier date for the age estimate.');
        if(typeof result.industryStartYear==='number' && (!Number.isInteger(result.industryStartYear)||result.industryStartYear<1900||result.industryStartYear>Number(today().slice(0,4)))) throw new AppError('Enter a valid first year in property management.');
        if(typeof result.yearsInRole==='number' && (result.yearsInRole>100||!result.experienceAsOf)) throw new AppError('Enter role experience up to 100 years and its as-of date.');
        if(result.experienceAsOf && String(result.experienceAsOf)>today()) throw new AppError('Use today or an earlier experience date.');
    }
    if (kind === 'comment') result.name='Comment';
    if (kind === 'email') result.authorId=old?.authorId||v.person;
    if (kind === 'email')
        result.name = String(result.subject || 'Email draft');
    if (kind === 'courtesy')
        result.name = String(result.vehicle || 'Vehicle release');
    if (kind === 'affiliation')
        result.name = String(result.role || 'Affiliation');
    if (!result.name)
        throw new AppError('Enter a name or subject.');
    for (const f of forms[kind])
        if (f.required && (result[f.key] === undefined || result[f.key] === '' || result[f.key] === null))
            throw new AppError('Complete ' + f.label + '.');
    if (!system && (!canEdit(v, result, all, staff) || old && !canEdit(v, old, all, staff)))
        throw new ForbiddenError('You can edit assigned accounts within your access.');
    for (const [key, k] of Object.entries({ accountId: 'account', companyId: 'company', ownerId: 'company', contactId: 'contact', primaryContactId: 'contact', subjectContactId: 'contact', requestedByContactId: 'contact', managerAffiliationId: 'affiliation', waitingContactId:'contact', inspectionId: 'inspection' }))
        if (result[key] && !all.some(r => r.id === result[key] && r.kind === k))
            throw new AppError('Choose an existing ' + k + '.');
    for (const key of ['assignee', 'backup', 'relationshipOwner'])
        if (result[key] && !staff.some(r => r.id === result[key] && r.kind === 'person' && r.status === 'Active'))
            throw new AppError('Choose an active employee.');
    if (result.backup && !staff.some(p=>p.id===result.backup && ['Account Managers','Operations'].includes(String(p.department)))) throw new AppError('Temporary coverage is limited to Account Management and Operations staff.');
    if (result.backup && !result.backupUntil)
        throw new AppError('Set an end date for temporary coverage.');
    if (result.startDate && result.endDate && String(result.endDate) < String(result.startDate))
        throw new AppError('End date must follow start date.');
    if (!['account', 'company', 'contact', 'affiliation', 'playbook', 'opportunity', 'email', 'workOrder', 'comment', 'salesActivity'].includes(kind) && !result.accountId)
        throw new AppError('Choose an account.');
    for (const key of ['email', 'alternateEmail', 'workEmail'])
        if (result[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(result[key])))
            throw new AppError('Enter a valid email address.');
    if (result.website && !/^https?:\/\/[^\s]+$/.test(String(result.website)))
        throw new AppError('Use a complete website URL.');
    if(kind==='opportunity'&&old?.onboardingAccountId&&result.stage!=='Won')throw new AppError('This property has been handed off. Manage its service status in Account Management.');
    if(kind==='opportunity'&&result.stage==='Lost'&&!result.lossReason)throw new AppError('Record why this opportunity was lost.');
    if (kind === 'account') {
        for(const [key,label,max] of healthFactors) if(typeof result['health_'+key]==='number' && Number(result['health_'+key])>max) throw new AppError(label+' cannot exceed '+max+'.');
        if (healthFactors.some(([key])=>result['health_'+key]!==old?.['health_'+key]) && (!result.healthReviewedOn || !result.healthReason)) throw new AppError('Record the assessment date and supporting relationship context.');
        if(result.healthReviewedOn && String(result.healthReviewedOn)>today()) throw new AppError('Assessment date cannot be in the future.');
        if(['internalNightLimit','internalWeekLimit'].some(k=>typeof result[k]==='number') && (!result.internalLimitReason || !result.internalLimitBy)) throw new AppError('Record who set the internal limit and why.');

        if(typeof p.enforcementHours==='string'&&p.enforcementHours.trim()&&p.enforcementHours!==old?.enforcementHours&&/^\s*Enforcement\s*:/im.test(String(result.instructions||'')))
            result.instructions=String(result.instructions).replace(/^\s*Enforcement\s*:[^\r\n]*/im,'Enforcement: '+p.enforcementHours.trim());
        if (!old)
            result.status = 'Onboarding';
        if (old && ['assignee', 'backup', 'backupUntil'].some(k => result[k] !== old[k]) && !head(v, staff))
            throw new ForbiddenError('Your Department Head manages account assignments.');
        if (!old && !head(v, staff) && result.assignee !== v.person)
            throw new ForbiddenError('Assign new accounts to yourself.');
    }
    if (kind === 'patrol') {
      if(result.mode==='Allowed window' && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(result.starts)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(result.ends)) || result.starts===result.ends)) throw new AppError('Enter distinct start and end times in 24-hour HH:MM format.');
      if (all.some(r=>r.id!==result.id && r.kind==='patrol' && r.accountId===result.accountId && r.day===result.day && r.scope===result.scope && String(r.startDate)<String(result.endDate||'9999-12-31') && String(result.startDate)<String(r.endDate||'9999-12-31'))) throw new AppError('This day already has a rule for this authority and date range. End or edit that rule first.');
    }
    if (kind === 'comment') {
        const parent=all.find(r=>r.id===result.parentId && ['task','workOrder'].includes(r.kind));
        if(!parent || parent.accountId!==result.accountId || old && old.parentId!==result.parentId) throw new AppError('Choose the task or work order for this comment.');
        result.authorId=old?.authorId||v.person;
    }
    if (['task','workOrder'].includes(kind)) {
        if(isWaiting(result) && !result.waitingOn) throw new AppError('Choose who this task is waiting on.');
        if(!isWaiting(result)) { result.remindOn=''; result.waitingOn=''; result.waitingContactId=''; }
        const items=result.checklist as string[]||[],done=result.completedSteps as string[]||[];
        if(items.some(item=>!/^[-a-zA-Z0-9_]+\|.+/.test(item)) || new Set(items.map(item=>item.split('|')[0])).size!==items.length || done.some(id=>!items.some(item=>item.split('|')[0]===id))) throw new AppError('Review the checklist items.');
        if(result.status==='Completed' && checklistProgress(result).done!==items.length) throw new AppError('Complete the checklist before closing this task.');
        if(result.status==='Completed' && old?.status!=='Completed') result.completedAt=new Date().toISOString();
    }
    if (kind === 'workOrder') {
        const ops=canAccess(v,'Work Orders','orders',true);
        const allowedStatuses = [...new Set([...orderStatuses, ...woStatuses])];
        if(!old) {result.authorId=v.person;result.requestedAt=new Date().toISOString(); if(!ops && (!['New','Requested'].includes(String(result.status))||result.assignee)) throw new ForbiddenError('Submit the request to Operations for assignment.');}
        if(!ops&&!old && ['actualCost','estimatedCost','scheduledDate','resolution'].some(k=>result[k]!==undefined&&result[k]!=='')) throw new ForbiddenError('Operations records scheduling, cost and completion.');
        if(result.assignee && !staff.some(p=>p.id===result.assignee && p.department==='Operations' && p.status==='Active')) throw new AppError('Choose an active Operations employee.');
        if(!ops && old && ['checklist','assignee','scheduledDate','status','actualCost','estimatedCost','resolution','completedSteps'].some(k=>JSON.stringify(result[k])!==JSON.stringify(old[k]))) throw new ForbiddenError('Operations manages assignment and completion. Add a comment to follow up.');
        if(!allowedStatuses.includes(String(result.status))) throw new AppError('Choose a work order status.');
        if(result.status==='Scheduled'&&!result.scheduledDate) throw new AppError('Choose a scheduled date.');
        if(['In progress','Ready for review','Completed','In Progress','Ready for Verification'].includes(String(result.status))&&!result.assignee) throw new AppError('Assign an Operations employee.');
        if(result.status==='Completed'&&!result.resolution) throw new AppError('Add completion notes.');
    }
    if (kind === 'task') {
        if (result.status === 'Completed' && !result.resolution)
            throw new AppError('Record the outcome before completing this action.');
        if (result.dependsOn && (result.dependsOn === result.id || !all.some(r => r.id === result.dependsOn && r.kind === 'task' && r.accountId === result.accountId)))
            throw new AppError('Choose a preceding task on this account.');
        if (result.status === 'Completed' && result.dependsOn && all.find(r => r.id === result.dependsOn)?.status !== 'Completed')
            throw new AppError('Complete the preceding task first.');
    }
    if(kind==='activity' && result.channel!=='Note' && !result.response) result.response='Attempted';
    if(kind==='company'&&!old&&all.some(r=>r.kind==='company'&&r.name.trim().toLowerCase()===result.name.toLowerCase())) throw new AppError('This company already exists. Select it from the list.');
    if (kind === 'activity' && String(result.date) > today() && result.response !== 'Scheduled')
        throw new AppError('Mark future contacts Scheduled.');
    if (kind === 'inspection' && result.dateConfirmed && String(result.date) > today())
        throw new AppError('A completed inspection cannot have a future date.');
    if (kind === 'affiliation' && !result.accountId && !result.companyId)
        throw new AppError('Link the contact to a property or company.');
    if(kind==='account'&&old&&result.companyId!==old.companyId){result.managementReviewedAt=new Date().toISOString();delete result.managementSource;delete result.managementCheckedOn;}
    if (kind === 'file' && old && ['Internal policy', 'Email attachment', 'Claim evidence', 'Account photo', 'Contact photo'].includes(String(old.category)) && result.category !== old.category)
        throw new ForbiddenError('This file classification is fixed by its source.');
    if(kind==='file' && ['Account photo','Contact photo'].includes(String(result.category))) throw new ForbiddenError('Use the profile photo uploader.');
    if (kind === 'file' && result.inspectionId && !all.some(r => r.id === result.inspectionId && r.accountId === result.accountId || r.id === result.inspectionId && !r.accountId && head(v, staff)))
        throw new AppError('Choose an inspection for this property.');
    if (kind === 'file' && !system && !old)
        throw new ForbiddenError('Use the file uploader.');
    if (kind === 'email' && !system) {
        if (old && old.status !== 'Draft')
            throw new AppError('Sent or pending messages cannot be edited.');
        result.status = 'Draft';
        result.authorId = v.person;
    }
    return result;
}
