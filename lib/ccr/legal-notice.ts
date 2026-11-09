import {AppError} from '../shared/errors.ts';
import {auditDay} from '../shared/audit-format.ts';

export const legalTypes=['Cease and Desist','Demand Letter','Legal Threat','Attorney Correspondence','Other Legal Notice'] as const;
export const legalDirections=['Sent','Received'] as const;
export const legalStages=['Draft','Open','Awaiting Response','Response Received','Resolved'] as const;
export const legalMailStages=['Not Confirmed','Submitted for Mailing','Production Reported','Mailed','Delivered','Returned or Unclaimed'] as const;
export type LegalAccountChoice={id:string;name:string;detail?:string};
export type LegalMailing={
 id:string;recipient:string;address:string;provider:string;tracking:string;stage:typeof legalMailStages[number];
 submittedOn:string;submittedTime:string;productionOn:string;productionTime:string;timeZone:string;mailedOn:string;
 deliveryOn:string;sourceRef:string;deliveryRef:string;billedOn:string;billedCents:number|null;billedRef:string;notes:string;
};
export type LegalNotice={
 direction:typeof legalDirections[number];type:typeof legalTypes[number];stage:typeof legalStages[number];
 otherParty:string;organization:string;address:string;email:string;phone:string;documentOn:string;sentOn:string;receivedOn:string;
 responseDue:string;deadlineRef:string;responseOn:string;responseRef:string;resolvedOn:string;resolutionRef:string;
 accountId:string;accountName:string;relatedReference:string;summary:string;counsel:string;counselContact:string;mailings:LegalMailing[];
};
export function blankLegalMailing():LegalMailing{return {id:crypto.randomUUID(),recipient:'',address:'',provider:'',tracking:'',stage:'Not Confirmed',submittedOn:'',submittedTime:'',productionOn:'',productionTime:'',timeZone:'',mailedOn:'',deliveryOn:'',sourceRef:'',deliveryRef:'',billedOn:'',billedCents:null,billedRef:'',notes:''};}
export function blankLegalNotice():LegalNotice{return {direction:'Sent',type:'Cease and Desist',stage:'Draft',otherParty:'',organization:'',address:'',email:'',phone:'',documentOn:'',sentOn:'',receivedOn:'',responseDue:'',deadlineRef:'',responseOn:'',responseRef:'',resolvedOn:'',resolutionRef:'',accountId:'',accountName:'',relatedReference:'',summary:'',counsel:'',counselContact:'',mailings:[]};}
const invalid=(message:string):never=>{throw new AppError(message);};
function text(v:unknown,max:number,label:string,multiline=false){if(v===undefined||v===null)return '';if(typeof v!=='string'||v.length>max||new RegExp(multiline?'[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]':'[\\u0000-\\u001f\\u007f]').test(v))return invalid('Check the '+label+' text and length.');return v.trim();}
function day(v:unknown,label:string){const s=text(v,10,label);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!auditDay(s)))return invalid('Enter a valid '+label+' date.');return s;}
function pick<T extends string>(v:unknown,values:readonly T[],label:string):T{if(!values.includes(v as T))return invalid('Select a listed '+label+'.');return v as T;}
function object(v:unknown,label:string):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))return invalid('Enter valid '+label+'.');return v as Record<string,unknown>;}
function chronology(a:string,b:string,label:string){if(a&&b&&a>b)invalid(label+' cannot be earlier than the preceding event.');}
function clock(v:unknown,on:string,label:string){const s=text(v,5,label);if(s&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)||!on))return invalid('Enter the '+label+' date before its time.');return s;}

export function checkedLegalMailings(value:unknown):LegalMailing[]{
 if(!Array.isArray(value)||value.length>40)return invalid('Use up to 40 mailing records per legal notice.');
 const ids=new Set<string>();
 return value.map(raw=>{
  const b=object(raw,'mailing details'),n=blankLegalMailing();
  n.id=text(b.id,64,'mailing ID');if(!/^[\w-]{1,64}$/.test(n.id)||ids.has(n.id))return invalid('Each mailing needs its own reference.');ids.add(n.id);
  n.recipient=text(b.recipient,240,'recipient');if(!n.recipient)return invalid('Enter the recipient for each mailing.');
  n.address=text(b.address,1000,'mailing address',true);n.provider=text(b.provider,100,'mailing provider');n.tracking=text(b.tracking,100,'tracking number');n.stage=pick(b.stage,legalMailStages,'mailing status');
  n.submittedOn=day(b.submittedOn,'submission');n.productionOn=day(b.productionOn,'production');n.mailedOn=day(b.mailedOn,'mailing');n.deliveryOn=day(b.deliveryOn,'delivery or return');
  n.submittedTime=clock(b.submittedTime,n.submittedOn,'submission');n.productionTime=clock(b.productionTime,n.productionOn,'production');n.timeZone=text(b.timeZone,80,'source time zone');
  if(n.timeZone){try{new Intl.DateTimeFormat('en',{timeZone:n.timeZone}).format();}catch{return invalid('Choose a recognized source time zone, or leave it blank if the document does not state one.');}}
  n.sourceRef=text(b.sourceRef,240,'mailing evidence reference');n.deliveryRef=text(b.deliveryRef,240,'delivery or return proof');n.billedOn=day(b.billedOn,'billing');n.billedRef=text(b.billedRef,240,'billing evidence reference');n.notes=text(b.notes,2400,'mailing notes',true);
  const cents=b.billedCents;n.billedCents=cents===undefined||cents===null?null:typeof cents==='number'&&Number.isSafeInteger(cents)&&cents>=0&&cents<=99999999999?cents:invalid('Enter the actual billed mailing amount in cents.');
  if(n.billedCents!==null&&(!n.billedOn||!n.billedRef))return invalid('A billed mailing amount needs its billing date and receipt or source reference.');
  if(n.stage==='Submitted for Mailing'&&(!n.submittedOn||!n.sourceRef))return invalid('Record the submission date and source before marking a letter submitted.');
  if(n.stage==='Production Reported'&&(!n.productionOn||!n.sourceRef))return invalid('Record the production date and source shown by the mailing provider.');
  if(n.stage==='Mailed'&&(!n.mailedOn||!n.sourceRef))return invalid('A confirmed mailing needs its mailing date and evidence reference.');
  if(['Delivered','Returned or Unclaimed'].includes(n.stage)&&(!n.deliveryOn||!n.deliveryRef))return invalid('A delivery or return status needs the event date and separate proof. A submission certificate alone does not establish delivery.');
  if(n.deliveryOn&&!n.deliveryRef)return invalid('Identify the proof for the delivery or return date.');
  chronology(n.submittedOn,n.productionOn,'Production');chronology(n.submittedOn,n.mailedOn,'Mailing');chronology(n.productionOn,n.mailedOn,'Mailing');chronology(n.mailedOn||n.productionOn||n.submittedOn,n.deliveryOn,'Delivery or return');
  return n;
 });
}

/** Directory choices are authoritative. Without them, preserve a saved link or clear it; never invent a new account link. */
export function checkedLegalNotice(value:unknown,old?:LegalNotice,accounts?:LegalAccountChoice[]):LegalNotice|undefined{
 if(value===undefined)return old;
 const b=object(value,'legal notice details'),n=blankLegalNotice();
 n.direction=pick(b.direction,legalDirections,'direction');n.type=pick(b.type,legalTypes,'notice type');n.stage=pick(b.stage,legalStages,'legal matter stage');
 n.otherParty=text(b.otherParty,300,'other party');if(!n.otherParty)return invalid('Enter the other person or organization named in the notice.');
 n.organization=text(b.organization,240,'organization');n.address=text(b.address,1000,'address',true);n.email=text(b.email,254,'email');n.phone=text(b.phone,80,'phone');
 if(n.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n.email))return invalid('Enter a valid contact email address.');
 n.documentOn=day(b.documentOn,'document');n.sentOn=day(b.sentOn,'sent');n.receivedOn=day(b.receivedOn,'received');n.responseDue=day(b.responseDue,'response deadline');n.responseOn=day(b.responseOn,'response');n.resolvedOn=day(b.resolvedOn,'resolution');
 n.deadlineRef=text(b.deadlineRef,240,'deadline reference');n.responseRef=text(b.responseRef,240,'response reference');n.resolutionRef=text(b.resolutionRef,240,'resolution reference');
 if(n.responseDue&&!n.deadlineRef)return invalid('Identify the letter, court order, or other source that states the response deadline.');
 if(n.stage==='Response Received'&&(!n.responseOn||!n.responseRef))return invalid('Record the response date and its document or message reference.');
 if(n.stage==='Resolved'&&(!n.resolvedOn||!n.resolutionRef))return invalid('Record the resolution date and supporting reference.');
 if(n.direction==='Received'&&n.stage==='Draft')return invalid('A received notice cannot be a draft. Choose Open or the current follow-up stage.');
 if(n.responseOn&&!n.responseRef)return invalid('Identify the document or message for the response date.');
 if(n.resolvedOn&&!n.resolutionRef)return invalid('Identify the evidence for the resolution date.');
 n.accountId=text(b.accountId,130,'account');n.accountName='';
 if(n.accountId){const chosen=accounts?.find(a=>a.id===n.accountId);if(chosen)n.accountName=chosen.name;else if(n.accountId===old?.accountId)n.accountName=old.accountName;else return invalid('Choose an existing account from the directory.');}
 n.relatedReference=text(b.relatedReference,300,'related case reference');n.summary=text(b.summary,6000,'matter summary',true);n.counsel=text(b.counsel,240,'counsel');n.counselContact=text(b.counselContact,400,'counsel contact');
 n.mailings=checkedLegalMailings(b.mailings??[]);
 return n;
}

export function legalMailingCost(n:LegalNotice){return n.mailings.reduce((sum,m)=>sum+(m.billedCents??0),0);}
export function legalResolutionProven(n:LegalNotice|undefined){return Boolean(n&&n.stage==='Resolved'&&n.resolvedOn&&n.resolutionRef);}
