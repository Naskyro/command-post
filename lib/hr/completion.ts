import type { FinRecord, Viewer } from '../finance/model';
import { today } from '../finance/model.ts';
import { AppError, ForbiddenError, ConflictError } from '../shared/errors.ts';
import type { HrRecord } from './model';
import { hrCan } from './permissions.ts';
import {onboardingStepsFor} from './model.ts';

export const orientationTopics = ['System Access', 'Yard Safety'] as const;
const payKeys = ['payComponents','workerType', 'employmentClass', 'payType', 'rate', 'netTarget', 'exempt', 'overtimeEstimateRate', 'date', 'notes'];
export function payAgreementSnapshot(person: FinRecord) {
  return Object.fromEntries(payKeys.map(key => [key, person[key] ?? null]));
}
function validDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
function approvedSignature(document: HrRecord | undefined) {
  return !!document && ['Signed', 'Wet Signature Verified'].includes(String(document.data.signatureStatus));
}
function payAgreementIssue(person: FinRecord) {
  if (!person.version || !person.payType || person.payType === 'Pending method') return 'Save the employee’s pay agreement first.';
  if (!validDate(person.date)) return 'Save the pay agreement’s effective date.';
  if (typeof person.rate !== 'number' || !Number.isFinite(person.rate) || person.rate < 0) return 'Save the agreed pay amount.';
  if (!person.rate && !(Array.isArray(person.payComponents)&&person.payComponents.length) && !String(person.notes || '').trim()) return 'Record the commission or other pay terms when there is no base pay amount.';
  if (typeof person.exempt !== 'boolean' && person.workerType === 'Employee') return 'Confirm the employee’s FLSA exemption status in the pay agreement.';
  return '';
}
function benefitIssue(person: FinRecord, record: HrRecord | undefined) {
  if (person.workerType !== 'Employee') return '';
  if(record?.data.requestedById&&record.data.status!=='Approved')return 'The benefit change is awaiting approval or was rejected.';
  if (!record || record.kind !== 'benefit' || record.personId !== person.id) return 'Save and select this employee’s benefit assignment.';
  if (!validDate(record.data.effectiveDate) || record.data.employmentClass !== person.employmentClass) return 'Update the benefit assignment to the employee’s current employment class and effective date.';
  if (person.employmentClass === 'Full-Time' && !String(record.data.package || '').trim()) return 'Select the employee’s benefit package.';
  return '';
}

/** Records the actual employer review/session, not an arbitrary completion status. */
export function verifiedTaskEvidence(record: HrRecord, input: Record<string, unknown>, viewer: Viewer, finance: FinRecord[], hr: HrRecord[], at = new Date().toISOString()) {
  const person = finance.find(p => p.kind === 'person' && p.id === record.personId);
  if (!person) throw new AppError('Employee not found.');
  const key = String(input.key || '');
  const permission = key === 'payTerms' ? 'manageCompensation' : key === 'payment' ? 'manageTaxBank' : 'manageOnboarding';
  if (!['orientation', 'payTerms', 'payment','driverInsurance'].includes(key)) throw new AppError('Complete and verify the supporting record. Its status updates this checklist automatically.');
  if (viewer.onboardingOnly || !hrCan(viewer, permission, person.id, finance)) throw new ForbiddenError('This review responsibility is not assigned to you.');
  const base = { status: 'Verified', verifiedAt: at, verifiedBy: viewer.name, verifiedById: viewer.id };
  if(key==='driverInsurance'){
    if(viewer.person===person.id)throw new ForbiddenError('A supervisor must verify driver insurance. Employees cannot approve their own coverage.');
    if(!onboardingStepsFor(person,record.data,finance).some(step=>step.key===key))throw new AppError('Driver insurance verification is not assigned to this onboarding.');
    const field=(name:string,max:number)=>{const raw=input[name];if(typeof raw!=='string'||!raw.trim()||raw.trim().length>max||/[\u0000-\u001f]/.test(raw))throw new AppError('Complete the insurer, policy number, and confirmation reference.');return raw.trim();};
    const insuranceCarrier=field('insuranceCarrier',180),insurancePolicyNumber=field('insurancePolicyNumber',120),insuranceConfirmationReference=field('insuranceConfirmationReference',600);
    if(!validDate(input.insuranceEffectiveDate)||String(input.insuranceEffectiveDate)>today())throw new AppError('Enter the actual coverage effective date. Coverage must be effective before start approval.');
    if(!validDate(input.insuranceConfirmedOn)||String(input.insuranceConfirmedOn)>today())throw new AppError('Enter the date the insurer or agent confirmed the driver was added.');
    if(input.insuranceConfirmed!==true)throw new AppError('Confirm that the insurer or agent has added this driver to the policy.');
    const doc=input.insuranceDocumentId?hr.find(row=>row.id===input.insuranceDocumentId&&row.kind==='document'&&row.personId===person.id&&row.data.category==='Driver Insurance Confirmation'&&!row.data.deletedAt):undefined;
    if(input.insuranceDocumentId&&!doc)throw new AppError('Choose this driver’s saved insurance confirmation document.');
    return {key,...base,insuranceCarrier,insurancePolicyNumber,insuranceEffectiveDate:input.insuranceEffectiveDate,insuranceConfirmedOn:input.insuranceConfirmedOn,insuranceConfirmationReference,insuranceConfirmed:true,...(doc?{insuranceDocumentId:doc.id,insuranceDocumentHash:doc.data.sha256}:{}),driverPersonId:person.id};
  }
  if (key === 'orientation') {
    if (!validDate(input.completedOn) || String(input.completedOn) > today()) throw new AppError('Enter the date the orientation actually took place.');
    const trainer = finance.find(p => p.kind === 'person' && p.id === input.trainerId && p.status === 'Active' && p.id !== person.id);
    if (!trainer) throw new AppError('Select the active employee who conducted the orientation.');
    const topics = Array.isArray(input.topics) ? [...new Set(input.topics.map(String))] : [];
    if (!orientationTopics.every(topic => topics.includes(topic)) || topics.some(topic => !orientationTopics.includes(topic as typeof orientationTopics[number]))) throw new AppError('Record both system-access and yard-safety instruction.');
    if (input.trainerAttested !== true) throw new AppError('Confirm that the named trainer completed this session.');
    if (input.acknowledgmentMethod === 'In-Person Acknowledgment') {
      if (input.employeeAcknowledged !== true) throw new AppError('Record the employee’s acknowledgment of the completed orientation.');
    } else if (input.acknowledgmentMethod === 'Signed Training Record') {
      const document = hr.find(r => r.id === input.acknowledgmentDocumentId && r.kind === 'document' && r.personId === person.id && ['Training Record', 'Policy Acknowledgment'].includes(String(r.data.category)));
      if (!approvedSignature(document)) throw new AppError('Upload and verify the signed training record or policy acknowledgment.');
    } else throw new AppError('Choose how the employee acknowledged the orientation.');
    return { key, ...base, completedOn: input.completedOn, trainerId: trainer.id, trainerName: String(trainer.name), topics, trainerAttested: true, employeeAcknowledged: input.employeeAcknowledged === true, acknowledgmentMethod: input.acknowledgmentMethod, acknowledgmentDocumentId: input.acknowledgmentMethod === 'Signed Training Record' ? String(input.acknowledgmentDocumentId) : '', notes: String(input.notes || '').trim() };
  }
  if (key === 'payTerms') {
    if (Number(input.personVersion) !== person.version) throw new ConflictError('The employee’s pay agreement changed. Refresh it before approving.');
    const issue = payAgreementIssue(person); if (issue) throw new AppError(issue);
    const benefit = hr.find(r => r.id === input.benefitRecordId && r.kind === 'benefit' && r.personId === person.id);
    const missing = benefitIssue(person, benefit); if (missing) throw new AppError(missing);
    if (input.agreementConfirmed !== true) throw new AppError('Review the saved pay and benefit terms and confirm the approval.');
    return { key, ...base, agreementConfirmed: true, payAgreement: payAgreementSnapshot(person), personVersion: person.version, benefitRecordId: benefit?.id || '', benefitRecordVersion: benefit?.version || 0 };
  }
  if (record.data.paymentMethod !== 'Check' || input.confirmCheckPayment !== true) throw new AppError('Use Direct Deposit Setup or confirm the saved check-payment arrangement.');
  if (!['Employee Pickup', 'Mail to Verified Address'].includes(String(input.checkDelivery))) throw new AppError('Choose the agreed check-delivery method.');
  if (input.checkDelivery === 'Mail to Verified Address' && !String(input.checkMailingAddress || '').trim()) throw new AppError('Record the employee’s verified mailing address for check delivery.');
  return { key, ...base, paymentMethod: 'Check', confirmCheckPayment: true, checkDelivery: input.checkDelivery, checkMailingAddress: input.checkDelivery === 'Mail to Verified Address' ? String(input.checkMailingAddress).trim() : '', payeeName: String(person.name) };
}

export function orientationComplete(task: Record<string, unknown> | undefined, personId: string, hr: HrRecord[]) {
  const topics = Array.isArray(task?.topics) ? task.topics : [];
  if (!task || task.status !== 'Verified' || !task.verifiedAt || !task.verifiedById || !validDate(task.completedOn) || !task.trainerId || task.trainerId === personId || task.trainerAttested !== true || !orientationTopics.every(topic => topics.includes(topic))) return false;
  if (task.acknowledgmentMethod === 'In-Person Acknowledgment') return task.employeeAcknowledged === true;
  if (task.acknowledgmentMethod === 'Signed Training Record') return approvedSignature(hr.find(r => r.id === task.acknowledgmentDocumentId && r.kind === 'document' && r.personId === personId && ['Training Record', 'Policy Acknowledgment'].includes(String(r.data.category))));
  return false;
}
export function payTermsComplete(task: Record<string, unknown> | undefined, person: FinRecord, hr: HrRecord[]) {
  if (!task || task.status !== 'Verified' || !task.verifiedAt || !task.verifiedById || task.agreementConfirmed !== true || payAgreementIssue(person) || JSON.stringify(task.payAgreement) !== JSON.stringify(payAgreementSnapshot(person))) return false;
  const benefit = hr.find(r => r.id === task.benefitRecordId);
  return !benefitIssue(person, benefit) && (person.workerType !== 'Employee' || benefit?.version === task.benefitRecordVersion);
}
export function checkPaymentComplete(task: Record<string, unknown> | undefined) {
  return !!task && task.status === 'Verified' && !!task.verifiedAt && !!task.verifiedById && task.paymentMethod === 'Check' && task.confirmCheckPayment === true && (task.checkDelivery === 'Employee Pickup' || task.checkDelivery === 'Mail to Verified Address' && !!String(task.checkMailingAddress || '').trim());
}

export function driverInsuranceComplete(task:Record<string,unknown>|undefined,personId:string,records:HrRecord[]){
 if(!task||task.status!=='Verified'||!task.verifiedAt||!task.verifiedById||task.driverPersonId!==personId||task.insuranceConfirmed!==true||!['insuranceCarrier','insurancePolicyNumber','insuranceConfirmationReference'].every(key=>typeof task[key]==='string'&&String(task[key]).trim()))return false;
 if(!validDate(task.insuranceEffectiveDate)||String(task.insuranceEffectiveDate)>today()||!validDate(task.insuranceConfirmedOn)||String(task.insuranceConfirmedOn)>today())return false;
 return !task.insuranceDocumentId||records.some(row=>row.id===task.insuranceDocumentId&&row.kind==='document'&&row.personId===personId&&row.data.category==='Driver Insurance Confirmation'&&!row.data.deletedAt&&row.data.sha256===task.insuranceDocumentHash);
}

/** Generic edits may submit documents, but cannot invent or alter employer approval proof. */
export function preserveTaskVerification(prior: Record<string, unknown> | undefined, input: Record<string, unknown>, key: string) {
  const status = String(input.status || 'Pending');
  if (!['Pending', 'Submitted', 'Verified'].includes(status)) throw new AppError('Choose a valid task status.');
  if (status === 'Verified' && prior?.status !== 'Verified') throw new AppError('Open the task and complete its required review instead of marking it verified.');
  if (prior?.status === 'Verified' && status === 'Verified') {
    // Read-only API projections omit confidential approval evidence. Keep the
    // original evidence server-side; client omissions cannot erase it and client
    // changes cannot replace it. Labels and display metadata are not evidence.
    const evidenceFields = ['documentId','notes','verifiedAt','verifiedBy','verifiedById','completedOn','trainerId','trainerName','topics','trainerAttested','employeeAcknowledged','acknowledgmentMethod','acknowledgmentDocumentId','agreementConfirmed','payAgreement','personVersion','benefitRecordId','benefitRecordVersion','paymentMethod','confirmCheckPayment','checkDelivery','checkMailingAddress','payeeName','insuranceCarrier','insurancePolicyNumber','insuranceEffectiveDate','insuranceConfirmedOn','insuranceConfirmationReference','insuranceConfirmed','insuranceDocumentId','insuranceDocumentHash','driverPersonId'];
    if (evidenceFields.some(field => Object.hasOwn(input, field) && JSON.stringify(input[field]) !== JSON.stringify(prior[field]))) throw new AppError('A recorded review cannot be edited from the checklist. Open the task to record a new review.');
    return { ...prior, key };
  }
  return { key, status, documentId: typeof input.documentId === 'string' ? input.documentId : '', notes: String(input.notes || '') };
}

/** Records an offboarding review; it does not impersonate Admin, payroll or offline actions. */
export function offboardingCompletionEvidence(data: Record<string, unknown>, person: FinRecord, viewer: Viewer, finance: FinRecord[], at = new Date().toISOString()) {
  if (!hrCan(viewer, 'manageOffboarding', person.id, finance)) throw new ForbiddenError('Offboarding review is not assigned to you.');
  if (person.status !== 'Former' || person.endDate !== data.separationDate) throw new AppError('Update the employee’s employment status to Former and record this separation date in their profile first.');
  if (person.accountStatus !== 'Disabled') throw new AppError('An authorized Admin must disable this employee’s Command Post access before the offboarding review can close.');
  for (const field of ['reviewDate','finalTimeThroughDate','financeHandoffDate']) if (!validDate(data[field]) || String(data[field]) > today()) throw new AppError('Enter the actual '+field.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
  if (String(data.finalTimeThroughDate) < String(data.separationDate) || String(data.reviewDate) < String(data.separationDate)) throw new AppError('Review final worked time through the separation date before closing offboarding.');
  const handoff = finance.find(p => p.kind === 'person' && p.id === data.financeHandoffTo && p.status === 'Active');
  if (!handoff) throw new AppError('Select the active employee who received the final-pay handoff.');
  for (const field of ['finalTimeReviewNote','financeHandoffNote','equipmentDetails','facilityAccessDetails','benefitNoticeDetails']) if (!String(data[field] || '').trim()) throw new AppError('Record '+field.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
  if (!['Returned or Accounted For','None Assigned'].includes(String(data.equipmentOutcome))) throw new AppError('Record the equipment return or accounting outcome.');
  if (!['Recovered or Deactivated','None Issued'].includes(String(data.facilityAccessOutcome))) throw new AppError('Record how physical keys, codes and facility access were recovered or deactivated.');
  if (!['Delivered','Not Applicable'].includes(String(data.benefitNoticeOutcome))) throw new AppError('Record the benefit-notice delivery or why it does not apply.');
  if (data.completionAttested !== true) throw new AppError('Confirm that the documented reviews and offline handoffs actually occurred.');
  const released = finance.filter(r => r.kind === 'payrun' && r.status === 'Released' && Array.isArray(r.lines) && r.lines.some(line => line && typeof line === 'object' && line.person === person.id));
  const unpaidTime = finance.filter(r => r.kind === 'time' && r.person === person.id && String(r.date || '') <= String(data.separationDate) && !['Voided','Scheduled'].includes(String(r.status)) && !released.some(run => String(r.date) >= String(run.period) && String(r.date) <= String(run.periodEnd)));
  if (finance.some(r => r.kind === 'clock' && r.person === person.id && r.status === 'Running')) throw new AppError('Review and close the employee’s open timeclock entry before completing offboarding.');
  if (unpaidTime.some(r => r.status !== 'Approved')) throw new AppError('Approve the employee’s outstanding final time records in Timeclock before completing offboarding.');
  if (finance.some(r => r.kind === 'timeCorrection' && r.person === person.id && r.status === 'Requested' && String(r.date || '') <= String(data.separationDate))) throw new AppError('Resolve requested time corrections through the separation date first.');
  return {completedAt:at,completedBy:viewer.name,completedById:viewer.id,completionBasis:'Documented Review of System State and Offline Handoffs',financeHandoffRecipientName:String(handoff.name),reviewedPersonVersion:person.version,reviewedAccountStatus:person.accountStatus,reviewedEmploymentStatus:person.status,reviewedTimeRecords:unpaidTime.map(r=>({id:r.id,version:r.version,date:r.date,status:r.status})),reviewedTimeRecordCount:unpaidTime.length};
}

/** Benefits elections are HR records; payroll/accrual and carrier changes remain separate actions. */
export function recordBenefitConfirmation(data: Record<string, unknown>, viewer: Viewer, at = new Date().toISOString()) {
  data.recordType = 'Recorded Benefit Assignment';
  data.status = 'Recorded';
  data.payrollLinkStatus = 'Not Linked';
  data.accrualLinkStatus = 'Not Linked';
  for (const plan of ['health','retirement']) {
    const enrolled = data[plan === 'health' ? 'healthStatus' : 'retirementStatus'] === 'Enrolled';
    for (const field of ['ConfirmedAt','ConfirmedBy','ConfirmedById']) delete data[plan+'Enrollment'+field];
    if (enrolled) {
      if (!validDate(data[plan+'EnrollmentConfirmedOn']) || String(data[plan+'EnrollmentConfirmedOn']) > today() || !String(data[plan+'EnrollmentReference'] || '').trim()) throw new AppError('Record the '+plan+' plan’s actual enrollment confirmation date and carrier/plan reference.');
      data[plan+'EnrollmentConfirmedAt'] = at;
      data[plan+'EnrollmentConfirmedBy'] = viewer.name;
      data[plan+'EnrollmentConfirmedById'] = viewer.id;
    }
  }
}
