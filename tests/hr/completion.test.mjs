import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedTaskEvidence,preserveTaskVerification,orientationComplete,payTermsComplete,checkPaymentComplete,offboardingCompletionEvidence,recordBenefitConfirmation} from '../../lib/hr/completion.ts';
import {validateSave} from '../../lib/hr/workflow.ts';

const employee={id:'employee',kind:'person',version:4,name:'Employee',department:'Dispatch',supervisor:'manager',workerType:'Employee',employmentClass:'Full-Time',status:'Onboarding',payType:'Hourly',rate:20,date:'2026-10-01',exempt:false};
const manager={id:'manager',kind:'person',version:1,name:'Manager',department:'Dispatch',status:'Active'};
const finance=[employee,manager];
const record=(kind,data={},id=kind,personId='employee')=>({id,kind,personId,version:1,data,createdAt:'2026-10-01T12:00:00Z',createdBy:'Manager',updatedAt:'2026-10-01T12:00:00Z',updatedBy:'Manager'});
const onboarding=record('onboarding',{paymentMethod:'Check'});
const benefit=record('benefit',{employmentClass:'Full-Time',package:'Standard',effectiveDate:'2026-10-01'});
const viewer=(actions)=>({id:'manager-auth',person:'manager',name:'Manager',email:'manager@example.test',role:'Supervisor',department:'Dispatch',owner:false,canManage:false,canRelease:false,access:[{module:'People & HR',tab:'hiring',level:'Edit'}],hrResponsibilities:actions.map(action=>({action,scope:'Team'}))});
const hiring=viewer(['manageOnboarding']),payroll=viewer(['manageCompensation']),banker=viewer(['manageTaxBank']);
const orientationInput={key:'orientation',completedOn:'2026-10-01',trainerId:'manager',topics:['System Access','Yard Safety'],trainerAttested:true,acknowledgmentMethod:'In-Person Acknowledgment',employeeAcknowledged:true};
const payInput={key:'payTerms',personVersion:employee.version,benefitRecordId:benefit.id,agreementConfirmed:true};
const verify=(input,actor=hiring,records=[benefit],people=finance)=>verifiedTaskEvidence(onboarding,input,actor,people,records,'2026-10-02T12:00:00Z');

test('generic checklist saves cannot create or alter verification proof',()=>{
 assert.throws(()=>preserveTaskVerification(undefined,{status:'Verified'},'orientation'),/required review/);
 const actual=verify(orientationInput);
 const safe={key:'orientation',status:'Verified',label:'Access and Yard Safety Orientation'};
 assert.deepEqual(preserveTaskVerification(actual,safe,'orientation'),actual);
 assert.throws(()=>preserveTaskVerification(actual,{...safe,trainerId:'employee'},'orientation'),/record a new review/);
 const pending=preserveTaskVerification(actual,{status:'Pending',verifiedAt:'invented'},'orientation');
 assert.equal(pending.verifiedAt,undefined);
 assert.equal(orientationComplete(pending,'employee',[]),false);
});
test('orientation requires the recorded session and human acknowledgment',()=>{
 for(const change of [{completedOn:''},{completedOn:'2026-02-30'},{trainerId:'employee'},{trainerId:'missing'},{topics:['System Access']},{trainerAttested:false},{employeeAcknowledged:false}])assert.throws(()=>verify({...orientationInput,...change}));
 const actual=verify(orientationInput);
 assert.equal(actual.verifiedById,'manager-auth');
 assert.equal(actual.verifiedAt,'2026-10-02T12:00:00Z');
 assert.equal(actual.trainerName,'Manager');
 assert.equal(orientationComplete(actual,'employee',[]),true);
 assert.throws(()=>verify(orientationInput,banker),/not assigned/);
});
test('signed orientation evidence must be signed and belong to this employee',()=>{
 const input={...orientationInput,employeeAcknowledged:false,acknowledgmentMethod:'Signed Training Record',acknowledgmentDocumentId:'training'};
 const unsigned=record('document',{category:'Training Record',signatureStatus:'Not Verified'},'training');
 assert.throws(()=>verify(input,hiring,[unsigned]),/verify the signed/);
 const signed={...unsigned,data:{...unsigned.data,signatureStatus:'Wet Signature Verified'}};
 assert.throws(()=>verify(input,hiring,[{...signed,personId:'someone-else'}]),/verify the signed/);
 const actual=verify(input,hiring,[signed]);
 assert.equal(orientationComplete(actual,'employee',[signed]),true);
 assert.equal(orientationComplete(actual,'employee',[]),false);
});
test('pay review requires saved pay, FLSA, effective date and matching benefit assignment',()=>{
 assert.throws(()=>verify(payInput,hiring),/not assigned/);
 assert.throws(()=>verify({...payInput,personVersion:3},payroll),/changed/);
 for(const change of [{date:''},{rate:undefined},{exempt:undefined}])assert.throws(()=>verify(payInput,payroll,[benefit],[{...employee,...change},manager]));
 assert.throws(()=>verify(payInput,payroll,[]),/benefit assignment/);
 assert.throws(()=>verify({...payInput,agreementConfirmed:false},payroll),/confirm the approval/);
 const actual=verify(payInput,payroll);
 assert.equal(payTermsComplete(actual,employee,[benefit]),true);
 assert.equal(payTermsComplete(actual,{...employee,rate:21},[benefit]),false);
 assert.equal(payTermsComplete(actual,{...employee,title:'New Job Title',version:5},[benefit]),true);
 assert.equal(payTermsComplete(actual,employee,[{...benefit,version:2}]),false);
 const safe={...actual};delete safe.payAgreement;
 assert.deepEqual(preserveTaskVerification(actual,safe,'payTerms'),actual);
});
test('contractors do not require a company benefit record for pay review',()=>{
 const contractor={...employee,workerType:'Contractor',payType:'Per tow',rate:0,notes:'Agreed per-tow terms recorded'};
 const actual=verify({...payInput,benefitRecordId:''},payroll,[],[contractor,manager]);
 assert.equal(payTermsComplete(actual,contractor,[]),true);
});
test('check-payment review records actual delivery setup and cannot bypass bank review',()=>{
 const input={key:'payment',confirmCheckPayment:true,checkDelivery:'Employee Pickup'};
 const actual=verify(input,banker);
 assert.equal(checkPaymentComplete(actual),true);
 assert.equal(actual.payeeName,'Employee');
 assert.throws(()=>verify({...input,confirmCheckPayment:false},banker),/confirm/);
 assert.throws(()=>verify({...input,checkDelivery:''},banker),/delivery/);
 assert.throws(()=>verify({...input,checkDelivery:'Mail to Verified Address'},banker),/mailing address/);
 assert.equal(checkPaymentComplete(verify({...input,checkDelivery:'Mail to Verified Address',checkMailingAddress:'7511 Dee Gabriel Collins Rd, Austin, TX 78744'},banker)),true);
 assert.throws(()=>verifiedTaskEvidence({...onboarding,data:{paymentMethod:'Direct Deposit'}},input,banker,finance,[]),/Direct Deposit Setup/);
 assert.equal(checkPaymentComplete({status:'Verified'}),false);
});
test('supporting-record steps cannot be blanket marked verified',()=>{
 for(const key of ['i9','tax','drug','background','offer','jobDescription'])assert.throws(()=>verify({key},hiring),/supporting record/);
 assert.throws(()=>verify(orientationInput,{...hiring,onboardingOnly:true}),/not assigned/);
});

const former={...employee,status:'Former',endDate:'2026-10-01',accountStatus:'Disabled'};
const offboardingReviewer=viewer(['manageOffboarding']);
const offboardingInput={status:'Complete',reason:'Contract End',separationDate:'2026-10-01',rehireEligibility:'Yes',reviewDate:'2026-10-02',finalTimeThroughDate:'2026-10-01',finalTimeReviewNote:'Reviewed final approved timesheet through separation.',financeHandoffTo:'manager',financeHandoffDate:'2026-10-02',financeHandoffNote:'Final-pay review delivered to assigned payroll reviewer in person.',equipmentOutcome:'Returned or Accounted For',equipmentDetails:'Key and radio returned to supervisor.',facilityAccessOutcome:'Recovered or Deactivated',facilityAccessDetails:'Key returned; keypad access deactivated.',benefitNoticeOutcome:'Not Applicable',benefitNoticeDetails:'No active plan enrollment during employment.',completionAttested:true};
const offboarding=(data=offboardingInput,people=[former,manager])=>offboardingCompletionEvidence(data,people[0],offboardingReviewer,people,'2026-10-02T12:00:00Z');
test('offboarding completion checks real employment and access state, not old checkbox claims',()=>{
 const checkboxes={reason:'Contract End',separationDate:'2026-10-01',rehireEligibility:'Yes',status:'Complete',finalTimeReviewed:true,financeNotified:true,accessRemoved:true,equipmentReturned:true,benefitNotices:true,recordsPreserved:true};
 assert.throws(()=>offboarding(checkboxes),/actual/);
 assert.throws(()=>offboarding(offboardingInput,[{...former,status:'Active'},manager]),/Former/);
 assert.throws(()=>offboarding(offboardingInput,[{...former,endDate:'2026-10-03'},manager]),/separation date/);
 assert.throws(()=>offboarding(offboardingInput,[{...former,accountStatus:'Enabled'},manager]),/Admin must disable/);
 assert.throws(()=>offboarding({...offboardingInput,financeHandoffTo:'missing'}),/received the final-pay/);
 assert.throws(()=>offboarding({...offboardingInput,equipmentDetails:''}),/equipment details/);
 const actual=offboarding();
 assert.equal(actual.completedById,'manager-auth');
 assert.equal(actual.completedAt,'2026-10-02T12:00:00Z');
 assert.equal(actual.reviewedAccountStatus,'Disabled');
 assert.equal(actual.financeHandoffRecipientName,'Manager');
});
test('offboarding keeps open work and unreviewed final time unresolved',()=>{
 const time={id:'time1',kind:'time',version:1,person:'employee',date:'2026-10-01',status:'Draft'};
 assert.throws(()=>offboarding(offboardingInput,[former,manager,time]),/final time/);
 assert.throws(()=>offboarding(offboardingInput,[former,manager,{id:'clock',kind:'clock',version:1,person:'employee',status:'Running'}]),/open timeclock/);
 assert.throws(()=>offboarding(offboardingInput,[former,manager,{...time,kind:'timeCorrection',status:'Requested'}]),/time corrections/);
 const actual=offboarding(offboardingInput,[former,manager,{...time,status:'Approved'}]);
 assert.deepEqual(actual.reviewedTimeRecords,[{id:'time1',version:1,date:'2026-10-01',status:'Approved'}]);
 const released={id:'payrun',kind:'payrun',version:1,status:'Released',period:'2026-09-28',periodEnd:'2026-10-04',lines:[{person:'employee'}]};
 assert.equal(offboarding(offboardingInput,[former,manager,time,released]).reviewedTimeRecordCount,0);
});
test('offboarding save stores review proof and completed record cannot be rewritten',()=>{
 const next=record('offboarding',{...offboardingInput,completedBy:'forged',accessRemoved:true});
 validateSave(undefined,next,offboardingReviewer,[former,manager],[]);
 assert.equal(next.data.completedBy,'Manager');
 assert.equal(next.data.accessRemoved,undefined);
 assert.throws(()=>validateSave(next,{...next,version:2,data:{...next.data,reason:'changed'}},offboardingReviewer,[former,manager],[next]),/preserved/);
 const draft=record('offboarding',{...offboardingInput,status:'In Progress',completedBy:'forged',accessRemoved:true});
 validateSave(undefined,draft,offboardingReviewer,[former,manager],[]);
 assert.equal(draft.data.completedBy,undefined);
 assert.equal(draft.data.accessRemoved,undefined);
});
test('recorded benefit elections do not pretend to update payroll or confirm carrier enrollment',()=>{
 assert.throws(()=>recordBenefitConfirmation({healthStatus:'Enrolled'},hiring),/health plan/);
 assert.throws(()=>recordBenefitConfirmation({retirementStatus:'Enrolled'},hiring),/retirement plan/);
 const data={healthStatus:'Enrolled',healthEnrollmentConfirmedOn:'2026-10-01',healthEnrollmentReference:'Carrier portal confirmation 123',payrollLinkStatus:'Linked',accrualLinkStatus:'Linked',healthEnrollmentConfirmedBy:'forged'};
 recordBenefitConfirmation(data,hiring,'2026-10-02T12:00:00Z');
 assert.equal(data.status,'Recorded');assert.equal(data.payrollLinkStatus,'Not Linked');assert.equal(data.accrualLinkStatus,'Not Linked');
 assert.equal(data.healthEnrollmentConfirmedBy,'Manager');assert.equal(data.healthEnrollmentConfirmedAt,'2026-10-02T12:00:00Z');
});
