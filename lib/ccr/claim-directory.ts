import type {Row} from '../accounts/model';
import type {DamageIntake} from './damage-intake-model';
import type {HrRecord} from '../hr/model';
import {assetEntries,oldPropertyClaim} from '../year-history/case-events.ts';
import {businessToday,historicalArchiveYear} from '../year-history/model.ts';
export type ClaimCard={id:string;key:string;source:'Property'|'Employee Asset'|'Support Email'|'Google Drive';title:string;subtitle:string;status:string;opened:string;next:string;closed:boolean;historical:boolean;major:boolean;search:string;property?:Row;asset?:HrRecord;intake?:DamageIntake};
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const live=(r:Record<string,unknown>)=>!r.deletedAt&&!r.example&&!r.sample&&!r.isSample&&!r.trainingSample&&!r.isDemo;
export function claimDirectory(accounts:Row[],assets:HrRecord[],today=businessToday(),intakes:DamageIntake[]=[]):ClaimCard[]{
 const properties=new Map(accounts.filter(r=>r.kind==='account').map(r=>[r.id,r.name]));
 const archival=new Set(assetEntries(assets).filter(e=>historicalArchiveYear(e,today)!==null).map(e=>e.id));
 const a=accounts.filter(r=>r.kind==='claim'&&live(r)).map((r):ClaimCard=>{
  const title=r.name||'Property Damage Claim',subtitle=properties.get(str(r.accountId))||'Property Not Recorded',status=str(r.status)||'Investigating';
  return {key:'claim:'+r.id,id:r.id,source:'Property',title,subtitle,status,opened:str(r.date),next:str(r.nextFollowUp),closed:['Paid','Closed without settlement'].includes(status),historical:oldPropertyClaim(r,today),major:r.claimPriority==='Major',search:[title,subtitle,r.vehicle,r.plate,r.vin,r.towbookReference,r.driverName,r.contactName,r.id,r.lawReportNumber,r.lawAgency,r.lawOfficer,r.insuranceCarrier,r.insurerClaimNumber].join(' ').toLowerCase(),property:r};
 });
 const b=assets.filter(r=>r.kind==='assetClaim'&&live(r.data)).map((r):ClaimCard=>{
  const d=r.data,title=str(d.title)||'Employee Asset Claim',subtitle=str(d.employeeName)||'Personnel Record',status=str(d.status)||'Open';
  return {key:'asset-claim:'+r.id,id:r.id,source:'Employee Asset',title,subtitle,status,opened:str(d.reportedDate),next:'',closed:['Resolved','Closed - No Recovery'].includes(status),historical:archival.has('asset-claim:'+r.id),major:false,search:[title,subtitle,r.id,d.driverName,d.source,d.lawReportNumber,d.lawAgency,d.lawOfficer,d.insuranceCarrier,d.insurerClaimNumber,(d.assetSnapshot as Record<string,unknown>|undefined)?.assetTag].join(' ').toLowerCase(),asset:r};
 });
 const mail=intakes.filter(r=>live(r)).map((r):ClaimCard=>({key:'intake:'+r.id,id:r.id,source:r.sourceKind==='Google Drive'?'Google Drive':'Support Email',title:r.title,subtitle:r.linkedAccountName||r.propertyName||r.vehicle||(r.sourceKind==='Google Drive'?'Archived Source Files':'Support Correspondence'),status:r.status,opened:r.reportedOn,next:'',closed:r.status==='Closed',historical:false,major:false,search:[r.title,r.summary,r.claimReference,r.propertyName,r.linkedAccountName,r.driverName,r.contactName,r.vehicle,r.status,...r.references.map(x=>x.subject)].filter(Boolean).join(' ').toLowerCase(),intake:r}));
 return [...a,...b,...mail].sort((a,b)=>Number(a.closed)-Number(b.closed)||Number(b.major)-Number(a.major)||(a.next||'9999').localeCompare(b.next||'9999')||b.opened.localeCompare(a.opened)||a.title.localeCompare(b.title)||a.key.localeCompare(b.key));
}
export const lookupClaim=(cards:ClaimCard[],id:string)=>cards.find(c=>c.key===id||c.id===id);
