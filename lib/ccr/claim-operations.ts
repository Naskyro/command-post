import type {FinRecord} from '../finance/model';
import type {Row} from '../accounts/model';
import {displayPersonName} from '../people/display-name.ts';
import {isDriverPerson} from '../people/driver-role.ts';
import {AppError} from '../shared/errors.ts';
import {damageFacts,damageFactFields} from './damage-facts.ts';

export const incidentAnswers=['Yes','No','Unknown'] as const;
export type IncidentAnswer=typeof incidentAnswers[number];
export const incidentFields=['accidentInvolved','driverInjury','ownerInjury'] as const;
export const claimOperationalFields=['driverId','contactId','accidentInvolved','accidentOn','driverInjury','ownerInjury','incidentDate','towbookReference','claimant','claimantEmail','claimantPhone','nextFollowUp',...damageFactFields] as const;
export type ClaimOperationalKey=typeof claimOperationalFields[number];
export type ClaimOperations=Partial<Record<ClaimOperationalKey,string>>&{driverName?:string;driverStatus?:string;contactName?:string};
export type ClaimChoice={id:string;name:string;detail?:string};
export type ClaimDriverChoice=ClaimChoice&{status:string};
export type ClaimChoices={drivers:ClaimDriverChoice[];accounts:ClaimChoice[];contacts:ClaimChoice[]};
const text=(v:unknown)=>typeof v==='string'?v.trim():'';
const real=(r:Record<string,unknown>)=>!r.deletedAt&&!r.example&&!r.sample&&!r.isSample&&!r.trainingSample&&!r.isDemo;
export function driverChoices(staff:FinRecord[]):ClaimDriverChoice[]{
 return staff.filter(p=>{
  return p.kind==='person'&&real(p)&&['Active','Former','Leave'].includes(text(p.status))&&isDriverPerson(p,staff);
 }).map(p=>({id:p.id,name:displayPersonName(p)||'Unnamed Driver',status:text(p.status),detail:text(p.status)==='Former'?'Former Driver':text(p.status)==='Leave'?'On Leave':'Active Driver'})).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'})||a.id.localeCompare(b.id));
}
export function searchClaimChoices(options:ClaimChoice[],query=''):ClaimChoice[]{const norm=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),needle=norm(query);return options.filter(o=>!needle||norm(o.name+' '+(o.detail||'')).includes(needle)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'})||a.id.localeCompare(b.id));}
export function operationalChoices(staff:FinRecord[],rows:Row[]):ClaimChoices{
 const sort=(a:ClaimChoice,b:ClaimChoice)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'})||a.id.localeCompare(b.id);
 return {drivers:driverChoices(staff),accounts:rows.filter(r=>r.kind==='account'&&real(r)).map(r=>({id:r.id,name:r.name,detail:[r.address,r.status].filter(Boolean).join(' · ')})).sort(sort),contacts:rows.filter(r=>r.kind==='contact'&&real(r)).map(r=>({id:r.id,name:r.name,detail:text(r.title)})).sort(sort)};
}
const allowed=new Set<string>(claimOperationalFields);
export function prepareClaimOperations(patch:Record<string,unknown>,old:Record<string,unknown>,staff:FinRecord[],rows:Row[],today:string):ClaimOperations{
 if(Object.keys(patch).some(k=>!allowed.has(k)))throw new AppError('Only operational case details may be changed with this update.');
 const next:ClaimOperations={};
 for(const key of claimOperationalFields){
  if(!Object.hasOwn(patch,key))continue;
  const value=patch[key];if(typeof value!=='string'||value.length>180||/[\u0000-\u001f\u007f]/.test(value))throw new AppError('Enter a valid case detail.');next[key]=value.trim();
 }
 for(const key of incidentFields)if(next[key]!==undefined&&next[key]!==''&&!(incidentAnswers as readonly string[]).includes(next[key]!))throw new AppError('Choose Yes, No, or Unknown for the incident questions.');
 for(const key of ['accidentOn','incidentDate','nextFollowUp'] as const){const value=next[key];if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00Z'))||new Date(value+'T12:00Z').toISOString().slice(0,10)!==value||(key!=='nextFollowUp'&&value>today)))throw new AppError('Use an actual incident date on or before today.');}
 if(next.claimantEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.claimantEmail))throw new AppError('Enter a valid claimant email address.');
 if(next.driverId!==undefined&&next.driverId!==text(old.driverId)){
  const driver=driverChoices(staff).find(p=>p.id===next.driverId);if(next.driverId&&!driver)throw new AppError('Choose an active or former driver from the personnel roster.');
  next.driverName=driver?.name||'';next.driverStatus=driver?.status||'';
 }
 if(next.contactId!==undefined&&next.contactId!==text(old.contactId)){
  const contact=rows.find(r=>r.id===next.contactId&&r.kind==='contact'&&real(r));if(next.contactId&&!contact)throw new AppError('Choose an existing property contact.');next.contactName=contact?.name||'';
 }
 if(damageFactFields.some(k=>Object.hasOwn(next,k)))damageFacts({...old,...next},{},today);
 return next;
}
export function pickClaimOperations(record:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(claimOperationalFields.filter(k=>Object.hasOwn(record,k)).map(k=>[k,record[k]]));}
export type ClaimCaseUpdate={at:string;by:string;byId:string;note:string;changes:Record<string,{before:string;after:string}>};
export function claimCaseUpdates(raw:unknown):ClaimCaseUpdate[]{if(typeof raw!=='string'||!raw)return [];try{const rows=JSON.parse(raw);return Array.isArray(rows)?rows.filter(x=>x&&typeof x.at==='string'&&typeof x.note==='string'&&x.changes&&typeof x.changes==='object'):[];}catch{return [];}}
export function operationalChanges(old:Record<string,unknown>,next:Record<string,unknown>){return Object.fromEntries([...claimOperationalFields,'driverName','driverStatus','contactName','accountId','linkedAccountName'].filter(k=>Object.hasOwn(next,k)&&text(old[k])!==text(next[k])).map(k=>[k,{before:text(old[k]),after:text(next[k])}]));}
