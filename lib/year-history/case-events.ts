import type {Row} from '../accounts/model';
import type {Matter} from '../ccr/docket-model';
import type {HrRecord} from '../hr/model';
import {businessDate,businessToday,historicalArchiveYear,type YearEntry} from './model.ts';

const am='Account Management',ccr='Compliance, Claims & Recovery';
const first=(...vals:unknown[])=>vals.map(businessDate).find(Boolean)||'';
const txt=(x:unknown)=>typeof x==='string'?x.trim().slice(0,200):'';
const operational=(r:Row)=>!r.deletedAt&&!r.example&&!r.sample&&!r.isSample&&!r.trainingSample&&!r.isDemo;
const cents=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&Number.isSafeInteger(Math.round(x*100))?Math.round(x*100):undefined;
export function propertyClaimDates(r:Row){
 const terminal=['Paid','Closed without settlement'].includes(String(r.status));
 return {terminal,closedDate:terminal?(r.status==='Paid'?first(r.paidDate):first(r.reviewedAt))||undefined:undefined};
}
export function oldPropertyClaim(r:Row,today=businessToday()){return historicalArchiveYear(propertyClaimDates(r),today)!==null;}
export function propertyClaims(rows:Row[],module:string):YearEntry[]{
 const properties=new Map(rows.filter(r=>r.kind==='account').map(r=>[r.id,r.name]));
 return rows.filter(r=>r.kind==='claim'&&operational(r)).map(r=>{const {terminal,closedDate}=propertyClaimDates(r),openedDate=first(r.date,r.incidentDate);
  return {id:'claim:'+r.id,module,category:'damage-claim',kind:'Property Damage Claim',title:txt(r.name)||'Property Damage Claim',property:properties.get(String(r.accountId)),status:txt(r.status)||'Investigating',terminal,closedDate,openedDate,activityDate:closedDate||first(r.reviewedAt,r.submittedAt,openedDate),activityDates:[r.date,r.incidentDate,r.submittedAt,r.reviewedAt,r.paidDate].map(businessDate).filter(Boolean),...(r.status==='Paid'&&cents(r.paidAmount)!==undefined?{amountCents:cents(r.paidAmount)}:{})};});
}
export function releaseEntries(rows:Row[]):YearEntry[]{
 const properties=new Map(rows.filter(r=>r.kind==='account').map(r=>[r.id,r.name]));
 const names:Record<string,[string,string]>={'Full courtesy':['Courtesy Release','courtesy-release'],'Reduced charge':['Discounted Release','discounted-release'],'Unclassified':['Unclassified Release','unclassified-release'],'Refund':['Release Refund','other-release'],'Full payment':['Full-Payment Release','other-release']};
 return rows.filter(r=>r.kind==='courtesy'&&operational(r)).map(r=>{const [kind,category]=Object.hasOwn(names,String(r.releaseType))?names[String(r.releaseType)]:names.Unclassified,status=txt(r.status)||'Unrecorded';
  const completed=['Released','Imported'].includes(status),terminal=completed||['Declined','Voided'].includes(status),date=first(r.date);
  const closedDate=(completed?first(date,r.releasedAt):status==='Declined'?first(r.declinedAt):status==='Voided'?first(r.voidedAt):'')||undefined;
  const old=cents(r.originalCharges),charged=cents(r.amountCharged),w=cents(r.amountWaived)??(old!==undefined&&charged!==undefined&&old>=charged?old-charged:undefined);
  return {id:'release:'+r.id,module:am,kind,category,title:kind,property:properties.get(String(r.accountId)),status,terminal,activityDate:closedDate||date,activityDates:[date,r.requestedAt,r.approvedAt,r.releasedAt,r.declinedAt,r.voidedAt].map(businessDate).filter(Boolean),closedDate,openedDate:first(r.requestedAt)||(!completed?date:undefined),...(completed&&['courtesy-release','discounted-release'].includes(category)&&w!==undefined?{amountCents:w}:{})};});
}
type Span={start:string;end?:string};
export function courtEntries(editions:Matter[]):YearEntry[]{
 const groups=new Map<string,Matter[]>();for(const m of editions){const group=groups.get(m.id)||[];group.push(m);groups.set(m.id,group);}
 const rows:YearEntry[]=[];
 for(const [id,group] of groups){group.sort((a,b)=>a.version-b.version);const m=group[group.length-1];
  const intervals:Span[]=[],openedDate=first(m.filedOn,group[0].filedOn,group[0].createdAt);let closedDate:string|undefined,latest=openedDate,prev:Matter|undefined;
  for(const edition of group){
   if(!prev||prev.status!==edition.status){
    const initial=!prev&&edition.version===1,adjacent=!!prev&&edition.version===prev.version+1;
    if(edition.status==='Open'){closedDate=undefined;const start=initial?openedDate:adjacent?first(edition.updatedAt):'';if(start)intervals.push({start});latest=start||latest;}
    else if(edition.status==='Outcome Unverified'){const last=intervals.at(-1),changeDay=first(edition.updatedAt);if(last&&!last.end&&changeDay)last.end=changeDay;closedDate=undefined;}
    else if(edition.status==='Closed'&&(initial||adjacent)){const added=edition.statements.slice(prev?.statements.length||0);const end=first(added.filter(s=>s.outcome?.on).at(-1)?.outcome?.on,added.at(-1)?.at);if(end){closedDate=end;latest=end;if(!intervals.length&&initial&&openedDate&&openedDate<=end)intervals.push({start:openedDate});if(intervals.at(-1)&&!intervals.at(-1)!.end)intervals.at(-1)!.end=end;}}
   }
   prev=edition;
  }
  rows.push({module:ccr,id:'matter:'+id,kind:'Court Matter',category:'court-matter',title:txt(m.title)||'Court Matter',status:m.status,terminal:m.status==='Closed',activityDate:latest,activityDates:m.statements.map(s=>businessDate(s.at)).filter(Boolean),openedDate,closedDate:m.status==='Closed'?closedDate:undefined,openPeriods:intervals});
  for(const h of m.appearances){const date=first(h.date),terminal=['Attended','Cancelled','Continued','Historical Setting'].includes(h.status);
   let changedAt:string|undefined,lastStatus:string|undefined;
   for(const rev of group){const event=rev.appearances.find(a=>a.id===h.id);if(!event)continue;if(event.status!==lastStatus){changedAt=first(rev.updatedAt)||undefined;lastStatus=event.status;}}
   const eventEnd=(h.status==='Attended'||h.status==='Historical Setting')?(date||undefined):terminal?changedAt:undefined;
   rows.push({module:ccr,id:'appearance:'+id+':'+h.id,kind:'Court Appearance',category:'court-appearance',title:txt(h.label)||txt(m.title)||'Court Appearance',status:m.status==='Outcome Unverified'&&h.status==='Scheduled'?'Historical Setting · Outcome Unverified':h.status,terminal,activityDate:date,closedDate:eventEnd,openPeriods:[]});}
 }
 return rows;
}
export function assetEntries(rows:HrRecord[]):YearEntry[]{
 return rows.filter(r=>r.kind==='assetClaim'&&!r.data.deletedAt).map(r=>{const d=r.data,openedDate=first(d.reportedDate,r.createdAt),status=txt(d.status)||'Open',final=(s:unknown)=>s==='Resolved'||s==='Closed - No Recovery';
  const activityDates:string[]=[],periods:Span[]=openedDate?[{start:openedDate}]:[];let prior='Open',closedDate:string|undefined,latest=openedDate;
  for(const item of Array.isArray(d.statements)?d.statements:[]){if(!item||typeof item!=='object')continue;const e=item as Record<string,unknown>,at=first(e.at),next=txt(e.status);if(!at||!next)continue;activityDates.push(at);
   if(final(next)&&!final(prior)){closedDate=at;const p=periods.at(-1);if(p&&!p.end)p.end=at;}
   else if(!final(next)&&final(prior)){closedDate=undefined;periods.push({start:at});}prior=next;latest=at;
  }
  return {module:ccr,id:'asset-claim:'+r.id,kind:'Employee Asset Claim',category:'damage-claim',title:txt(d.title)||'Employee Asset Claim',status,openedDate,closedDate:final(status)?closedDate:undefined,terminal:final(status),openPeriods:periods,activityDate:latest,activityDates};
 });
}
export function safetyEntries(rows:Row[]):YearEntry[]{
 return rows.filter(r=>r.kind==='trespass').map(r=>{const status=txt(r.caseStatus)||'Open',openedDate=first(r.incidentDate),terminal=status==='Resolved',disposition=first(r.dispositionDate);
  return {module:am,id:'safety:'+r.id,kind:'Trespass & Safety Case',category:'safety-case',title:'Company Yard Safety Case',status,terminal,openedDate,closedDate:terminal?disposition||undefined:undefined,activityDate:terminal?disposition||openedDate:openedDate,activityDates:[r.warningRequestedDate,r.warningDate,r.verifiedDate].map(businessDate).filter(Boolean),...(!terminal&&disposition?{openPeriods:[]}:{} )};
 });
}
