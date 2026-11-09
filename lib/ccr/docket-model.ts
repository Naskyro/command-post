import type {HearingFact} from './hearing-facts';
import type {Viewer} from '../finance/model';
import {canAccess} from '../finance/access.ts';
import {AppError,ConflictError,ForbiddenError} from '../shared/errors.ts';
import {localInstant} from '../finance/timeclock.ts';
export const CCR='Compliance, Claims & Recovery';
export const caseTypes=['Lawsuit','Tow Hearing','Victim / Witness Matter','Other Court Matter'] as const;
export const appearanceStates=['Scheduled','Attended','Cancelled','Continued','Historical Setting'] as const;
export type Appearance={id:string;label:string;date:string;time?:string;status:typeof appearanceStates[number]};
export const courtCauses=['Billing or Fees','Contract','Injury','Non-Consent Tow','Property Damage','Restitution','Other'] as const;
export const courtResults=['PTE Won','PTE Lost','Mixed Ruling','Settled','Dismissed','Withdrawn','Other Disposition'] as const;
export const settlementStages=['Before Filing','Before the Hearing','At the Courthouse Before the Hearing','During the Hearing','After the Hearing'] as const;
export type CourtOutcome={result:typeof courtResults[number];on:string;stage?:typeof settlementStages[number];prevailingParty?:string;otherParty?:string;settlementCents?:number};
export type PoliceReference={id:string;agency:string;number:string;officer:string;badge:string};
export type CourtDocument={shareWithProperty?:boolean;chunks?:{size:number;count:number};id:string;name:string;type:string;bytes:number;sha256:string;at:string;by:string;byId:string;documentType:string;otherDocumentType?:string};
export type CourtStatement={shareWithProperty?:boolean;text:string;by:string;byId:string;at:string;outcome?:CourtOutcome};
export type Matter={propertyLinkHistory?:{verification?:'source-verified'|'manual-review';accountId:string;fromId?:string;at:string;by:string;byId:string;basis:string;propertyAsPrinted?:string;evidence?:{sha256:string;page:number;fileId:string}[]}[];hearingFacts?:HearingFact[];accountId?:string;id:string;version:number;title:string;number:string;type:typeof caseTypes[number];status:'Open'|'Closed'|'Outcome Unverified';filedOn:string;dueOn:string;dueFor:string;appearances:Appearance[];createdAt:string;createdBy:string;updatedAt:string;updatedBy:string;actorId:string;statements:CourtStatement[];files?:CourtDocument[];lawEnforcement?:PoliceReference[];courtName?:string;courtId?:string;assignedJudge?:string;assignedJudgeId?:string;courtContact?:string;causeCategory?:string;relatedCauses?:string[];relatedMatterIds?:string[]};
export function docketAccess(v:Viewer,edit=false){return !v.onboardingOnly&&canAccess(v,CCR,'hearings',edit);}
export function realDay(value:unknown){const s=typeof value==='string'?value:'';return /^\d{4}-\d\d-\d\d$/.test(s)&&!isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s?s:'';}
const field=(value:unknown,max:number,required=false)=>{if(value!==undefined&&typeof value!=='string')throw new AppError('Enter a valid text value.');const s=(value||'').trim();if(s.length>max||required&&!s)throw new AppError('Complete the required text and stay within the field limits.');return s};
export function hearingInstant(day:string,time:string){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new AppError('Enter an Austin time in hours and minutes.');const ms=localInstant(day+'T'+time);if(!Number.isFinite(ms))throw new AppError('That local time does not exist in Austin. Check the time on the notice.');const wall=(n:number)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(n);if(wall(ms)===wall(ms+3600000)||wall(ms)===wall(ms-3600000))throw new AppError('That time occurs twice in Austin. Record the time in a statement with its zone, or leave the appointment time blank.');return new Date(ms).toISOString();}
const date=(value:unknown)=>{if(!value)return '';const d=realDay(value);if(!d)throw new AppError('Enter a valid date.');return d;};
function validOutcome(value:unknown):CourtOutcome|undefined{
 if(value===undefined||value===null)return;
 if(typeof value!=='object'||Array.isArray(value))throw new AppError('Choose a court disposition.');
 const x=value as Record<string,unknown>,result=x.result as CourtOutcome['result'],on=date(x.on);
 if(!courtResults.includes(result)||!on)throw new AppError('Choose the disposition and enter the date it happened.');
 const stage=x.stage as CourtOutcome['stage'],prevailingParty=field(x.prevailingParty,140),otherParty=field(x.otherParty,140);
 const settlementCents=x.settlementCents;
 if(result==='Settled'){
  if(!stage||!settlementStages.includes(stage))throw new AppError('Choose when the settlement was reached.');
  if(settlementCents!==undefined&&settlementCents!==null&&(typeof settlementCents!=='number'||!Number.isSafeInteger(settlementCents)||settlementCents<0||settlementCents>99999999999))throw new AppError('Enter a valid settlement amount.');
  return {result,on,stage,...(typeof settlementCents==='number'?{settlementCents}:{})};
 }
 if(stage||settlementCents!==undefined&&settlementCents!==null)throw new AppError('Settlement details are only available for a settlement.');
 return {result,on,...(prevailingParty?{prevailingParty}:{}),...(otherParty?{otherParty}:{})};
}
function policeRefs(value:unknown):PoliceReference[]{
 if(!Array.isArray(value)||value.length>40)throw new AppError('Add up to 40 law enforcement references.');
 const ids=new Set<string>();
 return value.map(x=>{if(!x||typeof x!=='object'||Array.isArray(x))throw new AppError('Enter a valid law enforcement reference.');const id=field(x.id,70,true),agency=field(x.agency,140),number=field(x.number,110),officer=field(x.officer,140),badge=field(x.badge,60);
 if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id)||!(agency||number||officer||badge))throw new AppError('Enter an agency, police report number, officer, or badge for each distinct reference.');ids.add(id);return {id,agency,number,officer,badge};});
}
const refKey=(s:string)=>s.trim().toUpperCase();
function refs(value:unknown,prior:string[]|undefined,own:string,byId=false):string[]{
 if(value===undefined)return [...(prior||[])];
 if(!Array.isArray(value)||value.length>30)throw new AppError('Link up to 30 related court records.');
 const pattern=byId?/^[A-Za-z0-9_-]{1,100}$/:/^[A-Za-z0-9][A-Za-z0-9 .:/-]{0,99}$/;
 const seen=new Set<string>();return value.map(raw=>{
  const ref=field(raw,100,true),key=byId?ref:refKey(ref);
  if(!pattern.test(ref)||(!byId&&!/\d/.test(ref))||key===(byId?own:refKey(own))||seen.has(key))throw new AppError('Choose distinct related court records. A case cannot link to itself.');
  seen.add(key);return ref;
 });
}
// Resolve explicit source references against authorized rows only. Cause numbers can repeat
// in different jurisdictions: ambiguity is resolved only by an explicit saved record ID.
export function relatedCourtRecords(current:Matter,visible:Matter[]):Matter[]{
 const counts=new Map<string,number>();
 for(const m of visible){if(m.number){const k=refKey(m.number);counts.set(k,(counts.get(k)||0)+1);}}
 const points=(from:Matter,to:Matter)=>Boolean(from.relatedMatterIds?.includes(to.id)||(to.number&&counts.get(refKey(to.number))===1&&from.relatedCauses?.some(n=>refKey(n)===refKey(to.number))));
 return visible.filter(other=>other.id!==current.id&&(points(current,other)||points(other,current))).sort((a,b)=>a.number.localeCompare(b.number)||a.title.localeCompare(b.title));
}
export function prepareMatter(input:Record<string,unknown>,current:Matter|undefined,v:Viewer,now:Date):Matter{
 if(!docketAccess(v,true))throw new ForbiddenError();return prepareAuthorizedMatter(input,current,v,now);
}
// Pure validation. Callers must first authorize the selected docket or exact account destination.
export function prepareAuthorizedMatter(input:Record<string,unknown>,current:Matter|undefined,v:Viewer,now:Date):Matter{
 if((current?.version||0)!==input.version||current&&input.id!==current.id||!current&&input.id)throw new ConflictError('This court record changed. Refresh the docket before editing.');
 const accountId=input.accountId===undefined?current?.accountId||'':field(input.accountId,150);
 if(accountId&&!/^[a-zA-Z0-9:_-]+$/.test(accountId))throw new AppError('Choose a valid property.');
 const title=field(input.title,150,true),number=field(input.number,100),dueFor=field(input.dueFor,120),dueOn=date(input.dueOn),filedOn=date(input.filedOn);
 if(!caseTypes.includes(input.type as Matter['type'])||!['Open','Closed','Outcome Unverified'].includes(String(input.status)))throw new AppError('Choose a case type and status.');
 if(!!dueFor!==!!dueOn)throw new AppError('Enter both a deadline date and what is due.');
 const newStatement=field(input.statement,2000),outcome=validOutcome(input.newOutcome);
 if(input.status==='Closed'&&current?.status!=='Closed'&&(!newStatement||!outcome))throw new AppError('Choose a disposition and add a brief statement before closing the matter.');
 if(outcome&&!newStatement)throw new AppError('Add a brief statement explaining the recorded disposition.');
 const lawEnforcement=input.lawEnforcement===undefined?current?.lawEnforcement||[]:policeRefs(input.lawEnforcement),courtName=input.courtName===undefined?current?.courtName||'':field(input.courtName,180),courtContact=input.courtContact===undefined?current?.courtContact||'':field(input.courtContact,240);
 const relatedCauses=refs(input.relatedCauses,current?.relatedCauses,number),relatedMatterIds=refs(input.relatedMatterIds,current?.relatedMatterIds,current?.id||'',true);
 const causeCategory=input.causeCategory===undefined?current?.causeCategory||'':field(input.causeCategory,100);
 if(causeCategory==='Other')throw new AppError('Name the specific cause when choosing Other.');
 const src=input.appearances;if(!Array.isArray(src)||src.length>150)throw new AppError('Enter a valid appearance list.');
 const ids=new Set<string>(),appearances:Appearance[]=src.map(a=>{if(!a||typeof a!=='object'||!a.date||!appearanceStates.includes(a.status))throw new AppError('Each appearance needs a date and status.');const id=a.id||crypto.randomUUID();if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,70}$/.test(id)||ids.has(id))throw new AppError('Use distinct appearances.');ids.add(id);const day=date(a.date),time=field(a.time,5);if(time)hearingInstant(day,time);return {id,label:field(a.label,90,true),date:day,...(time?{time}:{}),status:a.status};});
 if(current?.appearances.some(a=>!ids.has(a.id)))throw new AppError('Mark a recorded appearance Cancelled or Continued to keep its history.');
 const at=now.toISOString();
 return {...(current?.propertyLinkHistory?{propertyLinkHistory:current.propertyLinkHistory}:{}),...(current?.hearingFacts?{hearingFacts:current.hearingFacts}:{}),...(accountId?{accountId}:{}),id:current?.id||crypto.randomUUID(),version:(current?.version||0)+1,title,number,type:input.type as Matter['type'],status:input.status as Matter['status'],filedOn,dueOn,dueFor,appearances,lawEnforcement,courtName,courtId:input.courtId===undefined?current?.courtId:field(input.courtId,100),assignedJudge:input.assignedJudge===undefined?current?.assignedJudge:field(input.assignedJudge,180),assignedJudgeId:input.assignedJudgeId===undefined?current?.assignedJudgeId:field(input.assignedJudgeId,100),courtContact,causeCategory,relatedCauses,relatedMatterIds,files:current?.files||[],createdAt:current?.createdAt||at,createdBy:current?.createdBy||v.name,updatedAt:at,updatedBy:v.name,actorId:v.id,statements:[...(current?.statements||[]),...(newStatement?[{text:newStatement,by:v.name,byId:v.id,at,...(outcome?{outcome}:{})}]:[])]};
}
