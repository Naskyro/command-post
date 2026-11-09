import type {RegMail} from './regulatory-mail';
import {lawReferences,type LawReference} from './law-references.ts';
import {checkedChargeback,processorActions,type Chargeback} from './chargeback.ts';
import {checkedLegalNotice,legalResolutionProven,type LegalNotice} from './legal-notice.ts';
import type {ClaimChoice} from './claim-operations';
import {verifiedTdlr,tdlrOutcomeProven,type TdlrCase} from './tdlr.ts';
import type {FinRecord,Viewer} from '../finance/model';
import {canAccess,grantsFor} from '../finance/access.ts';
import {displayPersonName} from '../people/display-name.ts';
import {verifiedOwnerRecord} from '../finance/identity.ts';
import {AppError,ConflictError,ForbiddenError} from '../shared/errors.ts';
export const registerSections=['tdlr','recovery','legal','evidence','licenses','calendar'] as const;
export type RegisterSection=typeof registerSections[number];
type Config={categories:string[];statuses:string[];steps:string[]};
export const registerConfig:Record<RegisterSection,Config>={
 legal:{categories:['Cease and Desist','Demand Letter','Legal Threat','Attorney Correspondence','Other Legal Notice'],statuses:['Open','Preparing Notice','Awaiting Response','Under Review','Closed'],steps:['Notice Recorded','Supporting Documents Attached','Correspondence Logged','Outcome Recorded']},
 tdlr:{categories:['Agency Complaint','Agency Follow-Up','Response Request'],statuses:['Open','Outcome Unverified','Preparing Response','Awaiting Agency','Closed'],steps:['Complaint Notice Indexed','Response Deadline Recorded','Supporting Records Gathered','Response Submission Documented','Agency Disposition Recorded']},
 recovery:{categories:['Chargeback','Company Property Damage','Employee Incident','Lot Incident','Other Recovery','Unremitted Funds'],statuses:['Open','Gathering Records','Awaiting Response','In Reconciliation','Closed'],steps:['Loss Documented','Supporting Records Gathered','Decision Reference Recorded','Communication Logged','Reconciliation Reference Recorded']},
 evidence:{categories:['Company Licenses','Employee Credentials','Insurance','Inspection Packet','Property Agreement','Testing Records','Tow & Release Records','Training & SOPs'],statuses:['Open','Gathering Evidence','In Review','Closed'],steps:['Scope Recorded','Source Records Indexed','Gaps Documented','Review Outcome Recorded']},
 licenses:{categories:['APD License','Assignment Review','Driver’s License','Drug & Alcohol Testing','MVR Review','TDLR License','VSF License'],statuses:['Open','Awaiting Documentation','In Review','Closed'],steps:['Requirement Recorded','Source Document Indexed','Review Outcome Recorded','Follow-Up Documented']},
 calendar:{categories:['Agency Response','Filing','Inspection','Insurance Renewal','License Renewal','Other Obligation','Testing Deadline'],statuses:['Open','In Progress','Awaiting Evidence','Closed'],steps:['Deadline Recorded','Responsible Person Notified','Evidence Indexed','Completion Documented']},
};
export type RegEvidenceSource={messageId:string;sourceSha256:string;sourceBytes:number;medium:'Gmail Attachment'|'Linked Google Drive File';kind:'Original'|'Reviewed Copy';originalName:string;driveId?:string};
export type RegisterFile={sourceReceipt?:RegEvidenceSource;id:string;name:string;type:string;documentType?:string;otherDocumentType?:string;bytes:number;sha256:string;at:string;by:string};
export type RegisterRecord={mailCount?:number;tdlr?:TdlrCase;lawEnforcement?:LawReference[];chargeback?:Chargeback;legalNotice?:LegalNotice;id:string;version:number;section:RegisterSection;title:string;category:string;status:string;ownerId:string;ownerName:string;reference:string;resolutionReference:string;dueOn:string;nextAction:string;amountCents:number|null;steps:string[];createdAt:string;createdBy:string;updatedAt:string;updatedBy:string;history:{version:number;at:string;by:string;note:string;changes:string[]}[];files:RegisterFile[]};
export type StoredRegisterRecord=RegisterRecord&{regulatoryMail?:RegMail[];createdPerson:string;actorId:string};
export type RegisterSummaryItem=Pick<RegisterRecord,'id'|'section'|'title'|'status'|'dueOn'|'ownerName'|'nextAction'|'updatedAt'|'amountCents'>&{chargebackActions?:ReturnType<typeof processorActions>};
export type OwnerOption={id:string;name:string};
const CCR='Compliance, Claims & Recovery';
export const isRegisterSection=(v:unknown):v is RegisterSection=>(registerSections as readonly unknown[]).includes(v);
export const sectionAccess=(v:Viewer,s:RegisterSection,edit=false)=>Boolean(v.person&&!v.onboardingOnly&&canAccess(v,CCR,s,edit));
export const commandAccess=(v:Viewer)=>Boolean(v.person&&!v.onboardingOnly&&canAccess(v,CCR,'command'));
export function leadership(v:Viewer,staff:FinRecord[]){return !!v.person&&!v.onboardingOnly&&(v.owner||v.role==='Department Head'||staff.some(r=>r.kind==='department'&&r.head===v.person&&!['Inactive','Archived'].includes(String(r.status)))||staff.some(p=>p.kind==='person'&&p.id===v.person&&(p.authorityLevel==='Executive'||p.organizationalLevel==='Executive')));}
export function ownerChoices(v:Viewer,s:RegisterSection,staff:FinRecord[]):OwnerOption[]{
 if(!sectionAccess(v,s,true))return [];
 return staff.filter(p=>p.kind==='person'&&p.status==='Active'&&p.accountStatus!=='Disabled'&&!p.commandSignInRevoked&&!(p.onboardingRequired&&!p.onboardingClearedAt)&&(p.id===v.person||verifiedOwnerRecord(p)||grantsFor(p).some(g=>g.module===CCR&&g.tab===s))).map(p=>({id:p.id,name:displayPersonName(p)})).sort((a,b)=>a.name.localeCompare(b.name));
}
export function publicRegisterRecord(r:StoredRegisterRecord):RegisterRecord{const {createdPerson,actorId,regulatoryMail,...out}=r;out.files=out.files.filter(f=>!f.sourceReceipt);return regulatoryMail?.length?{...out,mailCount:regulatoryMail.length}:out;}
export function summaryItem(r:RegisterRecord):RegisterSummaryItem{const {id,section,title,status,dueOn:followUp,ownerName,nextAction,updatedAt,amountCents}=r;const dueOn=[followUp,r.legalNotice?.stage==='Resolved'?'':r.legalNotice?.responseDue||''].filter(Boolean).sort()[0]||'';const actions=section==='recovery'?processorActions(r.chargeback,r.amountCents):[];return {id,section,title,status,dueOn,ownerName,nextAction,updatedAt,amountCents,...(actions.length?{chargebackActions:actions}:{})};}
export function canSeeRegister(r:StoredRegisterRecord,v:Viewer,lead:boolean){return sectionAccess(v,r.section)&&(lead||r.createdPerson===v.person||r.ownerId===v.person);}
export function checkedId(x:unknown){if(typeof x!=='string'||!/^[\w-]{1,90}$/.test(x))throw new AppError('Select an existing record.');return x;}
function word(x:unknown,max:number,required=false){if(x!==undefined&&typeof x!=='string')throw new AppError('Enter text in the indicated field.');const s=(x||'').trim();if(required&&!s||s.length>max||/[\u0000-\u0008\u000B-\u001F\u007F]/.test(s.replace(/\r/g,'')))throw new AppError('A required field is missing or the entry is too long.');return s;}
function day(x:unknown){const s=word(x,10);if(!s)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T12:00:00Z'))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw new AppError('Enter a valid due date.');return s;}
export function appendHistory(r:StoredRegisterRecord,v:Viewer,at:string,changes:string[],note=''):StoredRegisterRecord{return {...r,updatedAt:at,updatedBy:v.name,actorId:v.id,history:[...r.history,{version:r.version,by:v.name,at,changes,note}]};}
export function prepareRegister(v:Viewer,s:RegisterSection,b:Record<string,unknown>,old:StoredRegisterRecord|undefined,owners:OwnerOption[],lead:boolean,at:string,accounts?:ClaimChoice[]):StoredRegisterRecord{
 if(!sectionAccess(v,s,true)||old&&(!canSeeRegister(old,v,lead)||old.section!==s))throw new ForbiddenError();
 if((old?.version||0)!==b.version||old&&old.id!==b.id||!old&&b.id)throw new ConflictError();
 if(b.section!==s)throw new AppError('Select the correct register.');
 const cfg=registerConfig[s],title=word(b.title,160,true),category=word(b.category,80,true),status=word(b.status,60,true),reference=word(b.reference,180),dueOn=day(b.dueOn),nextAction=word(b.nextAction,900),note=word(b.note,2400),ownerId=word(b.ownerId,130);
 if(!cfg.categories.includes(category)||!cfg.statuses.includes(status))throw new AppError('Select a listed category and status.');
 const resolutionReference=b.resolutionReference===undefined?old?.resolutionReference||'':word(b.resolutionReference,200);
 if(!old&&status==='Closed')throw new AppError('Save the open record first, then document its evidence and outcome before closure.');
 const changedClosed=status!==old?.status&&(status==='Closed'||old?.status==='Closed');
 if(changedClosed&&(!lead||!note))throw (!lead?new ForbiddenError('Only a department head or executive may close or reopen a record.'):new AppError('Add a dated outcome or reopening reason to the activity note.'));
 const selected=owners.find(p=>p.id===ownerId);if(ownerId&&old?.ownerId!==ownerId&&!selected)throw new AppError('Choose an active staff member with access to this section.');
 const amountCents=b.amountCents===undefined?old?.amountCents??null:b.amountCents;
 if(amountCents!==null&&(s!=='recovery'||typeof amountCents!=='number'||!Number.isSafeInteger(amountCents)||amountCents<0||amountCents>99999999999))throw new AppError('Enter a valid recovery amount in cents.');
 if(!Array.isArray(b.steps)||b.steps.some(x=>typeof x!=='string'||!cfg.steps.includes(x))||new Set(b.steps).size!==b.steps.length)throw new AppError('Choose the documented steps from this register.');
 const steps=cfg.steps.filter(x=>(b.steps as string[]).includes(x));
 if(b.tdlr!==undefined&&s!=='tdlr')throw new AppError('Agency complaint details belong to TDLR Complaints.');
 const tdlr=s==='tdlr'?verifiedTdlr(b.tdlr,old?.tdlr):undefined;
 if(s==='tdlr'&&status==='Closed'&&tdlr&&(changedClosed||b.tdlr!==undefined&&old?.tdlr)){
  if(!tdlrOutcomeProven(tdlr,old!.files,reference))throw new AppError('A closed agency matter requires a final decision, its date, and proof of that decision.');
  tdlr.stage='Agency Disposition Received';
 }
 if(changedClosed&&status==='Closed'){
  if(s==='tdlr'&&!tdlrOutcomeProven(tdlr,old!.files,reference))throw new AppError('To close, record the agency decision and date, and attach the final decision or identify its document reference.');
  if(s!=='tdlr'&&s!=='legal'&&steps.length!==cfg.steps.length)throw new AppError('Document each workflow step before closing this record.');
  const lower=resolutionReference.toLowerCase().trim(),hasReference=lower.length>=3&&!['n/a','none','tbd','not applicable','done','unknown',old!.id.toLowerCase(),reference.toLowerCase(),title.toLowerCase()].includes(lower);
  if(s!=='tdlr'&&s!=='legal'&&!hasReference&&(s==='recovery'||!old!.files.length))throw new AppError(s==='recovery'?'Enter the Finance reconciliation reference before closing this recovery.':'Attach evidence or enter an external evidence reference distinct from the case reference.');
 }
 if(b.chargeback!==undefined&&(s!=='recovery'||category!=='Chargeback'))throw new AppError('Chargeback details belong to a chargeback recovery only.');
 if(old?.chargeback&&category!=='Chargeback')throw new AppError('This record contains chargeback history and cannot be reclassified.');
 const checked=checkedChargeback(b.chargeback,old?.chargeback,amountCents as number|null,new Date(at));
 const chargeback=checked?{...checked,...(checked.details?{details:{...checked.details}}:{})}:undefined;
 if(chargeback&&old?.chargeback&&(old.chargeback.entries.some(e=>!chargeback.entries.some(n=>JSON.stringify(n)===JSON.stringify(e)))||(old.chargeback.serviceFees||[]).some(e=>!(chargeback.serviceFees||[]).some(n=>JSON.stringify(n)===JSON.stringify(e))))&&!note)throw new AppError('Explain the correction to a saved payment, cost, or service fee in the case note.');
 if(old?.chargeback?.disposition==='Final Loss'&&chargeback?.disposition!=='Final Loss'&&!note)throw new AppError('Explain why this written-off recovery is reopening in the case note.');
 if(chargeback&&status==='Closed'&&changedClosed&&processorActions(chargeback).some(a=>a.title.startsWith('Submit')))throw new AppError('Resolve the outstanding processor response or signed election before closing the dispute.');
 if(b.legalNotice!==undefined&&s!=='legal')throw new AppError('Legal correspondence belongs in Legal Notices & Correspondence.');
 const legalNotice=s==='legal'?checkedLegalNotice(b.legalNotice,old?.legalNotice,accounts):undefined;
 if(legalNotice&&legalNotice.type!==category)throw new AppError('Choose the same notice type for this legal record.');
 if(s==='legal'&&status==='Closed'&&(!legalResolutionProven(legalNotice)||changedClosed&&!note))throw new AppError('Record the legal matter resolution date, supporting reference, and outcome note before closing.');
 if(chargeback?.details){const id=chargeback.details.accountId;if(id){const match=accounts?.find(a=>a.id===id);if(match)chargeback.details.accountName=match.name;else if(id===old?.chargeback?.details?.accountId)chargeback.details.accountName=old.chargeback.details.accountName;else throw new AppError('Choose an existing account from the directory.');}else chargeback.details.accountName='';}
 const lawEnforcement=lawReferences(b.lawEnforcement,old?.lawEnforcement);
 const out:StoredRegisterRecord={...(old?.regulatoryMail?{regulatoryMail:old.regulatoryMail}:{}),...(tdlr?{tdlr}:{}),...(lawEnforcement?{lawEnforcement}:{}),...(chargeback?{chargeback}:{}),...(legalNotice?{legalNotice}:{}),id:old?.id||crypto.randomUUID(),version:(old?.version||0)+1,section:s,title,category,status,reference,resolutionReference,dueOn,nextAction,ownerId,ownerName:ownerId?(selected?.name||old?.ownerName||''):'',amountCents,steps,files:old?.files||[],createdPerson:old?.createdPerson||v.person,createdBy:old?.createdBy||v.name,createdAt:old?.createdAt||at,updatedAt:at,updatedBy:v.name,actorId:v.id,history:old?.history||[]};
 const fields:Partial<Record<keyof RegisterRecord,string>>={tdlr:'TDLR Investigation',title:'Title',category:'Category',status:'Status',ownerId:'Record Owner',reference:'Reference',resolutionReference:'Resolution Reference',dueOn:'Due Date',nextAction:'Next Action',amountCents:'Tracked Amount',steps:'Documented Steps',chargeback:'Chargeback Workflow',legalNotice:'Legal Correspondence Details',lawEnforcement:'Law Enforcement References'};
 const changes=old?(Object.keys(fields) as (keyof typeof fields)[]).filter(k=>JSON.stringify(old[k])!==JSON.stringify(out[k])).map(k=>fields[k]!):['Record Created'];
 if(old?.status==='Closed'&&changes.length&&status==='Closed'&&!lead)throw new ForbiddenError('Only a department head or executive may change a closed record. You may append an activity note.');
 if(!changes.length&&!note)throw new AppError('Change a field or add an activity note before saving.');
 return appendHistory(out,v,at,changes.length?changes:['Activity Note Added'],note);
}
