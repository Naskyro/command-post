import {researchedCompanies,researchedManagement} from './management-research';
import { financeDb, financeFiles } from '@/db/finance';
import { allRecords, identify, validate as validateFinance } from '@/lib/finance/server';
import { canAccess, recordAccess } from '@/lib/finance/access';
import type { Viewer, FinRecord } from '@/lib/finance/model';
import { AppError, ConflictError, ForbiddenError } from '@/lib/shared/errors';
import { access, head, canEdit, canRead, canReadFile, clean } from './policy';
import { prepareRelease } from './releases';
import { today, type Row } from './model';
import { prepareClaim } from './claims';
import history from './history-data.json';
import { normalizeContact } from './contact-details';
import { workTypeSettingsId } from './work-options';
import agreements from './agreement-data.json';
import seeds from './seed-data.json';
import propertyPhotos from './property-photo-data.json';
import {dispatchCategories,isDispatchNote,isDispatchReply,noteRecipients} from './dispatch-notes';
import {permitFields} from './permit-details';
import {operatingDefaults, operatingFields} from './profile-summary';
import { isPendingAccount, onboardingReadiness, onboardingTasks } from './onboarding';
export async function records() { const result = await financeDb().prepare('SELECT payload FROM account_records ORDER BY id LIMIT 20000').all<{
    payload: string;
}>(); const map = new Map(([...seeds,...agreements,...researchedCompanies] as Row[]).map(r => [r.id, r.kind==='account' ? {...(propertyPhotos as Record<string,object>)[r.id],...r,...(history.profileDefaults as Record<string,object>)[r.id]} : r])); for (const r of result.results) {
    const value = JSON.parse(r.payload) as Row;
    map.set(value.id, {...map.get(value.id),...value});
} return [...map.values()].filter(r=>!r.deleted&&r.status!=='Deleted').map(r=>r.kind==='contact'?normalizeContact(r):r.kind==='account'?operatingDefaults({...r,...(!r.managementReviewedAt?researchedManagement(r):{})}):r); }
export async function context(request: Request) { const staff = await allRecords(), viewer = identify(staff, request.headers); if (!staff.some(r => r.id === viewer.person && r.status === 'Active') || !['Accounts', 'Account Management', 'Sales CRM', 'Compliance, Claims & Recovery', 'Work Orders'].some(m => canAccess(viewer, m)))
    throw new ForbiddenError(); return { staff, viewer, all: await records() }; }
export async function writeMany(changes: {
    old?: Row;
    next: Row;
}[], v: Viewer, action: string, effects: D1PreparedStatement[] = []) {
    if (changes.length > 80 || new Set(changes.map(c => c.next.id)).size !== changes.length)
        throw new AppError('Save at most 80 distinct records.');
    const db = financeDb(), at = new Date().toISOString(), batch: D1PreparedStatement[] = [], saved: Row[] = [];
    for (const { old, next } of changes) {
        const value: Row = { ...next, version: (old?.version || 0) + 1, updatedAt: at, updatedBy: v.name, authorId: next.authorId || v.person }, payload = JSON.stringify(value), id = crypto.randomUUID();
        batch.push(old?.version ? db.prepare('UPDATE account_records SET payload=?,version=?,updated_at=?,account_id=? WHERE id=? AND version=?').bind(payload, value.version, at, value.accountId || null, value.id, old.version) : db.prepare('INSERT OR IGNORE INTO account_records (id,kind,account_id,payload,version,updated_at) VALUES (?,?,?,?,?,?)').bind(value.id, value.kind, value.accountId || null, payload, value.version, at));
        batch.push(db.prepare('INSERT INTO account_write_guard (id,success) VALUES (?,changes())').bind(id));
        batch.push(db.prepare('INSERT INTO account_audit (id,record_id,account_id,actor,actor_id,at,action,before,after) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, value.id, value.kind === 'account' ? value.id : value.accountId || null, v.name, v.id, at, action, old ? JSON.stringify(old) : null, payload));
        batch.push(db.prepare('DELETE FROM account_write_guard WHERE id=?').bind(id));
        saved.push(value);
    }
    try {
        await db.batch([...batch, ...effects]);
    }
    catch (e) {
        if (e instanceof Error && /account_write_succeeded|UNIQUE constraint/.test(e.message))
            throw new ConflictError();
        throw e;
    }
    return saved;
}
export function projection(all: Row[], v: Viewer, surface: string) {
    all=all.filter(r=>!['trespass','safetyEvent','safetyReview','safetyUpdate','accountView'].includes(r.kind)&&!(r.kind==='file'&&r.category==='Trespass evidence'));
    if (surface === 'dispatch') {
        const pending = new Set(all.filter(isPendingAccount).map(r => r.id));
        all = all.filter(r => !pending.has(r.id) && !pending.has(String(r.accountId || '')));
    }
    if(surface==='orders') { if(!canAccess(v,'Work Orders','orders')) throw new ForbiddenError(); const orders=all.filter(r=>r.kind==='workOrder'); const woKinds=['fleetVehicle','fleetInspection','fleetDefect','fleetPM','woAsset','woProvider','woRecurring','woProject']; return orders.concat(all.filter(r=>r.kind==='workTypes'),all.filter(r=>r.kind==='comment'&&orders.some(o=>o.id===r.parentId)),all.filter(r=>r.kind==='account'||r.kind==='contact').map(r=>({id:r.id,kind:r.kind,version:r.version,name:r.name,address:r.kind==='account'?r.address:undefined})),all.filter(r=>woKinds.includes(r.kind))); }
    if(surface==='claims') { if(!access(v,'claims')) throw new ForbiddenError(); return all.filter(r=>r.kind==='claim'||r.kind==='file'&&r.category==='Claim evidence').concat(all.filter(r=>['account','contact'].includes(r.kind)).map(r=>({id:r.id,kind:r.kind,version:r.version,name:r.name,assignee:r.assignee}))); }
    if (surface !== 'dispatch')
        return all.filter(r => r.kind !== 'vehicle' && (r.kind==='comment' ? all.some(p=>p.id===r.parentId&&canRead(v,p)) : r.kind === 'file' ? canReadFile(v, r) : canRead(v, r)));
    if (!canAccess(v, 'Accounts'))
        throw new ForbiddenError();
    const fields: Record<string, string[]> = { account: [...operatingFields,...permitFields,'managementSource','managementCheckedOn','launchDate','sourceNames','backup','backupUntil', 'name', 'status', 'service', 'address', 'assignee', 'jurisdiction', 'instructions', 'gateCode', 'officeContact', 'primaryContactId', 'spaceCallAuthority', 'companyId', 'propertyType','phone','photo','photoSource','agreementStart','agreementEnd','agreementTerm','renewalDate','cancellationDays','cancellationTerms','noticeDeadline','agreementVerified','relationshipStart','propertyNightLimit','propertyWeekLimit','internalNightLimit','internalWeekLimit','limitsFrom','limitsUntil'], contact: ['name', 'title', 'email', 'phone'], company: ['name', 'type'], affiliation: ['name', 'accountId', 'contactId', 'role', 'startDate', 'endDate', 'workPhone', 'workEmail'], inspection: ['name', 'accountId', 'date', 'dateConfirmed', 'complete', 'condition', 'locations', 'sourceFolder'], decision: ['name', 'accountId', 'type', 'reason', 'effectiveDate', 'acknowledgedBy', 'updatedBy'], activity: ['name', 'accountId', 'date', 'details', 'channel', 'updatedBy','updatedAt','authorId','noteCreatedAt','priority','category','towbookReference','plate','plateState','vin','incidentDate','parentNoteId','pinned','acknowledgedAt','acknowledgedBy','recipientIds'], file: ['name', 'accountId', 'inspectionId', 'category', 'status', 'date', 'dateConfirmed', 'language', 'mimeType', 'sourceUrl', 'sourceOnly', 'sourceFolder', 'location'] };
    if (!canAccess(v, 'Accounts', 'overview'))
        fields.account = ['name', 'status', 'service', 'assignee', 'companyId'];
    return all.flatMap(r => {
        if(r.kind==='patrol') return canAccess(v,'Accounts','overview')?[r]:[];
        if (r.kind === 'courtesy')
            return canAccess(v, 'Accounts', 'courtesy') ? [r] : [];
        if (!fields[r.kind] || r.kind === 'file' && !canReadFile(v, r) || r.kind === 'inspection' && !canAccess(v, 'Accounts', 'signage') || r.kind === 'decision' && !canAccess(v, 'Accounts', 'overview') || r.kind === 'activity' && (!canAccess(v, 'Accounts', 'notes') || !isDispatchNote(r)&&!isDispatchReply(r)))
            return [];
        return [Object.fromEntries(['id', 'kind', 'version', ...fields[r.kind]].filter(k => r[k] !== undefined).map(k => [k, r[k]])) as Row];
    });
}
export async function save(body: Record<string, unknown>, ctx: Awaited<ReturnType<typeof context>>) {
    const { viewer: v, staff, all } = ctx, action = String(body.action || 'save');
    if (action === 'activateOnboarding' || action === 'onboardingContact' || action === 'propertyContact') {
        const account = all.find(r => r.kind === 'account' && r.id === body.accountId);
        if (!account || action !== 'propertyContact' && !isPendingAccount(account) || !canEdit(v, account, all, staff)) throw new ForbiddenError();
        if (body.accountVersion !== account.version) throw new ConflictError();
        if (action === 'activateOnboarding') {
            if (!access(v, 'decisions', true)) throw new ForbiddenError();
            const readiness = onboardingReadiness(account, all);
            if (!readiness.ready) throw new AppError('Finish onboarding before activation: ' + readiness.missing.join('; '));
            return writeMany([
                {old: account, next: {...account, status: 'Active', onboardingCompletedAt: new Date().toISOString()}},
                {next: {id: crypto.randomUUID(), kind: 'decision', version: 0, name: 'Onboarding completed', accountId: account.id,
                    type: 'Activate', date: today(), effectiveDate: today(), reason: 'Property profile and required launch checklist completed.'}},
            ], v, 'Completed onboarding and activated property');
        }
        if (!access(v, 'relationships', true)) throw new ForbiddenError();
        const requestedContact = String(body.contactId || '');
        const existingContact = all.find(r => r.id === requestedContact && r.kind === 'contact');
        if (requestedContact && !existingContact) throw new AppError('Choose an existing contact.');
        const rename = !!existingContact && typeof body.name === 'string' && body.name.trim() !== existingContact.name;
        if (rename && body.contactVersion !== existingContact!.version) throw new ConflictError();
        const contact = existingContact ? rename ? clean({id:existingContact.id,kind:'contact',version:existingContact.version,name:body.name},existingContact,v,all,staff) : existingContact
            : clean({id: crypto.randomUUID(), kind: 'contact', version: 0, name: body.name || ''}, undefined, v, all, staff);
        const oldAffiliation = all.find(r => r.kind === 'affiliation' && r.accountId === account.id && r.contactId === contact.id
            && (!r.startDate || String(r.startDate) <= today()) && (!r.endDate || String(r.endDate) > today()));
        if ((oldAffiliation?.version || 0) !== body.affiliationVersion) throw new ConflictError();
        const affiliation = clean({id: oldAffiliation?.id || crypto.randomUUID(), kind: 'affiliation', version: oldAffiliation?.version || 0,
            contactId: contact.id, accountId: account.id, role: body.role || 'Property Manager',
            ...(typeof body.startDate === 'string' ? {startDate:body.startDate} : {}),
            workEmail: body.workEmail || '', workPhone: body.workPhone || ''}, oldAffiliation, v, [...all, ...(!existingContact ? [contact] : [])], staff);
        const makePrimary = action === 'onboardingContact' || body.makePrimary === true || !account.primaryContactId;
        if (makePrimary && affiliation.startDate && String(affiliation.startDate) > today()) throw new AppError('A primary contact must have started at this property.');
        const changes: {old?:Row;next:Row}[] = [];
        if (body.endPrevious === true) {
            if (!makePrimary || account.primaryContactId === contact.id || !affiliation.startDate) throw new AppError('Enter the new manager’s start date before ending the previous manager’s tenure.');
            const former = all.find(r => r.kind === 'affiliation' && r.accountId === account.id && r.contactId === account.primaryContactId && !r.endDate);
            if (!former || former.version !== body.previousAffiliationVersion) throw new ConflictError();
            changes.push({old:former,next:clean({id:former.id,kind:'affiliation',version:former.version,endDate:affiliation.startDate},former,v,all,staff)});
        }
        return writeMany([
            ...(!existingContact || rename ? [{old:existingContact,next: contact}] : []), {old: oldAffiliation, next: affiliation}, ...changes,
            {old: account, next: {...account, primaryContactId: makePrimary ? contact.id : account.primaryContactId}},
        ], v, 'Saved property contact and affiliation');
    }
    if (action === 'workTypes') {
        if(!access(v,'workOrders',true)) throw new ForbiddenError();
        const old=all.find(r=>r.id===workTypeSettingsId), items=body.options;
        if((old?.version||0)!==body.version) throw new ConflictError();
        if(!Array.isArray(items)||items.length>60||items.some(x=>typeof x!=='string'||!x.trim()||x.trim().length>80)) throw new AppError('Use up to 60 work types, each under 80 characters.');
        const options=items.map(x=>String(x).trim());
        if(new Set(options.map(x=>x.toLowerCase())).size!==options.length) throw new AppError('This work type is already listed.');
        return writeMany([{old,next:{id:workTypeSettingsId,kind:'workTypes',version:old?.version||0,name:'Work types',options}}],v,'Updated shared work types');
    }
    if (action === 'participant') {
        if (!access(v, 'courtesy', true))
            throw new ForbiddenError();
        const name = String(body.name || '').trim();
        if (!name || name.length > 150)
            throw new AppError('Enter the participant’s name.');
        return writeMany([{ next: { id: crypto.randomUUID(), kind: 'contact', version: 0, name, contactType: 'Release participant' } }], v, 'Added release participant');
    }
    if (['dispatchMessage','dispatchReply','pinDispatchNote','ackDispatchNote'].includes(action)) {
        const parent=all.find(r=>r.id===body.noteId&&isDispatchNote(r));
        const account=all.find(r=>r.kind==='account'&&r.id===(parent?.accountId||body.accountId));
        if(!account)throw new AppError('Choose a property.');
        const manager=access(v,'activity',true)&&canEdit(v,account,all,staff);
        const dispatcher=canAccess(v,'Accounts','notes',true);
        if(action==='pinDispatchNote'||action==='ackDispatchNote') {
            if(!parent||!manager)throw new ForbiddenError();
            if(parent.version!==body.version)throw new ConflictError();
            if(action==='pinDispatchNote'&&typeof body.pinned!=='boolean')throw new AppError('Choose whether to star the note.');
            return writeMany([{old:parent,next:{...parent,...(action==='pinDispatchNote'?{pinned:body.pinned===true}:{acknowledgedAt:parent.acknowledgedAt||new Date().toISOString(),acknowledgedBy:parent.acknowledgedBy||v.name})}}],v,action==='pinDispatchNote'?'Updated dispatch note star':'Acknowledged dispatch note');
        }
        if(!dispatcher&&!manager)throw new ForbiddenError();
        if(typeof body.details!=='string'||!body.details.trim()||body.details.length>20000)throw new AppError('Enter a message under 20,000 characters.');
        if(action==='dispatchReply'&&!parent)throw new AppError('Choose a note to reply to.');
        const id=String(body.id||'');if(!/^[A-Za-z0-9:_-]{1,150}$/.test(id))throw new AppError('Invalid message identity.');
        const duplicate=all.find(r=>r.id===id);if(duplicate){if(duplicate.authorId===v.person&&duplicate.accountId===account.id&&(isDispatchNote(duplicate)||isDispatchReply(duplicate)))return [duplicate];throw new ConflictError();}
        const priority=body.priority||'Normal',category=body.category||'General note';
        if(!['Normal','Urgent'].includes(String(priority))||!dispatchCategories.includes(String(category)))throw new AppError('Choose a message type and urgency.');
        const next:Row={id,kind:'activity',version:0,name:action==='dispatchReply'?'Reply':String(category),accountId:account.id,channel:action==='dispatchReply'?'Dispatcher reply':'Dispatcher note',date:today(),details:body.details.trim(),priority:String(priority),category:String(category),assignee:account.assignee,recipientIds:noteRecipients(account),noteCreatedAt:new Date().toISOString(),parentNoteId:parent?.id};
        for(const key of ['towbookReference','plate','plateState','vin','incidentDate'])if(body[key]) {if(typeof body[key]!=='string'||String(body[key]).length>150)throw new AppError('Enter a valid vehicle / tow reference.');next[key]=String(body[key]).trim();}
        return writeMany([{next}],v,action==='dispatchReply'?'Replied to dispatch handoff':'Sent dispatch handoff');
    }
    if (action === 'dispatcherNote' || action === 'signageReport') {
        const a = all.find(r => r.id === body.accountId && r.kind === 'account'), report = action === 'signageReport';
        if (!a || !canAccess(v, 'Accounts', report ? 'signage' : 'notes', true))
            throw new ForbiddenError();
        if (typeof body.details !== 'string' || !body.details.trim() || body.details.length > 20000)
            throw new AppError('Enter the note or reported issue.');
        return writeMany([{ next: { id: crypto.randomUUID(), kind: report ? 'task' : 'activity', version: 0, name: report ? 'Signage issue reported' : 'Dispatch note', accountId: a.id, details: body.details.trim(), date: today(), assignee: a.assignee, ...(report ? { type: 'Signage report', status: 'Open', dueDate: today(), priority: 'High' } : { channel: 'Dispatcher note' }) } }], v, report ? 'Reported signage issue' : 'Recorded dispatch note');
    }
    if (action === 'onboard') {
        const a = all.find(r => r.id === body.id && r.kind === 'account');
        if (!a || !canEdit(v, a, all, staff) || !access(v, 'work', true))
            throw new ForbiddenError();
        const changes = onboardingTasks(a, all).map(next => ({next}));
        if (!changes.length && a.onboardingStartedAt) return [a];
        return writeMany([{old: a, next: {...a, onboardingStartedAt: a.onboardingStartedAt || new Date().toISOString()}}, ...changes], v, 'Started onboarding checklist');
    }
    if (action === 'terminateAccount') {
        const a = all.find(r => r.id === body.accountId && r.kind === 'account');
        if (!a || a.status !== 'Onboarding' || !canEdit(v, a, all, staff)) throw new ForbiddenError();
        if (body.accountVersion !== a.version) throw new ConflictError();
        const at = new Date().toISOString();
        return writeMany([{ old: a, next: { ...a, status: 'Terminated', terminatedAt: at, terminatedBy: v.name } }], v, 'Property terminated from pending');
    }
    if (action === 'reOnboard') {
        const a = all.find(r => r.id === body.accountId && r.kind === 'account');
        if (!a || a.status !== 'Terminated' || !canEdit(v, a, all, staff)) throw new ForbiddenError();
        if (body.accountVersion !== a.version) throw new ConflictError();
        const at = new Date().toISOString();
        return writeMany([{ old: a, next: { ...a, id: a.id, kind: 'account', version: a.version, status: 'Onboarding', onboardingStartedAt: undefined, onboardingCompletedAt: undefined, activatedAt: undefined, terminatedAt: undefined, terminatedBy: undefined, updatedAt: at } }], v, 'Property returned to onboarding');
    }
    if (action === 'deleteAccount') {
        const a = all.find(r => r.id === body.id && r.kind === 'account');
        if (!a || !canEdit(v, a, all, staff)) throw new ForbiddenError();
        if (a.status !== 'Onboarding' && a.status !== 'Terminated') throw new AppError('Only pending or terminated properties can be permanently deleted.');
        const db = financeDb(), at = new Date().toISOString();
        const tombstone = { id: a.id, kind: 'account', version: (a.version || 0) + 1, name: a.name, status: 'Deleted', deleted: true, deletedAt: at, deletedBy: v.name, updatedAt: at, updatedBy: v.name };
        await db.batch([
            db.prepare('DELETE FROM account_records WHERE id = ?').bind(a.id),
            db.prepare('DELETE FROM account_records WHERE account_id = ?').bind(a.id),
            db.prepare('INSERT OR IGNORE INTO account_records (id, kind, account_id, payload, version, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
                .bind(a.id, 'account', null, JSON.stringify(tombstone), tombstone.version, at),
            db.prepare('INSERT INTO account_audit (id, record_id, account_id, actor, actor_id, at, action, before, after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .bind(crypto.randomUUID(), a.id, a.id, v.name, v.id, at, 'Deleted property permanently', JSON.stringify(a), JSON.stringify(tombstone))
        ]);
        return [];
    }
    if (action === 'acknowledge') {
        const r = all.find(r => r.kind === 'decision' && r.id === body.id);
        if (!r || !canAccess(v, 'Accounts', 'overview') && !access(v, 'decisions'))
            throw new ForbiddenError();
        return writeMany([{ old: r, next: { ...r, acknowledgedBy: [...new Set([...String(r.acknowledgedBy || '').split(', ').filter(Boolean), v.name])].join(', ') } }], v, 'Acknowledged operating decision');
    }
    if (action === 'submitMileage') {
        const r = all.find(r => r.kind === 'activity' && r.id === body.id);
        if (!r || r.assignee !== v.person || !canEdit(v, r, all, staff) || !recordAccess(v, { id: '', kind: 'reimbursement', version: 0 }, true))
            throw new ForbiddenError();
        if (r.reimbursementId)
            return [r];
        if (r.version !== body.version)
            throw new ConflictError();
        if (r.channel !== 'Onsite visit' || r.response === 'Scheduled' || !r.date || String(r.date) > today() || !(Number(r.miles) > 0) || !(Number(r.mileageRate) > 0) || Number(r.mileageRate) > 10 || !r.startPoint || !r.destination)
            throw new AppError('Record the completed visit date, route, business miles and reimbursement rate.');
        const db = financeDb(), at = new Date().toISOString(), id = 'account-mileage:' + r.id, amount = Math.round(Number(r.miles) * Number(r.mileageRate) * 100) / 100;
        const claim: FinRecord = { id, kind: 'reimbursement', version: 1, person: v.person, date: r.date, amount, status: 'Draft', description: 'Mileage: ' + r.name, expenseId: r.id, accountId: r.accountId, source: 'Account Management visit ' + r.id, notes: r.startPoint + ' → ' + r.destination + '; ' + r.miles + ' miles × $' + r.mileageRate };
        validateFinance(claim, undefined, v, staff);
        const payload = JSON.stringify(claim);
        return writeMany([{ old: r, next: { ...r, reimbursementId: id, submittedAmount: amount } }], v, 'Submitted mileage to Finance', [db.prepare('INSERT INTO finance_records (id,kind,payload,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)').bind(id, claim.kind, payload, 1, v.name, at), db.prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), id, v.name, v.id, at, 'Mileage submitted from account visit', null, payload)]);
    }
    const input = body.record as Row;
    if (!input)
        throw new AppError('Submit a record.');
    const old = all.find(r => r.id === input.id);
    if (old && old.version !== input.version)
        throw new ConflictError();
    if(input.kind==='claim') return writeMany([{old,next:prepareClaim(input,old,v,all,staff,action)}],v,action==='save'?'Updated claim investigation':action);
    if (input.kind === 'courtesy') {
        const r = prepareRelease(input, old, v, all, staff, action);
        return writeMany([{ old, next: r.next }, ...(r.serialize ? [{ old: r.account, next: { ...r.account, courtesyRevision: Number(r.account.courtesyRevision || 0) + 1 } }] : [])], v, action);
    }
    const next = clean(input, old, v, all, staff), changes: {
        old?: Row;
        next: Row;
    }[] = [{ old, next }];
    if (next.kind === 'account' && !old) {
        next.onboardingStartedAt = new Date().toISOString();
        changes.push(...onboardingTasks(next, all).map(next => ({next})));
    }
    if (old && next.accountId !== old.accountId && !(old.kind==='email'&&old.status==='Draft'&&old.authorId===v.person&&!old.accountId) && !(head(v, staff) && !old.accountId && ['file', 'inspection'].includes(old.kind)))
        throw new AppError('Create a new linked record to preserve account history.');
    if (old?.reimbursementId && ['date', 'assignee', 'miles', 'mileageRate', 'startPoint', 'destination'].some(k => old[k] !== next[k]))
        throw new AppError('Correct submitted reimbursements in Finance.');
    if (next.kind === 'decision') {
        if (old)
            throw new AppError('Record a new decision to preserve the previous decision.');
        const a = all.find(r => r.id === next.accountId)!;
        if (!canEdit(v, a, all, staff))
            throw new ForbiddenError();
        const status: Record<string, string> = { Activate: 'Active', Reactivate: 'Active', 'Pause service': 'Paused', 'Cancellation notice': 'Cancellation notice', Terminate: 'Terminated' };
        if (status[String(next.type)]) {
            if (body.accountVersion !== a.version)
                throw new ConflictError();
            if (String(next.effectiveDate) > today())
                throw new AppError('Add a task for future service changes; record the decision on its effective date.');
            if (status[String(next.type)] === 'Active' && isPendingAccount(a)) {
                const readiness = onboardingReadiness(a, all);
                if (!readiness.ready) throw new AppError('Finish the pending property onboarding steps before activation: ' + readiness.missing.join('; '));
            }
            if (status[String(next.type)] === 'Active' && all.some(r => r.kind === 'task' && r.accountId === a.id && r.required && r.type === 'Onboarding' && !['Completed', 'Cancelled'].includes(String(r.status))) && !next.exception)
                throw new AppError('Complete required onboarding actions or document an exception.');
            changes.push({ old: a, next: { ...a, status: status[String(next.type)] } });
            if (next.type === 'Pause service')
                changes.push({ next: { id: 'recovery:' + next.id, kind: 'task', version: 0, name: 'Pause recovery plan', accountId: a.id, type: 'Pause recovery', status: 'Open', priority: 'High', dueDate: today(), assignee: a.assignee, details: next.outcome || next.reason } });
        }
    }
    if (next.kind === 'activity' && (!old || old.nextFollowUp !== next.nextFollowUp || old.assignee !== next.assignee || old.outcome !== next.outcome)) {
        const task = all.find(r => r.kind === 'task' && r.sourceActivityId === next.id && !['Completed', 'Cancelled'].includes(String(r.status)));
        if (next.nextFollowUp)
            changes.push({ old: task, next: { ...task, id: task?.id || 'follow-up:' + next.id + ':' + (Number(old?.version || 0) + 1), kind: 'task', version: task?.version || 0, name: 'Follow up: ' + next.name, accountId: next.accountId, type: 'Follow-up', status: task?.status || 'Open', assignee: next.assignee || v.person, dueDate: next.nextFollowUp, details: next.outcome, sourceActivityId: next.id } });
        else if (task)
            changes.push({ old: task, next: { ...task, status: 'Cancelled', resolution: 'Follow-up removed from the contact record.' } });
    }
    if (next.kind === 'affiliation' && body.endAffiliationId) {
        const former = all.find(r => r.id === body.endAffiliationId && r.kind === 'affiliation' && r.contactId === next.contactId);
        if (!former || !canEdit(v, former, all, staff))
            throw new ForbiddenError();
        if (former.version !== body.endAffiliationVersion)
            throw new ConflictError();
        if (!next.startDate)
            throw new AppError('Choose the date the new affiliation begins.');
        changes.push({ old: former, next: { ...former, endDate: next.startDate } });
        const previous = all.find(r => r.id === former.accountId && r.primaryContactId === former.contactId);
        if (previous)
            changes.push({ old: previous, next: { ...previous, primaryContactId: '' } });
    }
    if (next.kind === 'affiliation' && old && next.endDate && !old.endDate) {
        const previous = all.find(r => r.id === old.accountId && r.primaryContactId === old.contactId);
        if (previous)
            changes.push({ old: previous, next: { ...previous, primaryContactId: '' } });
    }
    if (next.kind === 'file' && next.supersedes && next.supersedes !== old?.supersedes) {
        const file = all.find(r => r.id === next.supersedes && r.kind === 'file' && r.accountId === next.accountId);
        if (!file || !canEdit(v, file, all, staff))
            throw new ForbiddenError();
        changes.push({ old: file, next: { ...file, status: 'Archived' } });
    }
    if (next.kind === 'file' && old && !old.accountId && next.accountId) {
        const inspection = all.find(r => r.id === old.inspectionId);
        if (inspection)
            changes.push({ old: inspection, next: { ...inspection, accountId: next.accountId } });
        for (const sibling of all.filter(r => r.kind === 'file' && r.id !== old.id && r.inspectionId === old.inspectionId && !r.accountId))
            changes.push({ old: sibling, next: { ...sibling, accountId: next.accountId } });
    }
    return writeMany(changes, v, 'Saved ' + next.kind);
}
export async function fileBytes(file: Row) {
    if (file.storageKey) {
        const object = await financeFiles().get(String(file.storageKey));
        if (!object)
            throw new AppError('File unavailable.', 404);
        return { body: new Uint8Array(await object.arrayBuffer()), mime: String(file.mimeType || 'application/octet-stream') };
    }
    const sources = import.meta.glob<{
        default: {
            data: string;
            mime: string;
        };
    }>('./source-files/*.json'), key = './source-files/' + file.id.replace(/[^A-Za-z0-9_-]/g, '_') + '.json', load = sources[key];
    if (!load)
        throw new AppError('File unavailable.', 404);
    const r = (await load()).default;
    return { body: Uint8Array.from(atob(r.data), c => c.charCodeAt(0)), mime: r.mime };
}
