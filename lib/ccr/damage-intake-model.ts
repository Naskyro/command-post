import {AppError,ConflictError} from '../shared/errors.ts';
import {realDay} from './docket-model.ts';
import type {ClaimOperations,ClaimCaseUpdate} from './claim-operations';
export const damageIntakeStatuses=['Outcome Unverified','Open','Closed'] as const;
export type IntakeStatus=typeof damageIntakeStatuses[number];
export type DamageIntakeRef={messageId:string;threadId:string;on:string;subject:string;note:string};
export type DamageManifest={threadId:string;title:string;reportedOn:string;summary:string;status:IntakeStatus;statusBasis?:string;claimReference?:string;propertyName?:string;vehicle?:string;references:DamageIntakeRef[]};
export type DamageIntakeFile={id:string;name:string;type:string;bytes:number;sha256:string;documentType:string;otherDocumentType?:string;at:string;by:string;byId:string;sourceMessageId?:string};
export const damageCaseFactFields=['title','vehicle','claimReference','reportedOn','summary'] as const;
export type DamageCaseFact=typeof damageCaseFactFields[number];
export type DamageCaseFacts=Pick<DamageManifest,DamageCaseFact>;
/** Generated only from the first saved edition; current facts never rewrite this report. */
export type DamageOriginalSource=Omit<DamageManifest,'references'>&{sourceKind?:'Google Drive';driveSourceId?:string;version:number;filedAt:string;filedBy:string};
export type DamageIntake=DamageManifest&ClaimOperations&{evidenceRestricted?:boolean;sourceKind?:'Google Drive';driveSourceId?:string;originalSource?:DamageOriginalSource;id:string;version:number;initialStatus?:IntakeStatus;initialStatusBasis?:string;accountId?:string;linkedAccountName?:string;files:DamageIntakeFile[];updates:{at:string;by:string;byId:string;note:string;status:IntakeStatus;changes?:ClaimCaseUpdate['changes']}[];createdAt:string;createdBy:string;updatedAt:string;updatedBy:string;actorId:string};
const bad=(msg:string):never=>{throw new AppError(msg);};
const obj=(x:unknown)=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:bad('Choose one reviewed claim.');
export function intakeText(x:unknown,limit:number,required=false){if(x==null&&!required)return '';if(typeof x!=='string')return bad('Enter valid text.');const s=x.trim();if(s.length>limit||required&&!s||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))return bad('A required field is empty or exceeds the text limit.');return s;}
const day=(x:unknown)=>realDay(x)||bad('Enter the actual source date in YYYY-MM-DD format.');
const mailId=(x:unknown)=>typeof x==='string'&&/^[A-Za-z0-9_-]{5,160}$/.test(x)?x:bad('Enter the original Gmail message and thread identifiers.');
export const intakeNorm=(s:string)=>s.toLowerCase().replace(/\s+/g,' ').trim();
export const intakeStatus=(s:unknown)=>damageIntakeStatuses.includes(s as IntakeStatus)?s as IntakeStatus:bad('Choose a recorded case status.');
export function prepareDamageCaseFacts(raw:unknown,today:string):Partial<DamageCaseFacts>{
 const patch=obj(raw),limits:Record<DamageCaseFact,number>={title:240,vehicle:200,claimReference:160,reportedOn:10,summary:5000};
 if(Object.keys(patch).some(k=>!(damageCaseFactFields as readonly string[]).includes(k)))bad('Only the claim title, vehicle, claim reference, reported date and summary may be changed as current claim facts.');
 const next:Partial<DamageCaseFacts>={};
 for(const key of damageCaseFactFields){
  if(!Object.hasOwn(patch,key))continue;
  if(typeof patch[key]!=='string')bad('Enter valid text for the current claim facts.');
  const value=intakeText(patch[key],limits[key],key==='title'||key==='summary');
  if(key==='reportedOn'&&value&&(!realDay(value)||value>today))bad('Use an actual reported date on or before today, or leave it blank if unknown.');
  next[key]=value;
 }
 return next;
}
export function damageCaseFactChanges(old:DamageCaseFacts,next:Partial<DamageCaseFacts>):ClaimCaseUpdate['changes']{
 return Object.fromEntries(damageCaseFactFields.filter(k=>Object.hasOwn(next,k)&&(old[k]||'')!==next[k]).map(k=>[k,{before:old[k]||'',after:next[k]||''}]));
}
export function parseDamageManifest(raw:unknown):DamageManifest{
 const b=obj(raw),threadId=mailId(b.threadId),title=intakeText(b.title,240,true),reportedOn=day(b.reportedOn),summary=intakeText(b.summary,5000,true),status=intakeStatus(b.status??'Outcome Unverified'),statusBasis=intakeText(b.statusBasis,1400),propertyName=intakeText(b.propertyName,200),vehicle=intakeText(b.vehicle,200),claimReference=intakeText(b.claimReference,160);
 if(status!=='Outcome Unverified'&&!statusBasis)bad('A confirmed status requires a source basis. An allegation alone does not establish an outcome.');
 if(!Array.isArray(b.references)||!b.references.length||b.references.length>150)return bad('At least one original source message is required (maximum 150).');
 const refs=new Map<string,DamageIntakeRef>();
 for(const raw of b.references){const r=obj(raw),ref={messageId:mailId(r.messageId),threadId:mailId(r.threadId),on:day(r.on),subject:intakeText(r.subject,512,true),note:intakeText(r.note,2000,true)},prev=refs.get(ref.messageId);if(prev&&JSON.stringify(prev)!==JSON.stringify(ref))bad('The same message is listed with inconsistent source details.');refs.set(ref.messageId,ref);}
 const references=[...refs.values()].sort((a,b)=>a.on.localeCompare(b.on)||a.messageId.localeCompare(b.messageId));
 if(!references.some(r=>r.threadId===threadId))bad('The primary thread must have a reviewed source message.');
 return {threadId,title,reportedOn,summary,status,...(statusBasis?{statusBasis}:{}),...(propertyName?{propertyName}:{}),...(vehicle?{vehicle}:{}),...(claimReference?{claimReference}:{}),references};
}
export function reconcileDamageManifest(old:DamageIntake,b:DamageManifest){
 const source=old.originalSource||old;
 const prior=new Map(old.references.map(r=>[r.messageId,r]));
 const additions=b.references.filter(r=>!prior.has(r.messageId));
 for(const r of b.references){const old=prior.get(r.messageId);if(old&&(old.threadId!==r.threadId||old.on!==r.on||old.subject!==r.subject||old.note!==r.note))throw new ConflictError('A source message has conflicting provenance. Review the case before filing.');}
 if(old.threadId!==b.threadId&&!b.references.some(r=>prior.has(r.messageId))&&!(old.claimReference&&b.claimReference&&intakeNorm(old.claimReference)===intakeNorm(b.claimReference)))throw new ConflictError('A related thread appears in an existing case without a verified matching message or claim reference. Review the incident identity.');
 // Never replace a reviewed case or its findings with a different account, vehicle, rationale, status or description on re-import.
 for(const key of ['vehicle','claimReference','propertyName'] as const){const correction=old.updates.find(u=>Object.hasOwn(u.changes||{},key)),baseline=source[key]??correction?.changes?.[key].before??old[key];if(baseline&&b[key]&&intakeNorm(baseline)!==intakeNorm(b[key]!))throw new ConflictError('The source case details differ. Review the original source before filing.');}
 if(old.status!==b.status&&b.status!==(old.initialStatus??old.status)&&b.status!=='Outcome Unverified')throw new ConflictError('The source status differs from the saved record. Use Add Case Update to record a reviewed change.');
 if(old.threadId===b.threadId&&(source.reportedOn!==b.reportedOn||source.summary!==b.summary||source.title!==b.title))throw new ConflictError('The source summary, title or reported date differs. Use Edit Claim Details to record a correction while preserving the original report.');
 return {additions,fill:Object.fromEntries((['vehicle','claimReference','propertyName'] as const).filter(k=>!old[k]&&b[k]&&!old.updates.some(u=>Object.hasOwn(u.changes||{},k))).map(k=>[k,b[k]]))};
}
