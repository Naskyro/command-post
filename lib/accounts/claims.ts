import type { Viewer, FinRecord } from '@/lib/finance/model';
import { canAccess } from '@/lib/finance/access';
import { AppError, ForbiddenError } from '@/lib/shared/errors';
import { assigned, head, clean, access } from './policy';
import { today, type Row } from './model';
export function settlementApprover(v: Viewer, staff: FinRecord[]) {
  if (v.owner) return true;
  if (!canAccess(v, 'Compliance, Claims & Recovery', 'damage', true)) return false;
  const person = staff.find(p => p.id === v.person && p.kind === 'person' && p.status === 'Active');
  const title = String(person?.title || '').toLowerCase();
  return !!person && (['chief operating officer', 'coo'].includes(title) || person.department === 'Operations' && ['director of operations', 'operations director'].includes(title));
}
export function prepareClaim(input: Row, old: Row | undefined, v: Viewer, all: Row[], staff: FinRecord[], action: string) {
  const a = all.find(a => a.kind === 'account' && a.id === (old?.accountId || input.accountId));
  if (!a || old && input.accountId !== old.accountId) throw new AppError('Choose the claim’s account.');
  const investigate = access(v, 'claims', true) && (head(v, staff) || assigned(v, a));
  const approve = settlementApprover(v, staff);
  if (!investigate && !approve) throw new ForbiddenError();
  const next = clean(input, old, v, all, staff, true);
  const approvalFields = ['reviewNotes','paidAmount','paidDate','paymentReference'];
  if (!investigate && Object.keys(next).some(k => !['version',...approvalFields].includes(k) && JSON.stringify(next[k]) !== JSON.stringify(old?.[k]))) throw new ForbiddenError('The assigned Account Manager maintains the investigation.');
  if (!approve && approvalFields.some(k => next[k] !== old?.[k])) throw new ForbiddenError('Settlement decisions and payment records require an authorized reviewer.');
  for(const key of ['requestedAmount','proposedSettlement','paidAmount']) if(typeof next[key]==='number' && Math.abs(Number(next[key])*100-Math.round(Number(next[key])*100))>0.00001)throw new AppError('Use at most two decimal places for money.');
  if (!next.vin && !next.plate) throw new AppError('Enter a VIN or license plate for vehicle history.');
  if (!next.assignee) next.assignee = a.assignee;
  if (!staff.some(p => p.id === next.assignee && p.status === 'Active' && p.department === 'Account Managers')) throw new AppError('Assign the investigation to active Account Management staff.');
  if (String(next.date) > today()) throw new AppError('A claim cannot be reported in the future.');
  for (const id of next.attachmentIds as string[] || []) if (!all.some(f => f.kind === 'file' && f.id === id && f.accountId === a.id && ['Claim evidence','Email attachment','Other'].includes(String(f.category)))) throw new AppError('Choose evidence from this account.');
  next.status = old?.status || 'Investigating';
  if (['Approved','Paid','Closed without settlement'].includes(String(old?.status))) {
    if (action !== 'payClaim') throw new AppError('This decision is locked. Record a new claim for a separate incident.');
  }
  if (action === 'submitClaim') {
    if (!investigate) throw new ForbiddenError();
    if (!next.investigation || !next.finding || next.finding === 'Undetermined' || !(next.attachmentIds as string[] || []).length || !next.propertyCommunication) throw new AppError('Complete the investigation, finding, evidence and property communication before review.');
    next.status = 'Pending review'; next.submittedBy = v.person; next.submittedAt = new Date().toISOString();
  } else if (['approveClaim','returnClaim','closeClaim'].includes(action)) {
    if (!approve || old?.status !== 'Pending review') throw new ForbiddenError('An authorized reviewer must review the submitted investigation.');
    // A settlement decision must approve the exact investigation that was submitted.
    if (Object.keys(next).some(k => !['version',...approvalFields].includes(k) && JSON.stringify(next[k]) !== JSON.stringify(old[k]))) throw new AppError('Save investigation changes and submit again before approval.');
    if (!next.reviewNotes) throw new AppError('Record the review decision and reason.');
    if (action === 'approveClaim' && typeof old.proposedSettlement !== 'number') throw new AppError('The Account Manager must propose a settlement amount.');
    next.status = action === 'approveClaim' ? 'Approved' : action === 'closeClaim' ? 'Closed without settlement' : 'Investigating';
    next.reviewedBy = v.name; next.reviewedById = v.person; next.reviewedAt = new Date().toISOString();
    if (action === 'approveClaim') next.approvedAmount = old.proposedSettlement;
  } else if (action === 'payClaim') {
    if (!approve || old?.status !== 'Approved') throw new ForbiddenError();
    if (Object.keys(next).some(k => !['version',...approvalFields].includes(k) && JSON.stringify(next[k]) !== JSON.stringify(old[k]))) throw new AppError('The approved investigation is locked.');
    if (typeof next.paidAmount !== 'number' || next.paidAmount > Number(old.approvedAmount) || !next.paidDate || String(next.paidDate) > today() || !next.paymentReference) throw new AppError('Record the actual payment, date and reference within the approved amount.');
    next.status = 'Paid'; next.paymentRecordedBy = v.person;
  } else if (action !== 'save') throw new AppError('Unknown claim action.');
  else if (old?.status === 'Pending review' && Object.keys(next).some(k => !['version',...approvalFields].includes(k) && JSON.stringify(next[k]) !== JSON.stringify(old[k]))) next.status = 'Investigating';
  return next;
}
