import type {Row} from '../accounts/model';
import type {HrRecord} from '../hr/model';
import type {DamageIntake} from './damage-intake-model';
import type {Matter} from './docket-model';
import type {RegisterRecord} from './register-model';
import {processorActions,isRecoveryCost} from './chargeback.ts';
import {documentTypeLabel} from './document-types.ts';
import type {Def,ReportDesk} from './reports-catalog.ts';
import {jurisdiction} from './docket-import.ts';
import {auditDay} from '../shared/audit-format.ts';
import {businessToday} from '../year-history/model.ts';
export type ReportLine={source:ReportDesk;id:string;name:string;group:string;status:string;day:string;cents?:number|null};
export type ReportData={report:Def;today:string;generatedAt:string;rows:ReportLine[]};
export type Dataset={court?:Matter[];properties?:Map<string,string>;propertyNamesAllowed?:boolean;propertyClaims?:Row[];assets?:HrRecord[];intakes?:DamageIntake[];register?:RegisterRecord[]};
const unknown='Not Recorded',str=(x:unknown)=>typeof x==='string'?x.trim():'';
const live=(x:Record<string,unknown>)=>!x.deletedAt&&!x.example&&!x.sample&&!x.trainingSample&&!x.isSample&&!x.isDemo;
const day=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&auditDay(x)?x:'';
/** Never merge on the person, property, vehicle description or date alone. Prefer an existing native
 * investigation only for an explicit intake link or a single matching, non-placeholder claim number. */
export function uniqueIncidentIntakes(intakes:DamageIntake[],properties:Row[],assets:HrRecord[]):DamageIntake[]{
 const linked=new Set<string>(),references=new Map<string,number>(),seen=new Set<string>();
 const ref=(x:unknown)=>{const k=str(x).toLowerCase().replace(/\s+/g,' ');return k&&/[0-9]/.test(k)&&!/^0+$/.test(k)?k:'';};
 const index=(d:Record<string,unknown>)=>{const id=str(d.damageIntakeId);if(id)linked.add(id);const k=ref(d.insurerClaimNumber);if(k)references.set(k,(references.get(k)||0)+1);};
 for(const r of properties)if(r.kind==='claim'&&live(r))index(r);
 for(const r of assets)if(r.kind==='assetClaim'&&live(r.data))index(r.data);
 return intakes.filter(i=>{if(seen.has(i.id)||linked.has(i.id)||references.get(ref(i.claimReference))===1)return false;seen.add(i.id);return true;});
}
const instantDay=(x:string)=>!x||!Number.isFinite(Date.parse(x))?'':businessToday(new Date(x));
function band(d:string,today:string){if(!d)return 'Missing Due Date';const n=Math.round((Date.parse(d+'T12:00Z')-Date.parse(today+'T12:00Z'))/86400000);return n<0?'Past Due':n===0?'Due Today':n<=30?'Next 30 Days':n<=90?'31–90 Days':'More Than 90 Days';}
export function buildReport(def:Def,s:Dataset,now=new Date()):ReportData{
 const today=businessToday(now),out:ReportLine[]=[],add=(id:string,name:string,group:string,status:string,d:string,cents?:number|null)=>out.push({source:def.desk,id,name:name||'Untitled Record',group:group||unknown,status:status||unknown,day:day(d),...(cents!==undefined?{cents}:{})});
 const prop=(id:string)=>!id?'No Linked Property':s.propertyNamesAllowed===false?'Linked Property (Restricted)':s.properties?.get(id)||'Linked Property (Name Unavailable)';
 if(def.desk==='hearings')for(const m of s.court||[]){const latest=[...m.statements].reverse().find(x=>x.outcome)?.outcome;const o=m.status==='Outcome Unverified'?undefined:latest;
  const level=jurisdiction(m.courtName||'').split('|')[1];
  const row=(g:string,d=m.filedOn)=>add(m.id,m.title,g,m.status,d);
  switch(def.id){
   case 'lawsuit-cause':if(m.type==='Lawsuit')row(str((m as Matter&{causeCategory?:string}).causeCategory));break;
   case 'proceeding-type':row(m.type);break;case 'court-status':row(m.status);break;case 'courthouse':row(m.courtName||'');break;case 'court-property':row(prop(m.accountId||''));break;
   case 'tow-rulings':case 'jp-rulings':case 'county-outcomes':if(def.id==='county-outcomes'?level==='at-law':m.type==='Tow Hearing'&&(def.id==='tow-rulings'||level==='jp'))row(o?.result||(m.status==='Open'?'Open / No Recorded Ruling':'Outcome Unverified'),o?.on||'');break;
   case 'appearances':for(const a of m.appearances)add(m.id,m.title+' · '+a.label,a.date?.slice(0,7),a.status,a.date);break;
   case 'settlement-timing':if(o?.result==='Settled')row(o.stage||unknown,o.on);break;
  }
 }
 if(def.desk==='damage'){
  const claim=(id:string,title:string,source:string,status:string,opened:string,property:string,stage:string,settled:string,cents:number|null,paidDate:string)=>{
   switch(def.id){
    case 'damage-source':add(id,title,source,status,opened);break;
    case 'damage-status':add(id,title,status,status,opened);break;
    case 'damage-property':if(source==='Property'||source==='Incident Intake'&&property)add(id,title,property,status,opened);break;
    case 'damage-month':add(id,title,day(opened).slice(0,7),status,opened);break;
    case 'damage-paid':if(source==='Property'&&status==='Paid')add(id,title,property,status,paidDate,cents);break;
    case 'damage-settled':if(stage||settled)add(id,title,stage,status,settled);break;
   }};
  for(const r of s.propertyClaims||[])if(r.kind==='claim'&&live(r))claim('claim:'+r.id,r.name,'Property',str(r.status)||'Investigating',str(r.date),prop(str(r.accountId)),str(r.settlementStage),str(r.settlementDate),typeof r.paidAmount==='number'&&Number.isFinite(r.paidAmount)?Math.round(r.paidAmount*100):null,str(r.paidDate));
  for(const r of s.assets||[])if(r.kind==='assetClaim'&&live(r.data)){const d=r.data;claim('asset-claim:'+r.id,str(d.title),'Employee Asset',str(d.status)||'Open',str(d.reportedDate),'',str(d.settlementStage),str(d.settlementDate),null,'');}
  for(const r of uniqueIncidentIntakes(s.intakes||[],s.propertyClaims||[],def.id==='damage-property'?[]:s.assets||[])){
   // An allegation or a paid invoice attached as evidence does not establish a company payment or settlement.
   const name=str(r.propertyName),property=!name?'':s.propertyNamesAllowed!==true?'Reported Property (Restricted)':name;
   claim('intake:'+r.id,r.title,'Incident Intake',r.status,r.reportedOn,property,'','',null,'');
  }
 }
 for(const r of s.register||[]){if(r.section!==def.desk)continue;const created=instantDay(r.createdAt),addReg=(g:string,d=created,c?:number|null)=>add(r.id,r.title,g,r.status,d,c);
  if(def.id==='tdlr-topic'){addReg((r as RegisterRecord&{tdlr?:{topic?:string}}).tdlr?.topic||'Unclassified');continue;}if(def.id==='tdlr-type'){addReg(r.category);continue;}if(def.id==='tdlr-status'){addReg(r.status);continue;}
  if(def.id==='calendar-due'||def.id==='licenses-due'){if(r.status!=='Closed')addReg(band(r.dueOn,today),r.dueOn);continue;}
  if(def.id==='file-types'){for(const f of r.files)addReg(documentTypeLabel(f),instantDay(f.at));continue;}
  if(r.category!=='Chargeback')continue;
  const c=r.chargeback,processor=c?.processor==='Other'?(c.other||'Other'):c?.processor||unknown;
  switch(def.id){
   case 'processors':addReg(processor);break;case 'bank-outcomes':addReg(c?.decision||unknown);break;case 'responses':addReg(c?.reply||unknown);break;case 'mail':addReg(c?.mail||unknown);break;
   case 'deadlines':if(r.status!=='Closed')for(const a of processorActions(c,r.amountCents))add(r.id,r.title,a.title,band(a.due,today),a.due);break;
   case 'costs':case 'repayments':for(const e of c?.entries||[])if((def.id==='repayments')===!isRecoveryCost(e))addReg(def.id==='repayments'?processor:e.kind,e.day,e.kind==='Recovery Refund'?-e.cents:e.cents);break;
  }
 }
 return {report:def,today,generatedAt:now.toISOString(),rows:out.sort((a,b)=>(b.day||'').localeCompare(a.day)||a.name.localeCompare(b.name))};
}
export type Filters={from?:string;to?:string;q?:string;status?:string;group?:string};
export function filteredLines(rows:ReportLine[],f:Filters){const tokens=(f.q||'').toLowerCase().trim().split(/\s+/).filter(Boolean);return rows.filter(r=>(!f.from||r.day&&r.day>=f.from)&&(!f.to||r.day&&r.day<=f.to)&&(!f.status||r.status===f.status)&&(!f.group||r.group===f.group)&&tokens.every(t=>[r.name,r.status,r.group,r.day].join(' ').toLowerCase().includes(t)));}
export function breakdown(rows:ReportLine[],money=false){const groups=new Map<string,{group:string;value:number;n:number;known:number}>();for(const r of rows){const g=groups.get(r.group)||{group:r.group,value:0,n:0,known:0};g.n++;if(!money||r.cents!=null){g.value+=money?r.cents!:1;g.known++;}groups.set(g.group,g);}return [...groups.values()].sort((a,b)=>b.value-a.value||a.group.localeCompare(b.group));}
export function reportRate(def:Def,rows:ReportLine[]){if(!def.rate)return null;const inputs=def.rate==='court'?['PTE Won','PTE Lost']:def.rate==='bank'?['Merchant Prevailed','Cardholder Prevailed']:[];const denominator=inputs.length?rows.filter(r=>inputs.includes(r.group)).length:rows.length,numerator=rows.filter(r=>r.group===(inputs[0]||'PTE Submitted')).length;return {label:def.rate==='court'?'PTE Win Rate':def.rate==='bank'?'Merchant Win Rate':'PTE Submission Coverage',numerator,denominator,value:denominator?Math.round(1000*numerator/denominator)/10:null};}
export function csvForReport(data:ReportData,rows:ReportLine[],f:Filters={}){const safe=(x:string|number)=>{const s=String(x);return '"'+(/^[\s]*[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';};const rate=reportRate(data.report,rows);const lines:(string|number)[][]=[['CONFIDENTIAL · Parking & Towing Enforcement'],[data.report.title],['Generated (UTC)',data.generatedAt],['Date Basis',data.report.basis],['Filter: From',f.from||'Any','Through',f.to||'Any','Status',f.status||'All','Group',f.group||'All','Search',f.q||''],['Matching '+data.report.unit,rows.length],...(rate?[[rate.label,rate.value===null?'Not Available':rate.value+'%',rate.numerator+' of '+rate.denominator]]:[]),[],['Record','Group','Status',data.report.basis,...(data.report.money?['Amount (USD)']:[]),'Source Record ID'],...rows.map(r=>[r.name,r.group,r.status,r.day,...(data.report.money?[r.cents==null?'Not Recorded':(r.cents/100).toFixed(2)]:[]),r.id])];return '\ufeff'+lines.map(r=>r.map(safe).join(',')).join('\r\n');}
