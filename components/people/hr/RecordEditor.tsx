'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Download,LockKeyhole} from 'lucide-react';
import type {FinRecord} from '@/lib/finance/model';
import {correctiveActions,disagreementReasons,performanceCategories,sensitiveKinds,type HrKind,type HrRecord} from '@/lib/hr/model';
import {requestJson} from '@/lib/shared/client';
import {generateHrPdf,generateDrugScreenPdf} from './documents';
import PublishedSopPicker,{sopRefs,isSopChoice,type SopChoice,type PrivateChoice} from './PublishedSopPicker';
import {Button,Field,Modal,UploadPanel,DocumentLink,text,type FieldSpec} from './ui';

export const kindTitles:Record<HrKind,string>={inventory:'Asset Inventory',assignment:'Company Asset / Access',assetClaim:'Asset Claim',vacancy:'Job Opening',candidate:'Candidate',personal:'Private Personnel Details',education:'Education',onboarding:'Onboarding',note:'Performance Note',corrective:'Corrective Action',position:'Position',policy:'Policy Reference',task:'HR Task',benefit:'Benefits & Eligibility',offboarding:'Offboarding',i9:'Form I-9 Verification',w4:'Form W-4 Elections',w9:'Form W-9 Information',bank:'Direct Deposit Setup',screening:'Screening Review',document:'Personnel Document'};
export const kindAction:Record<HrKind,string>={inventory:'managePersonnel',assignment:'managePersonnel',assetClaim:'managePersonnel',vacancy:'manageOnboarding',candidate:'manageOnboarding',personal:'managePersonnel',education:'managePersonnel',onboarding:'manageOnboarding',note:'recordPerformance',corrective:'issueCorrective',position:'managePositions',policy:'managePolicies',task:'managePersonnel',benefit:'manageBenefits',offboarding:'manageOffboarding',i9:'verifyI9',w4:'manageTaxBank',w9:'manageTaxBank',bank:'manageTaxBank',screening:'reviewScreening',document:'managePersonnel'};
export function freshRecord(kind:HrKind,personId:string|undefined,defaults:Record<string,unknown>={}):HrRecord{return{id:crypto.randomUUID(),kind,personId,version:0,data:{status:'Draft',...defaults},createdAt:'',createdBy:'',updatedAt:'',updatedBy:''};}
export const formCategory=(kind:HrKind)=>({i9:'Form I-9',w4:'Form W-4',w9:'Form W-9',bank:'Bank Authorization',corrective:'Signed Corrective Action',screening:'Background Check'} as Record<string,string>)[kind];

export default function RecordEditor({record,person,people,records,canVerify=false,onClose,onSaved}:{record:HrRecord;person?:FinRecord;people:FinRecord[];records:HrRecord[];canVerify?:boolean;onClose:()=>void;onSaved:(record:HrRecord)=>Promise<void>}){
 const [savedRecord,setSavedRecord]=useState(record),[saveNotice,setSaveNotice]=useState('');
 const [draft,setDraft]=useState<Record<string,unknown>>(()=>{const seed={...record.data,...(record.kind==='benefit'&&person?.employmentClass?{employmentClass:person.employmentClass}:{})};if(!record.version&&['note','corrective'].includes(record.kind)){for(const key of ['policyReference','policyVersion','policySnapshot','policyIds','sopCitations','employeePdfCitations','employeePolicySubject','subject'])delete (seed as Record<string,unknown>)[key];}return seed;}),[attachments,setAttachments]=useState(records.filter(r=>r.kind==='document'&&r.personId===record.personId)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [citationsChanged,markCitationsChanged]=useState(false);
 const [departments,setDepartments]=useState<FinRecord[]>([]);
 useEffect(()=>{if(record.kind==='position')void requestJson<{departments?:FinRecord[];records:FinRecord[]}>('/api/people?surface=hr').then(d=>setDepartments(d.departments||d.records.filter(r=>r.kind==='department'))).catch(e=>setError((e as Error).message));},[record.kind]);
 const set=(k:string,value:unknown)=>setDraft(d=>({...d,[k]:value}));
 function staffOptions(key:string,statuses:string[]){
  const choices=people.filter(p=>statuses.includes(text(p.status))).map(p=>({value:p.id,label:text(p.name)}));
  const previousId=record.version>0?text(record.data[key]):'';
  if(previousId&&!choices.some(choice=>choice.value===previousId)){
   const previous=people.find(p=>p.id===previousId);
   const label=previous?`${text(previous.name)} · ${previous.status==='Former'?(previous.workerType==='Contractor'?'Former Contractor':'Former Employee'):text(previous.status)||'Previous Staff'} · Historical Assignment`:'Previous Assignment · Historical';
   choices.push({value:previousId,label});
  }
  return choices.sort((a,b)=>a.label.localeCompare(b.label));
 }
 const docs=attachments.filter(d=>!formCategory(record.kind)||d.data.category===formCategory(record.kind)).map(r=>({value:r.id,label:text(r.data.name||r.data.fileName||r.data.filename||r.data.category)}));
 const states=canVerify?['Draft','Submitted','Verified']:['Draft','Submitted'];
 const fields:FieldSpec[]=record.kind==='note'?[
  {key:'eventType',label:'Record Type',required:true,options:['Coaching Conversation','Documented Verbal Warning','Schedule & Attendance','Employee Relations','Safety Concern','Promotion & Role Change','Recognition','Performance Review','PIP Follow-Up']},
  {key:'eventDate',label:'Conversation / Event Date',type:'date',required:true},
  {key:'category',label:'Category',options:performanceCategories},
  {key:'sopCitations',label:'Related SOPs'},
  {key:'summary',label:'What Happened / What Was Discussed',multiline:true,required:true},
  {key:'employeeResponse',label:'Employee Response',multiline:true},
  {key:'expectation',label:'Expectation or Agreed Next Step',multiline:true},
  {key:'followUpDate',label:'Follow-Up Date',type:'date'},
  {key:'relatedRecordId',label:'Related Earlier Record',options:records.filter(r=>r.personId===record.personId&&['note','corrective'].includes(r.kind)).map(r=>({value:r.id,label:text(r.data.subject||r.data.summary||r.data.eventType).slice(0,90)}))}
 ]:record.kind==='corrective'?[
  {key:'action',label:'Proposed Action',required:true,options:correctiveActions},
  {key:'status',label:'Record Stage',options:['Draft','Awaiting Signed Copy','Declined to Sign']},
  {key:'sopCitations',label:'Policies Cited'},
  {key:'category',label:'Review Category',options:['Category 1','Category 2','Category 3','Category 4']},
  {key:'issuedDate',label:'Date Issued',type:'date'},
  {key:'incidentAt',label:'Incident Date',type:'date'},
  {key:'issuer',label:'Issued By / Supervisor'},
  {key:'reason',label:'Reason for Warning',multiline:true,required:true},
  {key:'expectedStandardImpact',label:'Expected Standard and Impact',multiline:true},
  {key:'responseStatus',label:'Employee Response',options:['Not Yet Discussed','Acknowledges Receipt','Disagrees','Declined to Respond']},
  ...(draft.responseStatus==='Disagrees'?[{key:'disagreementReason',label:'Reason for Disagreement',options:disagreementReasons}]:[]),
  {key:'employeeExplanation',label:'Employee Explanation',multiline:true,hint:'Preserve the employee’s own explanation. Acknowledgment does not mean agreement.'},
  ...(draft.status==='Declined to Sign'||draft.responseStatus==='Declined to Respond'?[{key:'refusalReason',label:'Manager’s Record of Refusal',multiline:true,required:true},{key:'witness',label:'Witness, If Present'}]:[]),
  {key:'expectations',label:'Expectations Going Forward',multiline:true},
  {key:'support',label:'Support or Training to Be Provided',multiline:true},
  {key:'improvementDeadline',label:'Improvement Deadline',hint:'For example, “Immediately and Consistently” or a specific date.'},
  {key:'followUpDate',label:'Follow-Up Date',type:'date'},
  {key:'consequence',label:'Consequence if the Concern Continues',multiline:true},
  {key:'signedDocumentId',label:'Uploaded Signed Copy',options:docs}
 ]:record.kind==='task'?[
  {key:'title',label:'Task',required:true},{key:'category',label:'Category',options:['Benefits','Credentials','Missing Records','Offboarding','Onboarding','Payroll','Personnel','TWC','Training','Other']},
  {key:'assignee',label:'Assigned To',options:staffOptions('assignee',['Active','Onboarding','Leave'])},{key:'dueDate',label:'Due Date',type:'date'},
  {key:'status',label:'Status',options:['Pending','In Progress','Waiting on Employee','Waiting on Company','Complete','Cancelled']},
  {key:'notes',label:'What Needs to Be Done',multiline:true},{key:'employeeVisible',label:'Show This Task to the Employee',type:'checkbox'}
 ]:record.kind==='position'?[
  {key:'title',label:'Position Title',required:true},{key:'department',label:'Department',options:[...new Set([...departments.filter(d=>d.status!=='Retired').map(d=>text(d.name)),text(draft.department)].filter(Boolean))].sort()},
  {key:'status',label:'Status',options:['Active','Draft','Retired']},{key:'reportsTo',label:'Reports To',options:staffOptions('reportsTo',['Active'])},
  {key:'flsaStatus',label:'Approved FLSA Classification',options:['Nonexempt','Exempt','Pending Review']},
  {key:'summary',label:'Position Summary',multiline:true},{key:'essentialFunctions',label:'Essential Functions',multiline:true},
  {key:'qualifications',label:'Required Qualifications',multiline:true},{key:'authorityLimits',label:'Authority and Limits',multiline:true}
 ]:record.kind==='policy'?[
  {key:'title',label:'Policy Title',required:true},{key:'reference',label:'Policy Reference / SOP ID'},
  {key:'category',label:'Category',options:performanceCategories},{key:'version',label:'Version'},
  {key:'effectiveDate',label:'Effective Date',type:'date'},{key:'status',label:'Status',options:['Draft','Published','Retired']},
  {key:'text',label:'Approved Policy Text or Reference Notes',multiline:true}
 ]:record.kind==='benefit'?[

  {key:'effectiveDate',label:'Effective Date',type:'date',required:true},
  ...(draft.employmentClass==='Full-Time'?[
   {key:'package',label:'Benefit Package',options:['Standard Nonexempt','Standard Exempt','Approved Individual Package']},
   {key:'healthStatus',label:'Health Plan · Employer-Reported Status',options:['Not Yet Eligible','Eligible — Not Enrolled','Enrolled','Declined','Ended']},
   ...(draft.healthStatus==='Enrolled'?[{key:'healthEnrollmentReference',label:'Carrier Enrollment Confirmation Reference',required:true},{key:'healthEnrollmentConfirmedOn',label:'Carrier Confirmation Date',type:'date',required:true}]:[]),
   {key:'healthPlan',label:'Health Plan Name'},{key:'healthEmployeeContribution',label:'Employee Health Contribution per Pay Period ($)',type:'number'},
   {key:'healthEmployerContribution',label:'Employer Health Contribution per Pay Period ($)',type:'number'},
   {key:'retirementStatus',label:'Retirement Plan · Employer-Reported Status',options:['Not Yet Eligible','Eligible — Not Enrolled','Enrolled','Declined','Ended']},
   ...(draft.retirementStatus==='Enrolled'?[{key:'retirementEnrollmentReference',label:'Retirement Enrollment Confirmation Reference',required:true},{key:'retirementEnrollmentConfirmedOn',label:'Plan Confirmation Date',type:'date',required:true}]:[]),
   {key:'retirementEmployeePercent',label:'Employee Retirement Contribution (%)',type:'number'},{key:'retirementEmployerMatchPercent',label:'Employer Retirement Match (%)',type:'number'},

  ]:[]),
  {key:'notes',label:'Administration Notes',multiline:true}
 ]:record.kind==='offboarding'?[
  {key:'separationDate',label:'Separation Date',type:'date',required:true},{key:'separationType',label:'Separation Type',options:['Voluntary','Involuntary','Contract End','Other']},
  {key:'reason',label:'Reason for Separation',multiline:true,required:true},{key:'rehireEligibility',label:'Eligible for Rehire',required:true,options:['Yes','No','Review Required']},
  {key:'status',label:'Review Status',options:[{value:'In Progress',label:'In Progress'},{value:'Ready for Review',label:'Ready for Review'},{value:'Complete',label:'Completed Review'}]},
  {key:'assignedTo',label:'Offboarding Owner',options:staffOptions('assignedTo',['Active'])},
  ...(draft.status==='Complete'?[
   {key:'reviewDate',label:'Completion Review Date',type:'date',required:true},
   {key:'finalTimeThroughDate',label:'Final Time Reviewed Through',type:'date',required:true},
   {key:'finalTimeReviewNote',label:'Final Time Review Reference / Findings',multiline:true,required:true},
   {key:'financeHandoffTo',label:'Final Pay Handoff Recipient',options:staffOptions('financeHandoffTo',['Active']),required:true},
   {key:'financeHandoffDate',label:'Final Pay Handoff Date',type:'date',required:true},
   {key:'financeHandoffNote',label:'Final Pay Handoff Details / Reference',multiline:true,required:true},
   {key:'equipmentOutcome',label:'Equipment Review',options:['Returned or Accounted For','None Assigned'],required:true},
   {key:'equipmentDetails',label:'Equipment Returned, Accounted For, or Not Assigned',multiline:true,required:true},
   {key:'facilityAccessOutcome',label:'Facility Access Review',options:['Recovered or Deactivated','None Issued'],required:true},
   {key:'facilityAccessDetails',label:'Keys, Badges, Codes, and Facility Access Details',multiline:true,required:true},
   {key:'benefitNoticeOutcome',label:'Benefit Notices',options:['Delivered','Not Applicable'],required:true},
   {key:'benefitNoticeDetails',label:'Benefit Notice Delivery / Not Applicable Details',multiline:true,required:true},
   {key:'completionAttested',label:'I Completed This Review and Confirm These Details Are Accurate',type:'checkbox'}
  ]:[]),
  {key:'notes',label:'Open Items / Handoff',multiline:true}
 ]:record.kind==='i9'?[
  {key:'status',label:'Verification Status',options:states},{key:'formEdition',label:'Form Edition'},
  {key:'firstDay',label:'First Day of Employment',type:'date'},{key:'section1SignedAt',label:'Employee Section Signed On',type:'date'},
  {key:'documentChoice',label:'Employee’s Document Choice',options:['List A','Lists B and C']},
  ...(draft.documentChoice==='List A'?[{key:'listATitle',label:'List A Document Title'},{key:'listANumber',label:'List A Document Number'},{key:'listAExpiration',label:'List A Expiration, If Applicable',type:'date'}]:draft.documentChoice==='Lists B and C'?[{key:'listBTitle',label:'List B Document Title'},{key:'listBNumber',label:'List B Document Number'},{key:'listCTitle',label:'List C Document Title'},{key:'listCNumber',label:'List C Document Number'}]:[]),
  {key:'signedDocumentId',label:'Completed and Signed Official I-9',options:docs},
  {key:'preparerUsed',label:'Preparer or Translator Assisted — Supplement A Included',type:'checkbox'},
  ...(canVerify?[{key:'physicalReviewConfirmed',label:'I Physically Examined the Original Acceptable Documents',type:'checkbox'}]:[]),
  {key:'followUpDate',label:'Applicable Receipt / Reverification Follow-Up',type:'date'},{key:'notes',label:'Verification Notes',multiline:true}
 ]:record.kind==='w4'?[
  {key:'status',label:'Review Status',options:states},{key:'formEdition',label:'Signed Form Year',required:true},
  {key:'effectiveDate',label:'Payroll Effective Date',type:'date'},{key:'filingStatus',label:'Step 1(c) — Filing Status',options:['Single or Married Filing Separately','Married Filing Jointly','Head of Household']},
  {key:'step2',label:'Step 2(c) Checkbox Is Checked on the Signed Form',type:'checkbox'},
  {key:'step3',label:'Step 3 — Total Credits ($)',type:'number'},{key:'step4a',label:'Step 4(a) — Other Income ($)',type:'number'},
  {key:'step4b',label:'Step 4(b) — Deductions ($)',type:'number'},{key:'step4c',label:'Step 4(c) — Extra Withholding per Pay Period ($)',type:'number'},
  {key:'exempt',label:'Exemption Claimed on the Signed Form',type:'checkbox'},{key:'nonresidentAlien',label:'Nonresident Alien Status Indicated on the Signed Form',type:'checkbox'},
  {key:'signedDocumentId',label:'Signed Official W-4',options:docs},
  ...(canVerify?[{key:'electionsMatchSignedForm',label:'I Verified These Entries Against the Employee’s Signed Form',type:'checkbox'}]:[])
 ]:record.kind==='w9'?[
  {key:'status',label:'Review Status',options:states},{key:'effectiveDate',label:'Effective Date',type:'date'},
  {key:'legalName',label:'Name Shown on Tax Return',required:true},{key:'businessName',label:'Business / Disregarded Entity Name'},
  {key:'taxClassification',label:'Federal Tax Classification',options:['Individual / Sole Proprietor','C Corporation','S Corporation','Partnership','Trust / Estate','LLC','Other']},
  {key:'taxpayerId',label:'Taxpayer Identification Number',type:'password'},{key:'address',label:'Mailing Address'},
  {key:'backupWithholding',label:'Backup Withholding Review Required',type:'checkbox'},
  {key:'signedDocumentId',label:'Signed Official W-9',options:docs},
  ...(canVerify?[{key:'electionsMatchSignedForm',label:'I Verified These Entries Against the Signed Form',type:'checkbox'}]:[])
 ]:record.kind==='bank'?[
  {key:'status',label:'Setup Status',options:states},{key:'nameOnAccount',label:'Name on Account',required:true},
  {key:'bankName',label:'Bank Name'},{key:'accountType',label:'Account Type',options:['Checking','Savings']},
  {key:'routingNumber',label:'Routing Number',required:true},{key:'accountNumber',label:'Account Number',type:'password',required:true},
  {key:'effectiveDate',label:'Requested Effective Date',type:'date'},{key:'signedDocumentId',label:'Signed Direct Deposit Authorization',options:docs},
  {key:'notes',label:'Setup Notes',multiline:true}
 ]:record.kind==='screening'?[
  {key:'status',label:'Review Status',options:states},{key:'drugStatus',label:'Drug Screen',options:['Not Requested','Requested','Scheduled','Pending','Passed','Review Required']},
  {key:'backgroundStatus',label:'Background Check',options:['Not Requested','Requested','Pending','Cleared','Review Required']},
  {key:'owner',label:'Follow-Up Owner',options:staffOptions('owner',['Active'])},{key:'followUpDate',label:'Follow-Up Date',type:'date'},
  {key:'providerReference',label:'Provider / Checkr Reference'},{key:'employerContactName',label:'Employer Contact for Drug Screen Request'},
  {key:'drugDocumentId',label:'Drug Screen Result',options:attachments.filter(r=>r.data.category==='Drug Screen').map(r=>({value:r.id,label:text(r.data.fileName||r.data.category)}))},
  {key:'backgroundDocumentId',label:'Background Check Result',options:attachments.filter(r=>r.data.category==='Background Check').map(r=>({value:r.id,label:text(r.data.fileName||r.data.category)}))},
  {key:'notes',label:'Restricted Review Notes',multiline:true}
 ]:[];
 function changeCitations(values:(SopChoice|PrivateChoice)[]){markCitationsChanged(true);setDraft(d=>{const next={...d,sopCitations:values} as Record<string,unknown>;for(const k of ['policyReference','policyVersion','policySnapshot','policyIds'])delete next[k];if(record.kind==='corrective')next.subject=values[0]&&isSopChoice(values[0])?values[0].title:'';return next;});}
 async function persist(){
  if(savedRecord.version>0&&JSON.stringify(draft)===JSON.stringify(savedRecord.data))return savedRecord;
  const payload={...draft};if(record.kind==='note'||record.kind==='corrective'){
   // Untouched stored citations (including inaccessible editions) remain server-authored.
   delete payload.employeePdfCitations;delete payload.employeePolicySubject;
   if(citationsChanged||!savedRecord.version)payload.sopCitations=sopRefs(draft.sopCitations).filter(isSopChoice).map(({id,version})=>({id,version}));else delete payload.sopCitations;
  }
  const result=await requestJson<{record:HrRecord}>('/api/hr',{action:'save',id:savedRecord.id,kind:savedRecord.kind,personId:savedRecord.personId,version:savedRecord.version,data:payload});
  setSavedRecord(result.record);markCitationsChanged(false);setDraft({...result.record.data});return result.record;
 }
 async function save(e?:FormEvent){e?.preventDefault();if(busy)return;setBusy(true);setError('');setSaveNotice('');try{const saved=await persist();await onSaved(saved);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function pdf(){
  if(busy||!(document.getElementById('hr-record-form') as HTMLFormElement|null)?.reportValidity())return;
  setBusy(true);setError('');setSaveNotice('');let saved:HrRecord|undefined,downloaded=false;
  try{saved=await persist();setSaveNotice('Corrective Action Saved');await generateHrPdf('corrective',person||{},saved.data);downloaded=true;await onSaved(saved);onClose();}
  catch(e){setError((saved?(downloaded?'The record and PDF were saved, but the view could not refresh. ':'The record is saved. PDF generation did not finish; retry Generate PDF. '):'')+(e as Error).message);}
  finally{setBusy(false);}
 }
 const official:Record<string,string>={i9:'https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf',w4:'https://www.irs.gov/pub/irs-pdf/fw4.pdf',w9:'https://www.irs.gov/pub/irs-pdf/fw9.pdf'};
 return <Modal title={(record.version?'Edit ':'Add ')+kindTitles[record.kind]} subtitle={text(person?.name)} onClose={onClose} wide footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button>{record.kind==='corrective'&&<Button onClick={()=>void pdf()} disabled={busy}><Download size={16}/>{savedRecord.version>0&&JSON.stringify(draft)===JSON.stringify(savedRecord.data)?'Generate PDF':'Save & Generate PDF'}</Button>}<Button primary onClick={()=>{(document.getElementById('hr-record-form') as HTMLFormElement|null)?.requestSubmit();}} disabled={busy}>{busy?'Saving…':'Save Record'}</Button></>}>
  {sensitiveKinds.has(record.kind)&&<div className="hr2-callout"><LockKeyhole size={20}/><p>Restricted personnel information. Access is limited to the employee and separately authorized reviewers. Submitted information requires employer verification before it is used.</p></div>}
  {official[record.kind]&&<div className="hr2-callout"><div><p><b>Use the official form for the employee’s certification.</b> Download, complete, sign, and upload it. The fields below record verification and payroll information from that signed form.</p><a className="hr2-button" href={official[record.kind]} target="_blank" rel="noreferrer"><Download size={16}/>Open Official {record.kind==='i9'?'I-9':record.kind==='w4'?'W-4':'W-9'}</a></div></div>}
  {record.kind==='note'&&<p className="hr2-callout">This management note stays private. The conversation date may be historical; its actual entry time and author are always preserved.</p>}
  {record.kind==='benefit'&&<p className="hr2-help">Employment class and custom leave allowances are managed in Benefits & Leave. This form records health and retirement enrollment confirmations. Carrier enrollment and payroll deductions require separate confirmation.</p>}
  {record.kind==='offboarding'&&<div className="hrx-offboard-prerequisites"><h3>Completion Prerequisites</h3><div><span>Employment Status</span><b>{text(person?.status)||'Not Set'}</b><span>System Account</span><b>{text(person?.accountStatus)||'Not Set'}</b></div><p>Completion requires a Former employment record, disabled system account, and reviewed final time. Save progress before updating related records. Recording a handoff does not send a message.</p><div className="hr2-actions"><a className="hr2-button" href={'/?module=People%20%26%20HR&employee='+encodeURIComponent(record.personId||'')} target="_blank" rel="noreferrer">Open Employee Profile</a><a className="hr2-button" href="/?module=Admin" target="_blank" rel="noreferrer">Review Account Access</a><a className="hr2-button" href="/?module=Timeclock" target="_blank" rel="noreferrer">Review Final Time</a></div></div>}
  {record.kind==='benefit'&&!!draft.employmentClass&&draft.employmentClass!=='Full-Time'&&<p className="hr2-callout">Part-time, temporary, and seasonal employees do not receive company benefits. Ordinary time off is unpaid and requires shift coverage and approval.</p>}
  <form id="hr-record-form" onSubmit={save} className="hr2-form">{fields.map(field=>field.key==='sopCitations'&&(record.kind==='note'||record.kind==='corrective')?<PublishedSopPicker key={field.key} kind={record.kind} personId={record.personId||''} selected={sopRefs(draft.sopCitations)} legacy={!!record.version&&!!draft.policyReference&&!citationsChanged} disabled={busy} onChange={changeCitations}/>:<Field key={field.key} field={field} value={draft[field.key]} onChange={value=>set(field.key,value)} disabled={busy||record.kind==='benefit'&&field.key==='employmentClass'}/>)}</form>

  {record.kind==='note'&&!!draft.category&&records.some(r=>r.kind==='note'&&r.personId===record.personId&&r.data.category===draft.category)&&<div className="hr2-callout"><div><b>Related Conversation History</b>{records.filter(r=>r.kind==='note'&&r.personId===record.personId&&r.data.category===draft.category).slice(-3).reverse().map(r=><p key={r.id}>{text(r.data.eventDate)} · {text(r.data.eventType)}: {text(r.data.summary).slice(0,140)}</p>)}</div></div>}
  {record.kind==='corrective'&&<p className="hr2-help">Save & Generate PDF records this action and downloads its unsigned document together. Upload the signed copy to this record after the meeting. Employee visibility requires a verified signed copy; a refusal remains documented separately.</p>}
  {record.personId&&record.kind!=='corrective'&&formCategory(record.kind)&&<UploadPanel personId={record.personId} parentId={record.version?record.id:undefined} category={formCategory(record.kind)} onUploaded={r=>{setAttachments(a=>[...a,r]);set('signedDocumentId',r.id);if(record.kind==='screening')set('backgroundDocumentId',r.id);}}/>}
  {record.kind==='screening'&&<Button disabled={!text(draft.employerContactName)||busy} onClick={()=>void generateDrugScreenPdf(text(person?.name),text(draft.employerContactName)).catch(e=>setError((e as Error).message))}>Generate Drug Screen Request PDF</Button>}
  {record.kind==='screening'&&record.personId&&<UploadPanel personId={record.personId} parentId={record.version?record.id:undefined} category="Drug Screen" onUploaded={r=>{setAttachments(a=>[...a,r]);set('drugDocumentId',r.id);}}/>}
  {record.kind==='screening'&&attachments.filter(d=>['Background Check','Drug Screen'].includes(text(d.data.category))).map(r=><DocumentLink key={r.id} record={r}/>)}
  {saveNotice&&<p className="hr2-success" role="status">{saveNotice}</p>}
  {error&&<p className="hr2-error" role="alert">{error}</p>}
 </Modal>;
}
