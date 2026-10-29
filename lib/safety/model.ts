import type {Row} from '@/lib/accounts/model';
import {today} from '@/lib/accounts/model';
import {AppError,ForbiddenError,ConflictError} from '@/lib/shared/errors';
import type {Viewer} from '@/lib/finance/model';
import {safetyAccess,safetyReviewer} from './access';
export type LinkedVehicle={vin:string;plate:string;plateState:string;description:string;relationship:string};
export type SafetyAlert={id:string;caseId:string;name:string;accountName:string;vehicle:string;date:string;reason:string};
export const normalizeVin=(v:unknown)=>String(v||'').replace(/\s/g,'').toUpperCase();
export const normalizePlate=(v:unknown)=>String(v||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
export const validVin=(v:unknown)=>/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(v));
export function linkedVehicles(r:Row):LinkedVehicle[]{try{const a=JSON.parse(String(r.vehiclesJson||'[]'));return Array.isArray(a)?a:[];}catch{return [];}}
export function exactVehicle(a:Partial<LinkedVehicle>,b:Partial<LinkedVehicle>|Row){if(validVin(a.vin)&&validVin(b.vin))return normalizeVin(a.vin)===normalizeVin(b.vin);return !!(validVin(a.vin)&&validVin(b.vin)&&normalizeVin(a.vin)===normalizeVin(b.vin)||normalizePlate(a.plate)&&normalizePlate(a.plate)===normalizePlate(b.plate)&&a.plateState&&b.plateState&&String(a.plateState).toUpperCase()===String(b.plateState).toUpperCase());}
export const vehicleLabel=(v:Partial<LinkedVehicle>|Row)=>[v.description||('vehicle' in v?v.vehicle:''),normalizePlate(v.plate)&&[v.plate,v.plateState].filter(Boolean).join(' '),validVin(v.vin)?'VIN '+v.vin:''].filter(Boolean).join(' · ');
export function matchingCases(all:Row[],vehicle:Partial<LinkedVehicle>|Row){return all.filter(r=>r.kind==='trespass'&&linkedVehicles(r).some(v=>exactVehicle(v,vehicle)));}
// Matching an old history record does not make it a new safety incident.
export function safetyAlerts(all:Row[],vehicleRows:Row[]=[],day=today()):SafetyAlert[]{
 const reviews=new Set(all.filter(r=>r.kind==='safetyReview').map(r=>r.alertId)),out:SafetyAlert[]=[];
 const cases=all.filter(r=>r.kind==='trespass');
 for(const c of cases){
  const encounters=all.filter(r=>r.kind==='safetyEvent'&&r.caseId===c.id&&r.raiseAlert===true);
  if(c.watchEnabled!==false)for(const r of vehicleRows){const date=String(r.towDate||r.receivedDate||r.date||'').slice(0,10);if(date&&date>=String(c.watchFrom||'9999')&&date<=day&&r.status!=='Voided'&&linkedVehicles(c).some(v=>exactVehicle(v,r)))encounters.push(r);}
  for(const e of encounters){const id=c.id+'::'+e.id;if(reviews.has(id))continue;out.push({id,caseId:c.id,name:c.name,accountName:all.find(a=>a.id===c.accountId)?.name||String(c.location||'Company yard'),vehicle:vehicleLabel(e)||linkedVehicles(c).map(vehicleLabel).join('; '),date:String(e.encounterDate||e.towDate||e.receivedDate||e.date||''),reason:e.kind==='safetyEvent'?String(e.staffGuidance||'Reported safety incident. Contact Dispatch for assistance.'):'A vehicle associated with a trespass record has returned. Contact Dispatch before assisting.'});}
 }
 return out.sort((a,b)=>b.date.localeCompare(a.date));
}
export const companyPremises='Parking & Towing Enforcement, 7511 Dee Gabriel Collins Rd, Austin TX 78744';
export const behaviorOptions=['Verbal threats','Threats of physical harm','Threats to damage property','Harassment / abusive conduct','Refused to leave','Unauthorized entry','Forced entry / gate damage','Vehicle taken without authorization','Property damage','Physical aggression','Other'];
export const dispositionOptions=['Follow-up complete','No further action needed','CTW issued; follow-up complete','CTW requested but not issued; follow-up complete','Referred to law enforcement','Property management informed; follow-up complete','Duplicate record','Other'];
export const caseFields=['name','aliases','accountId','incidentDate','location','behavior','behaviorTags','warningStatus','warningDate','warningRequestedDate','nonIssueReason','warningScope','agency','officer','caseNumber','investigationStatus','charges','warrantStatus','legalSource','verifiedDate','assignee','followUpDate','propertyCommunication','communicationStatus','caseStatus','dispositionOutcome','finalDisposition','dispositionDate','watchEnabled','watchReason','vehiclesJson'];
export const caseOptions:Record<string,string[]>={warningStatus:['Not requested','Requested','Requested but not issued','Issued','Not issued','Revoked'],investigationStatus:['Reported','Under investigation','Referred for charges','Closed'],warrantStatus:['Not confirmed','Reported active','Confirmed active','Cleared / recalled'],caseStatus:['Open','Following up','Resolved'],nonIssueReason:['Officer declined','Officer did not respond','Person left before officer arrived','Person could not be located','Insufficient information','Reason not provided','Other'],communicationStatus:['Not needed','Not yet contacted','Contact attempted','Property management informed','Awaiting response'],dispositionOutcome:dispositionOptions};
const managementFields=['dispositionOutcome','caseStatus','finalDisposition','dispositionDate','watchEnabled','watchReason'];
export function checkedText(value:unknown,label:string,max=6000){if(value===undefined)return '';if(typeof value!=='string'||value.length>max)throw new AppError('Enter a valid '+label+'.');return value.trim();}
export function checkedDate(value:unknown,label:string,allowFuture=false,day=today()){const s=checkedText(value,label,10);if(s&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s||!allowFuture&&s>day))throw new AppError('Enter a valid '+label+(allowFuture?'.':' that is not in the future.'));return s;}
export function prepareCase(input:Record<string,unknown>,old:Row|undefined,v:Viewer,all:Row[],day=today()):Row{
 if(!safetyAccess(v,true))throw new ForbiddenError();if(old&&old.version!==input.version)throw new ConflictError();
 const next:Row={...old,id:old?.id||crypto.randomUUID(),kind:'trespass',version:old?.version||0,name:old?.name||'',caseStatus:old?.caseStatus||'Open',watchEnabled:old?.watchEnabled??true,watchFrom:old?.watchFrom||day};
 for(const key of caseFields){if(input[key]===undefined)continue;
  if(managementFields.includes(key)&&!safetyReviewer(v)&&input[key]!==next[key])throw new ForbiddenError('An Account Manager or department head must change case disposition or vehicle alerts.');
  if(key==='watchEnabled'){if(typeof input[key]!=='boolean')throw new AppError('Choose whether to watch for returning vehicles.');next[key]=input[key] as boolean;continue;}
  if(key==='behaviorTags'){if(!Array.isArray(input[key])||!(input[key] as unknown[]).every(x=>typeof x==='string'&&behaviorOptions.includes(x)))throw new AppError('Choose the observed behaviors.');next[key]=[...new Set(input[key] as string[])];continue;}
  next[key]=checkedText(input[key],key,key==='vehiclesJson'?18000:6000);
  if(caseOptions[key]&&next[key]&&!caseOptions[key].includes(String(next[key])))throw new AppError('Choose a valid '+key+'.');
 }
 if(!caseOptions.caseStatus.includes(String(next.caseStatus)))throw new AppError('Choose a case status.');
 // Criminal Trespass Warnings are issued for the company’s own yard; keep the legal premises consistent on every record.
 next.location=companyPremises;next.warningScope=companyPremises;
 if(!next.name||!next.incidentDate||!(next.behavior||(next.behaviorTags as string[]|undefined)?.length))throw new AppError('Enter the person’s name, incident date, and select or describe the observed behavior.');
 if((next.behaviorTags as string[]|undefined)?.includes('Other')&&!next.behavior)throw new AppError('Briefly describe the other behavior.');
 if(next.caseStatus==='Resolved'&&old?.caseStatus!=='Resolved'&&!next.dispositionDate)next.dispositionDate=day;
 for(const k of ['incidentDate','warningDate','warningRequestedDate','verifiedDate','dispositionDate','followUpDate'])next[k]=checkedDate(next[k],k,k==='followUpDate',day);
 if(next.accountId&&!all.some(a=>a.kind==='account'&&a.id===next.accountId))throw new AppError('Choose an existing property.');
 if(next.warningStatus==='Issued'&&(!next.warningDate||!next.warningScope))throw new AppError('Record when and where the trespass warning applies.');
 if((next.charges||['Reported active','Confirmed active','Cleared / recalled'].includes(String(next.warrantStatus)))&&(!next.legalSource||!next.verifiedDate))throw new AppError('Record the source and date for charges or warrant information.');
 if(next.caseStatus==='Resolved'&&(!(next.dispositionOutcome||next.finalDisposition)||!next.dispositionDate))throw new AppError('Choose a final disposition before resolving the case.');
 if(next.caseStatus==='Resolved'&&next.dispositionOutcome==='Other'&&!next.finalDisposition)throw new AppError('Briefly describe the other final disposition.');
 if(old&&next.watchEnabled!==old.watchEnabled&&!next.watchReason)throw new AppError('Explain the change to returning-vehicle alerts.');
 let list:unknown;try{list=JSON.parse(String(next.vehiclesJson||'[]'));}catch{throw new AppError('Review associated vehicles.');}
 if(!Array.isArray(list)||list.length>12)throw new AppError('Add at most 12 associated vehicles.');
 next.vehiclesJson=JSON.stringify(list.map((a:Record<string,unknown>)=>{if(!a||typeof a!=='object')throw new AppError('Review associated vehicles.');const r:LinkedVehicle={vin:normalizeVin(a.vin),plate:normalizePlate(a.plate),plateState:checkedText(a.plateState,'plate state',3).toUpperCase(),description:checkedText(a.description,'vehicle description',300),relationship:checkedText(a.relationship,'vehicle association',300)};if(r.vin&&!validVin(r.vin))throw new AppError('VINs must contain all 17 valid characters.');if(r.plate.length>12||r.plateState&&!/^[A-Z]{2,3}$/.test(r.plateState)||r.plate&&!r.plateState)throw new AppError('Enter the plate’s state / province with the complete plate.');if(!r.vin&&!r.plate&&!r.description)throw new AppError('Describe the vehicle or enter its VIN or plate.');return r;}));
 return next;
}
export function evidenceMime(name:string,bytes:Uint8Array){const s=String.fromCharCode(...bytes.slice(0,12));if(s.startsWith('%PDF-'))return 'application/pdf';if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';if(s.startsWith('RIFF')&&s.slice(8)==='WEBP')return 'image/webp';if(s.slice(4,8)==='ftyp'&&/\.(mp4|mov)$/i.test(name))return /\.mov$/i.test(name)?'video/quicktime':'video/mp4';if([26,69,223,163].every((v,i)=>bytes[i]===v)&&/\.webm$/i.test(name))return 'video/webm';throw new AppError('Choose a JPEG, PNG, WebP, PDF, MP4, MOV, or WebM file.');}
