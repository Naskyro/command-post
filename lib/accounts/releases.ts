import type { Viewer, FinRecord } from '@/lib/finance/model';
import { canAccess } from '@/lib/finance/access';
import { AppError, ForbiddenError } from '@/lib/shared/errors';
import { head, assigned, clean } from './policy';
import { managerRoles } from './insights';
import { today, waived, assessment, type Row } from './model';
export function canApprove(v: Viewer, a: Row, staff: FinRecord[]) { return canAccess(v, 'Account Management', 'courtesyApprove', true) && (head(v, staff) || assigned(v, a)); }
export function prepareRelease(input: unknown, old: Row | undefined, v: Viewer, all: Row[], staff: FinRecord[], action: string) {
    const p = input as Row, a = all.find(a => a.id === p.accountId && a.kind === 'account');
    if (!a)
        throw new AppError('Choose a property.');
    const manager = canAccess(v, 'Account Management', 'courtesy', true) && (head(v, staff) || assigned(v, a));
    if (!manager && !canAccess(v, 'Accounts', 'courtesy', true))
        throw new ForbiddenError();
    const next = clean(input, old, v, all, staff, true);
    if (old && old.accountId !== next.accountId)
        throw new AppError('Void an incorrect entry and record it on the correct property.');
    next.status = old?.status || 'Draft';
    next.vin = String(next.vin || '').replace(/\s/g, '').toUpperCase();
    if (next.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(next.vin))
        throw new AppError('Enter the full 17-character VIN without I, O or Q.');
    if (String(next.date) > today())
        throw new AppError('The release date cannot be in the future.');
    if (typeof next.originalCharges === 'number' && typeof next.amountCharged === 'number' && next.amountCharged > next.originalCharges)
        throw new AppError('Final charges cannot exceed original charges.');
    for (const key of ['originalCharges', 'amountCharged', 'transportCost'])
        if (typeof next[key] === 'number' && Math.abs(Number(next[key]) * 100 - Math.round(Number(next[key]) * 100)) > 0.00001)
            throw new AppError('Use no more than two decimal places for dollar amounts.');
    next.amountWaived = waived(next.originalCharges, next.amountCharged);
    for (const key of ['requestEvidenceId', 'approvalEvidenceId'])
        if (next[key] && !all.some(r => r.id === next[key] && r.accountId === a.id && r.kind === 'file' && r.category !== 'Internal policy'))
            throw new AppError('Choose release evidence attached to this account.');
    if (next.managerAffiliationId && (!old?.managerContactId || old.managerAffiliationId !== next.managerAffiliationId)) {
        const tenure = all.find(r => r.id === next.managerAffiliationId && r.kind === 'affiliation' && r.accountId === a.id && managerRoles.includes(String(r.role)));
        if (!tenure?.startDate || String(tenure.startDate) > String(next.date) || tenure.endDate && String(tenure.endDate) <= String(next.date))
            throw new AppError('Choose a confirmed manager tenure covering the release date.');
        next.managerContactId = tenure.contactId;
        next.managerName = all.find(r => r.id === tenure.contactId)?.name;
        next.managerTenureStart = tenure.startDate;
        next.managerTenureEnd = tenure.endDate || '';
        next.companyAtRelease = a.companyId || '';
    }
    if (['Approved', 'Released', 'Imported'].includes(String(old?.status))) {
        const comparable=(value:unknown)=>value===undefined||value===null||value===''?'':typeof value==='string'?value.trim():value;
        const changes = Object.keys(p).filter(k => !['version'].includes(k) && JSON.stringify(comparable(p[k])) !== JSON.stringify(comparable(old?.[k])));
        const completion = ['name', 'details', 'vin', 'plate', 'plateState', 'vinUnavailableReason', 'approvalEvidenceId', 'releaseDocumentsComplete', 'towbookRecorded', 'towbookReference', 'towbookCode', 'correctionReason'];
        if (old?.status !== 'Imported' && changes.some(k => ['originalCharges', 'amountCharged', 'category', 'errorType', 'subjectContactId'].includes(k)))
            throw new AppError('Void the approved adjustment and submit the corrected request for a new policy review.');
        if (changes.some(k => !completion.includes(k)) && !canApprove(v, a, staff))
            throw new ForbiddenError('Only an authorized Account Manager can correct the approved adjustment.');
        if (changes.some(k => !['details', 'approvalEvidenceId', 'releaseDocumentsComplete', 'towbookRecorded'].includes(k)) && !next.correctionReason)
            throw new AppError('Add a correction reason before saving changes to this imported or completed release.');
    }
    if (['Declined', 'Voided'].includes(String(old?.status)))
        throw new AppError('This entry is closed.');
    if (action === 'submitRelease') {
        if (!['Draft', 'Pending review'].includes(String(next.status)))
            throw new AppError('Only a draft can be submitted.');
        if (!next.vin && !next.plate)
            throw new AppError('Enter a VIN or license plate so this release can be found in vehicle history.');
        next.status = 'Pending review';
    }
    if (['approveRelease', 'declineRelease', 'voidRelease'].includes(action)) {
        if (!canApprove(v, a, staff))
            throw new ForbiddenError('This decision belongs to the assigned Account Manager or Department Head.');
        if (action !== 'voidRelease' && old?.status !== 'Pending review')
            throw new AppError('Only pending requests can be approved or declined.');
        if (action === 'voidRelease' && !next.correctionReason)
            throw new AppError('Record the reason for voiding.');
    }
    if (action === 'approveRelease') {
        if (!next.managerAffiliationId && !next.managerUnknownReason)
            throw new AppError('Link the manager tenure or record why it is unknown.');
        if (typeof next.originalCharges !== 'number' || typeof next.amountCharged !== 'number')
            throw new AppError('Enter original charges and final charges.');
        if(next.releaseType==='Full courtesy'&&next.amountCharged!==0)throw new AppError('A full courtesy release must have zero final charges. Choose Reduced charge for a partial reduction.');
        if (!next.historyReviewed)
            throw new AppError('Review the property and person’s prior releases.');
        if (['Property staff vehicle', 'Staff non-business visit', 'New move-in registration failure'].includes(String(next.category)) && !next.subjectContactId)
            throw new AppError('Link the resident or employee to check repeat occurrences.');
        if (next.category === 'Leasing office clerical error' && !next.errorType)
            throw new AppError('Choose the clerical error type.');
        if (['Leasing office clerical error', 'New move-in registration failure', 'Account preservation'].includes(String(next.category)) && !next.requestEvidenceId)
            throw new AppError('Attach the property manager’s request email.');
        if (['Leasing office clerical error', 'New move-in registration failure'].includes(String(next.category)) && !next.responsibilityAcknowledged)
            throw new AppError('Confirm the property accepted responsibility in writing.');
        if (next.afterHours && (!next.dispatchReplyRecorded || !next.supportForwardRecorded || !next.assignedAmCopied || !next.requestEvidenceId))
            throw new AppError('Complete the after-hours email routing.');
        if (next.category === 'Unclassified')
            throw new AppError('Classify the release.');
        if (next.category === 'Resident / visitor error' && Number(next.amountWaived) > 0)
            throw new AppError('Classify this exception as Account preservation.');
        const result = assessment(next, all), exceeds = result.maxPercent !== undefined && Number(next.amountWaived) > Math.round(next.originalCharges * result.maxPercent) / 100 + .005;
        if ((exceeds || result.unknown) && (!head(v, staff) || !next.exceptionReason))
            throw new AppError('The Department Head must document an exception for amounts beyond policy or incomplete prior history.');
        if (next.category === 'Account preservation' && !next.requestedByContactId && !next.managerAffiliationId)
            throw new AppError('Identify the manager requesting account preservation.');
        next.status = 'Approved';
        next.approvedBy = v.name;
        next.approvedById = v.person;
        next.approvedAt = new Date().toISOString();
        next.policyOccurrence = result.occurrence;
    }
    if (action === 'declineRelease') {
        next.status = 'Declined';
        next.approvedBy = v.name;
    }
    if (action === 'voidRelease') {
        next.status = 'Voided';
        next.voidedBy = v.name;
    }
    if (next.returnTransportation === 'Free return' && next.category !== 'Towing company error')
        throw new AppError('Free return is limited to a towing company error.');
    if (next.returnTransportation === 'Inoperable vehicle' && (!next.transportReason || !next.transportDecision))
        throw new AppError('Record the transportation circumstances and decision.');
    if (action === 'completeRelease') {
        if (old?.status !== 'Approved')
            throw new AppError('Only an approved request can be released.');
        if (!next.approvalEvidenceId || !next.releaseDocumentsComplete || !next.towbookRecorded || !next.towbookReference)
            throw new AppError('Attach approval and complete the release documents and Towbook reference.');
        next.status = 'Released';
        next.releasedBy = v.name;
        next.releasedAt = new Date().toISOString();
    }
    return { next, account: a, serialize: ['approveRelease', 'voidRelease'].includes(action) || old?.status === 'Imported' };
}
