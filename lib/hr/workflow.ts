import {assignmentAccess,claimAccess,outstandingAssignments} from './assignments.ts';
import type { FinRecord, Viewer } from '../finance/model';
import { AppError, ForbiddenError } from '../shared/errors.ts';
import { hrCan } from './permissions.ts';
import { onboardingStepsFor, sensitiveKinds, type HrKind, type HrRecord } from './model.ts';
import { canAccess } from '../finance/access.ts';
import { preserveTaskVerification, orientationComplete, payTermsComplete, checkPaymentComplete, driverInsuranceComplete, offboardingCompletionEvidence, recordBenefitConfirmation } from './completion.ts';
import {sanitizeBankData,validateBankFields,bankHasElectronicAuthorization,bankHasPaperAuthorization} from './banking.ts';
import {canReadReviewFile,ccrReviewCategory} from './review-document-access.ts';
import {isSeparationFollowUp} from './separation.ts';

export const actionForKind: Record<HrKind,string> = {inventory:'managePersonnel',assignment:'managePersonnel',assetClaim:'managePersonnel',onboarding:'manageOnboarding',note:'recordPerformance',corrective:'issueCorrective',position:'managePositions',policy:'managePolicies',task:'managePersonnel',benefit:'manageBenefits',offboarding:'manageOffboarding',i9:'verifyI9',w4:'manageTaxBank',w9:'manageTaxBank',bank:'manageTaxBank',screening:'reviewScreening',document:'managePersonnel',personal:'managePersonnel',education:'managePersonnel',vacancy:'manageOnboarding',candidate:'manageOnboarding'};
const taskAction=(r:HrRecord)=>r.data.category==='TWC'?'manageTwc':r.data.category==='Offboarding'?'manageOffboarding':'managePersonnel';
export const can = (v:Viewer,action:string,personId:string|undefined,records:FinRecord[]) => hrCan(v,action as Parameters<typeof hrCan>[1],personId,records);
export const canUseHr = (v:Viewer) => !!v.onboardingOnly||canAccess(v,'People & HR')||canAccess(v,'Finance','My pay')||canAccess(v,'Finance','Payroll');
export const selfService = (v:Viewer,kind:HrKind,category?:unknown) => !!v.onboardingOnly||canAccess(v,'People & HR')||canAccess(v,'Finance','My pay')&&(['w4','w9','bank'].includes(kind)||kind==='document'&&['Form W-4','Form W-9','Bank Authorization'].includes(String(category)));
const confidentialCategories = new Set(['Passport','Social Security Card',"Driver's License",'Background Check','Drug Screen','Form I-9','Form W-4','Form W-9','Bank Authorization']);
export function documentPermission(category:unknown) { return category==='Form I-9'?'verifyI9':['Form W-4','Form W-9','Bank Authorization'].includes(String(category))?'manageTaxBank':['Background Check','Drug Screen'].includes(String(category))?'reviewScreening':['Signed Corrective Action','Corrective Action','Evidence'].includes(String(category))?'issueCorrective':'managePersonnel'; }
export function canReadRecord(r:HrRecord,v:Viewer,finance:FinRecord[],hr:HrRecord[]) {
  if(r.kind==='document'&&r.data.category===ccrReviewCategory)return canReadReviewFile(r,v,finance,hr);
  if(r.kind==='inventory')return false;
  if(r.kind==='assetClaim')return claimAccess(v);
  if(r.kind==='assignment')return assignmentAccess(v,String(r.personId),finance)||v.person===r.personId;
  if(r.kind==='document'&&r.data.category==='Asset Evidence'){const parent=hr.find(x=>x.id===r.data.parentId);return !!parent&&(parent.kind==='assignment'&&(assignmentAccess(v,String(parent.personId),finance)||claimAccess(v)||v.person===parent.personId)||parent.kind==='assetClaim'&&(claimAccess(v)||assignmentAccess(v,String(parent.personId),finance)));}
  if(['personal','education','vacancy','candidate'].includes(r.kind))return false; // Read only through the scoped, audited personnel-details endpoint.
  if(r.kind==='document'&&r.data.category==='Profile Photo')return false; // Served only through the scoped photo endpoint.
  if(!canUseHr(v))return false;
  const own=r.personId===v.person&&selfService(v,r.kind,r.data.category);
  if (v.onboardingOnly && !own) return false;
  if (r.kind==='note') return !v.onboardingOnly && (!own||v.owner) && (can(v,'recordPerformance',r.personId,finance)||can(v,'manageTwc',r.personId,finance));
  if (r.kind==='corrective') return !v.onboardingOnly && (can(v,'issueCorrective',r.personId,finance)||(!own||v.owner)&&can(v,'manageTwc',r.personId,finance)||own&&r.data.employeeVisible===true);
  if (r.kind==='screening') return !v.onboardingOnly&&can(v,'reviewScreening',r.personId,finance);
  if (r.kind==='document') {
    if(r.data.category==='Driver Insurance Confirmation')return !v.onboardingOnly&&(v.owner||!own&&['managePersonnel','manageOnboarding','approveStart'].some(action=>can(v,action,r.personId,finance)));
    const parent=hr.find(x=>x.id===r.data.parentId);
    if(parent&&!canReadRecord(parent,v,finance,hr)&&!(r.data.category==='Job Description'&&parent.kind==='onboarding'&&r.personId===parent.personId&&(own||can(v,'viewPersonnel',r.personId,finance)||can(v,'managePersonnel',r.personId,finance)))) return false;
    if(['Background Check','Drug Screen'].includes(String(r.data.category))) return !v.onboardingOnly&&can(v,'reviewScreening',r.personId,finance);
    if(['Corrective Action','Signed Corrective Action','Evidence'].includes(String(r.data.category))) return !v.onboardingOnly&&(can(v,'issueCorrective',r.personId,finance)||(!own||v.owner)&&can(v,'manageTwc',r.personId,finance)||!!parent&&own&&parent.kind==='corrective'&&parent.data.employeeVisible===true&&r.data.category==='Signed Corrective Action'&&parent.data.signedDocumentId===r.id);
    return own||!v.onboardingOnly&&(can(v,documentPermission(r.data.category),r.personId,finance)||['Offer Letter','Job Description','Resume','Policy Acknowledgment','Training Record'].includes(String(r.data.category))&&can(v,'manageOnboarding',r.personId,finance)||['Offer Letter','Job Description'].includes(String(r.data.category))&&can(v,'approveStart',r.personId,finance)||!confidentialCategories.has(String(r.data.category))&&can(v,'viewPersonnel',r.personId,finance));
  }
  if(sensitiveKinds.has(r.kind)) return own||!v.onboardingOnly&&can(v,actionForKind[r.kind],r.personId,finance);
  if(['position','policy'].includes(r.kind)) return !v.onboardingOnly&&canAccess(v,'People & HR')&&(r.data.status==='Published'||r.data.status==='Active'||can(v,actionForKind[r.kind],r.personId,finance));
  if(r.kind==='onboarding') return own||!v.onboardingOnly&&['manageOnboarding','approveStart','manageCompensation','manageTaxBank'].some(a=>can(v,a,r.personId,finance));
  if(r.kind==='task') return own&&r.data.employeeVisible===true&&!['TWC','Offboarding'].includes(String(r.data.category))||!v.onboardingOnly&&can(v,taskAction(r),r.personId,finance);
  if(r.kind==='benefit'&&r.data.reviewerId===v.person&&can(v,'manageBenefits',r.personId,finance))return true;
  if(r.kind==='benefit')return !v.onboardingOnly&&(own||['manageBenefits','manageCompensation','approveStart','viewPersonnel'].some(a=>can(v,a,r.personId,finance)));
  if(r.kind==='offboarding') return !v.onboardingOnly&&(can(v,'manageOffboarding',r.personId,finance)||(!own||v.owner)&&can(v,'manageTwc',r.personId,finance));
  return !v.onboardingOnly&&(own||can(v,actionForKind[r.kind],r.personId,finance)||can(v,'viewPersonnel',r.personId,finance));
}
export function listRecord(r:HrRecord):HrRecord {
  if(sensitiveKinds.has(r.kind)) { const allowed=['status','formEdition','effectiveDate','reviewedAt','reviewedBy','firstDay','dueDate','result','backgroundStatus','drugStatus','followUpDate','owner','accountLast4','signedDocumentId']; return {...r,data:Object.fromEntries(allowed.filter(k=>r.data[k]!==undefined).map(k=>[k,r.data[k]]))}; }
  if(r.kind==='document') {const {storageKey:_s,encryption:_e,...data}=r.data;return {...r,data};}
  if(r.kind==='offboarding') {const {separationRequest:_request,...data}=r.data;return {...r,data};}
  if(r.kind==='onboarding') return {...r,data:{...r.data,tasks:taskList(r.data).map(task=>{const {payAgreement:_payAgreement,...safe}=task;return safe;})}};
  return r;
}
/** Banking delegates can review payment setup without receiving the offer or personnel notes. */
export function onboardingRecordView(r:HrRecord,v:Viewer,finance:FinRecord[]):HrRecord {
  const safe=listRecord(r);
  if(r.kind==='onboarding'&&!v.owner&&(r.personId===v.person||!['manageOnboarding','approveStart','managePersonnel'].some(action=>can(v,action,r.personId,finance))))safe.data={...safe.data,tasks:taskList(safe.data).map(task=>task.key!=='driverInsurance'?task:Object.fromEntries(['key','label','owner','required','status','verifiedAt','verifiedBy'].filter(key=>task[key]!==undefined).map(key=>[key,task[key]])))};
  if(r.kind!=='onboarding'||r.personId===v.person||['manageOnboarding','approveStart','manageCompensation'].some(action=>can(v,action,r.personId,finance)))return safe;
  const fields=['path','status','paymentMethod','readiness','clearedAt','clearedBy'];
  return {...safe,data:{...Object.fromEntries(fields.filter(field=>safe.data[field]!==undefined).map(field=>[field,safe.data[field]])),tasks:taskList(safe.data).filter(task=>task.key==='payment')}};
}
export function date(value:unknown,label:string,required=false) { if(!value&&!required)return; if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw new AppError('Enter a valid '+label+'.'); }
function requireText(data:Record<string,unknown>,keys:string[]) { for(const key of keys)if(!String(data[key]||'').trim())throw new AppError('Complete '+key.replace(/([A-Z])/g,' $1').toLowerCase()+'.'); }
function signedDocument(id:unknown,personId:string|undefined,category:string,records:HrRecord[]) { return records.find(r=>r.id===id&&r.kind==='document'&&r.personId===personId&&r.data.category===category); }
export function taskList(data:Record<string,unknown>):Record<string,unknown>[] {return Array.isArray(data.tasks)?data.tasks.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)) as Record<string,unknown>[]:[];}
export function validateSave(old:HrRecord|undefined,next:HrRecord,v:Viewer,finance:FinRecord[],hr:HrRecord[],issuedPrimary?:{id:string;code:string;title:string;version:number;revision?:string}) {
  if(['inventory','assignment','assetClaim'].includes(next.kind))throw new AppError('Use Company Assets & Access to update assignments or CCR to update claims.');
  if(['vacancy','candidate'].includes(next.kind))throw new AppError('Use Hiring & Onboarding to update openings and applicants.');
  if(next.kind==='education')throw new AppError('Use Education in the employee file to update a credential.');
  if(next.kind==='personal')throw new AppError('Use Personal Details in the employee file to update this information.');
  const catalog=['position','policy'].includes(next.kind);
  if(catalog&&next.personId)throw new AppError('Company catalogs cannot be attached to an employee.');
  const own=next.personId===v.person&&selfService(v,next.kind), privileged=can(v,next.kind==='task'?taskAction(next):actionForKind[next.kind],catalog?undefined:next.personId,finance), data=next.data;
  if(next.kind==='document')throw new AppError('Use the Upload File action.');
  if(v.onboardingOnly&&!own)throw new ForbiddenError();
  if(!privileged&&!(own&&['i9','w4','w9','bank'].includes(next.kind)))throw new ForbiddenError('This HR responsibility is not assigned to you.');
  if(v.onboardingOnly&&!['i9','w4','w9','bank'].includes(next.kind))throw new ForbiddenError('Complete your assigned onboarding steps first.');
  if(!['position','policy'].includes(next.kind)&&!finance.some(p=>p.kind==='person'&&p.id===next.personId))throw new AppError('Choose an existing employee.');
  if(old&&(old.kind!==next.kind||old.personId!==next.personId))throw new AppError('Records cannot be moved between employees or record types.');
  if(old&&(old.kind==='note'&&!canAccess(v,'Admin','users',true)||old.data.employeeVisible===true||old.data.status==='Verified'||old.data.status==='Cleared'||old.data.status==='Signed'||old.kind==='offboarding'&&(old.data.status==='Complete'||old.data.separationRecordedAt)))throw new AppError('This record is preserved. Add a new record or addendum instead of overwriting it.');
  if(next.kind==='offboarding'&&['separationRecordedAt','separationRecordedBy','separationRecordedById','separationRequest','accessDisabledAt','followUpTaskIds'].some(key=>Object.hasOwn(data,key)))throw new AppError('Use End Employment to record a separation and disable access.');
  for(const key of ['createdAt','createdBy','updatedAt','updatedBy','verifiedAt','verifiedBy','reviewedAt','reviewedBy','reviewedById','signedAt','signedBy','signature','signatureHash','clearedAt','clearedBy','readiness','sopClearance','sopSignatures'])delete data[key];
  if(next.kind==='note') {if(own&&!v.owner)throw new ForbiddenError('Use the employee response on an issued notice rather than creating a private management note about yourself.');requireText(data,['eventType','summary','eventDate']);date(data.eventDate,'conversation date',true);data.status='Recorded';data.employeeVisible=false;}
  if(next.kind==='corrective') {
    requireText(data,['action','reason']);
    if(issuedPrimary){
      data.policyReference=issuedPrimary.code;data.subject=issuedPrimary.title;
      data.policyVersion=issuedPrimary.revision||String(issuedPrimary.version);
      data.policySnapshot={id:issuedPrimary.id,title:issuedPrimary.title,version:data.policyVersion};
      delete data.policyEffectiveDate;
    }else if(old?.kind==='corrective'&&old.data.policyReference&&!((old.data.sopCitations as unknown[])?.length)&&(!data.policyReference||data.policyReference===old.data.policyReference)){
      // Preserve an existing pre-library record exactly. Never use this path to create a new reference.
      for(const k of ['subject','policyReference','policySnapshot','policyVersion','policyEffectiveDate']){
        if(old.data[k]===undefined)delete data[k];else data[k]=old.data[k];
      }
    }else throw new AppError('Select a published SOP for this corrective action.');
    date(data.issuedDate,'issue date');date(data.followUpDate,'follow-up date');
    if(!['Draft','Awaiting Signed Copy','Declined to Sign'].includes(String(data.status||'Draft')))throw new AppError('Choose Draft, Awaiting Signed Copy, or Declined to Sign.');
    data.status=data.status||'Draft';data.employeeVisible=false;
    if(data.status==='Declined to Sign') {requireText(data,['refusalReason']);data.refusalRecordedAt=new Date().toISOString();data.refusalRecordedBy=v.name;}
    if(data.responseStatus==='Disagrees'&&!data.employeeExplanation&&!data.disagreementReason)throw new AppError('Select a disagreement reason or record the employee’s explanation.');
    if(data.status!=='Draft')requireText(data,['expectedStandardImpact','expectations','consequence']);
  }
  if(next.kind==='position'||next.kind==='policy') {requireText(data,['title']);data.status=data.status||(next.kind==='position'?'Active':'Draft');if(!['Draft','Published','Active','Retired'].includes(String(data.status)))throw new AppError('Choose a valid catalog status.');}
  if(next.kind==='task') {
    if(old?.data.category==='TWC'&&data.category!=='TWC'&&hr.some(r=>r.kind==='document'&&r.data.category===ccrReviewCategory&&r.data.parentId===old.id&&!r.data.deletedAt))throw new AppError('This inquiry has protected TWC documents. Keep its original category.');
    if(old&&!can(v,taskAction(old),next.personId,finance))throw new ForbiddenError('Updating this task requires its existing responsibility as well as its new responsibility.');
    if(old&&isSeparationFollowUp(old,hr)){
      if(old.data.followUpType==='Equipment & Physical Access'&&['Complete','Completed','Closed'].includes(String(data.status))&&outstandingAssignments(String(next.personId),hr).length)throw new AppError('Resolve each assigned asset and software-access record before closing this follow-up.');
      for(const field of ['separationRecordId','followUpType','source','category'])if(data[field]!==old.data[field])throw new AppError('Keep this task linked to its original separation.');
    }else if(data.separationRecordId||data.source==='Recorded Separation')throw new AppError('Separation follow-ups are created by End Employment.');
    requireText(data,['title']);date(data.dueDate,'due date');data.status=data.status||'Pending';
    if(['TWC','Offboarding'].includes(String(data.category)))data.employeeVisible=false;
  }
  if(next.kind==='benefit') {if(data.overrideApproved||data.requestedById||data.custom)throw new AppError('Use Benefits & Leave to request a custom package and supervisor approval.');if(!['Full-Time','Part-Time','Temporary','Seasonal'].includes(String(data.employmentClass)))throw new AppError('Choose an employment class.');const person=finance.find(p=>p.kind==='person'&&p.id===next.personId);if(person?.employmentClass!==data.employmentClass)throw new AppError('Update the employee profile’s employment class first so payroll and benefits use the same classification.');if(data.employmentClass!=='Full-Time'){data.eligible=false;data.package='No Company Benefits';}else data.eligible=true;date(data.effectiveDate,'effective date',true);for(const k of ['healthEmployeeContribution','healthEmployerContribution','retirementEmployeePercent','retirementEmployerMatchPercent','overridePtoHours'])if(data[k]!==undefined&&(!Number.isFinite(Number(data[k]))||Number(data[k])<0))throw new AppError('Benefit amounts must be zero or greater.');if(data.overrideApproved===true)requireText(data,['overrideReason','overrideReference']);}
  if(next.kind==='benefit')recordBenefitConfirmation(data,v);
  if(next.kind==='offboarding') {
    requireText(data,['reason','separationDate','rehireEligibility']);date(data.separationDate,'separation date',true);
    if(!['Yes','No','Review Required'].includes(String(data.rehireEligibility)))throw new AppError('Choose rehire eligibility.');
    data.status=data.status||'In Progress';if(!['In Progress','Ready for Review','Complete'].includes(String(data.status)))throw new AppError('Choose a valid offboarding stage.');
    for(const field of ['finalTimeReviewed','financeNotified','accessRemoved','equipmentReturned','benefitNotices','recordsPreserved','completedAt','completedBy','completedById','completionBasis','financeHandoffRecipientName','reviewedPersonVersion','reviewedAccountStatus','reviewedEmploymentStatus','reviewedTimeRecords','reviewedTimeRecordCount'])delete data[field];
    if(data.status==='Complete'){if(outstandingAssignments(String(next.personId),hr).length)throw new AppError('Complete the itemized asset and software access closeout first.');const person=finance.find(p=>p.kind==='person'&&p.id===next.personId)!;Object.assign(data,offboardingCompletionEvidence(data,person,v,finance));}
  }
  if(sensitiveKinds.has(next.kind)) {
    if(!['Draft','Submitted','Verified'].includes(String(data.status||'Draft')))throw new AppError('Choose a valid review status.');
    data.status=data.status||'Draft';
    if(data.status==='Verified'&&!privileged)throw new ForbiddenError('Employer verification requires a separately assigned responsibility.');
    if(next.kind==='i9'&&data.status==='Verified') {if(own)throw new ForbiddenError('Another authorized person must complete employer I-9 verification.');if(data.physicalReviewConfirmed!==true)throw new AppError('Confirm physical examination of the original acceptable documents. E-Verify is not configured.');requireText(data,['firstDay','section1SignedAt','documentChoice']);date(data.firstDay,'first day',true);if(!['List A','Lists B and C'].includes(String(data.documentChoice)))throw new AppError('Record the employee’s acceptable document choice.');if(!signedDocument(data.signedDocumentId,next.personId,'Form I-9',hr))throw new AppError('Upload the completed signed Form I-9 before verification.');}
    if(['w4','w9'].includes(next.kind)&&data.status==='Verified') {if(!signedDocument(data.signedDocumentId,next.personId,next.kind==='w4'?'Form W-4':'Form W-9',hr))throw new AppError('Attach the signed official tax form before verifying the entered elections.');if(data.electionsMatchSignedForm!==true)throw new AppError('Confirm these entries match the signed tax form.');date(data.effectiveDate,'effective date',true);}
    if(next.kind==='w4') {if(data.filingStatus&&!['Single or Married Filing Separately','Married Filing Jointly','Head of Household'].includes(String(data.filingStatus)))throw new AppError('Choose a valid W-4 filing status.');for(const k of ['step3','step4a','step4b','step4c'])if(data[k]!==undefined&&(!Number.isFinite(Number(data[k]))||Number(data[k])<0))throw new AppError('W-4 amounts must be zero or greater.');}
    if(next.kind==='w4'&&data.status==='Verified')requireText(data,['formEdition','filingStatus']);
    if(next.kind==='w9'&&data.status==='Verified'){requireText(data,['legalName','taxClassification','taxpayerId']);if(!/^\d{9}$/.test(String(data.taxpayerId).replace(/-/g,'')))throw new AppError('Enter a valid nine-digit taxpayer identification number.');}
    if(next.kind==='screening'&&data.status==='Verified'){
      if(data.drugStatus==='Passed'&&!signedDocument(data.drugDocumentId,next.personId,'Drug Screen',hr))throw new AppError('Attach the drug-screen result before verifying a passed result.');
      if(data.backgroundStatus==='Cleared'&&!signedDocument(data.backgroundDocumentId||data.signedDocumentId,next.personId,'Background Check',hr))throw new AppError('Attach the background report before recording clearance.');
      if(data.backgroundStatus==='Pending'){requireText(data,['owner','followUpDate']);date(data.followUpDate,'background follow-up date',true);}
    }
    if(next.kind==='bank') {
      sanitizeBankData(old?.data,data);validateBankFields(data,data.status==='Verified'||data.status==='Submitted');
      date(data.effectiveDate,'effective date',data.status==='Verified');
      if(data.status==='Verified'&&!bankHasElectronicAuthorization(data,next.personId)&&!bankHasPaperAuthorization(data,next.personId,hr))throw new AppError('Employee authorization is required. Submit signed electronic instructions or upload and verify the signed bank authorization.');
    }
    if(data.status==='Verified'){data.reviewedAt=new Date().toISOString();data.reviewedBy=v.name;data.reviewedById=v.id;}
  }
  if(next.kind==='onboarding') {
    if(hr.some(r=>r.kind==='onboarding'&&r.personId===next.personId&&r.id!==next.id))throw new AppError('Open the existing onboarding record for this person.');
    data.path=data.path||'New Hire';if(!['New Hire','Assisted New Hire','Existing Employee'].includes(String(data.path)))throw new AppError('Choose an onboarding path.');
    data.status='In Progress';
    for(const field of ['offer','jobDescription']) {data[field+'UpdatedAt']=JSON.stringify(old?.data[field]||{})!==JSON.stringify(data[field]||{})?new Date().toISOString():old?.data[field+'UpdatedAt']||next.createdAt;}
    const before=taskList(old?.data||{}), tasks=taskList(data);
    const assignedJob=hr.find(r=>r.kind==='document'&&r.personId===next.personId&&r.data.jobDescriptionId&&r.data.jobDescriptionAssignedAt&&!r.data.assignmentSupersededBy);
    if(assignedJob){
      const pending=tasks.find(t=>t.key==='jobDescription');
      if(!old&&!pending?.documentId){
        if(pending)pending.documentId=assignedJob.id;else tasks.push({key:'jobDescription',documentId:assignedJob.id});
      }else if(pending?.documentId!==assignedJob.id)throw new AppError('Refresh this checklist and use the Job Description Library to replace the assigned version.');
      if(old&&JSON.stringify(data.jobDescription||{})!==JSON.stringify(old.data.jobDescription||{}))throw new AppError('Use the Job Description Library to revise issued responsibilities.');
      data.jobDescriptionUpdatedAt=assignedJob.createdAt;
      data.jobDescriptionDocumentId=assignedJob.id;
    }
    data.tasks=onboardingStepsFor(finance.find(person=>person.kind==='person'&&person.id===next.personId),old?.data||{},finance).map(def=>{const input=tasks.find(x=>x.key===def.key)||{},prior=before.find(x=>x.key===def.key);return {...def,...preserveTaskVerification(prior,input,def.key)};});
  }
}

export function readiness(record:HrRecord,person:FinRecord,records:HrRecord[],finance:FinRecord[]=[]) {
 const tasks=taskList(record.data), own=records.filter(r=>r.personId===person.id), issues:string[]=[];
 const screening=own.filter(r=>r.kind==='screening').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0];
 const verified=(kind:HrKind)=>own.some(r=>r.kind===kind&&r.data.status==='Verified');
 for(const step of onboardingStepsFor(person,record.data,finance)){
  const task=tasks.find(t=>t.key===step.key);let done=task?.status==='Verified';
  if(step.key==='offer'||step.key==='jobDescription') {const category=step.key==='offer'?'Offer Letter':'Job Description';const doc=own.find(r=>r.kind==='document'&&r.id===(task?.documentId||record.data[step.key+'DocumentId'])&&r.data.category===category);done=!!doc&&!doc.data.assignmentSupersededBy&&doc.createdAt>=String(record.data[step.key+'UpdatedAt']||'')&&['Signed','Wet Signature Verified'].includes(String(doc.data.signatureStatus));}
  if(step.key==='i9')done=person.workerType==='Contractor'||verified('i9');
  if(step.key==='tax')done=verified(person.workerType==='Contractor'?'w9':'w4');
  if(step.key==='payment')done=record.data.paymentMethod==='Check'?checkPaymentComplete(task):verified('bank');
  if(step.key==='payTerms')done=payTermsComplete(task,person,own);
  if(step.key==='orientation')done=orientationComplete(task,person.id,own);
  if(step.key==='driverInsurance')done=driverInsuranceComplete(task,person.id,own);
  if(step.key==='drug')done=!!screening&&screening.data.status==='Verified'&&screening.data.drugStatus==='Passed';
  if(step.key==='background')done=!!screening&&screening.data.status==='Verified'&&(screening.data.backgroundStatus==='Cleared'||!!(screening.data.backgroundStatus==='Pending'&&screening.data.owner&&screening.data.followUpDate));
  if(!done)issues.push(step.label);
 }
 return {ready:issues.length===0,issues};
}
