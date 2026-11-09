import type {RegisterRecord,RegisterSection} from '../ccr/register-model';
import {businessDate,type YearEntry} from './model.ts';

const ccr='Compliance, Claims & Recovery';
const kinds:Record<RegisterSection,string>={legal:'Legal Notice',tdlr:'TDLR Complaint',recovery:'Recovery Case',evidence:'Inspection & Evidence Packet',calendar:'Compliance Obligation',licenses:'Credential or Testing Record'};

/** Input is already authorized by section AND by current record assignment.
 * No evidence, filenames, people, private notes or tracked loss amounts leave this projection.
 * A tracked loss is not a payment, approved debt, or an accounting recovery. */
export function registerEntries(editions:Pick<RegisterRecord,'section'|'id'|'version'|'createdAt'|'updatedAt'|'title'|'status'>[]):YearEntry[]{
 const grouped=new Map<string,typeof editions>();
 for(const r of editions){if(!r.id||!Object.hasOwn(kinds,r.section)||!Number.isInteger(r.version)||r.version<1)continue;
  const key=r.section+':'+r.id;const group=grouped.get(key)||[];group.push(r);grouped.set(key,group);}
 return [...grouped.entries()].map(([key,group])=>{
  group.sort((a,b)=>a.version-b.version);const current=group.at(-1)!;
  let prior:typeof current|undefined,start='',closedDate:string|undefined;
  const openPeriods:{start:string;end?:string}[]=[],activity=new Set<string>();
  for(const r of group){const day=businessDate(r.updatedAt),created=businessDate(r.createdAt);if(day)activity.add(day);
   const contiguous=!!prior&&r.version===prior.version+1,closed=r.status==='Closed';
   if(!contiguous){start='';closedDate=undefined;
    // Without the intervening editions, only status at this snapshot is known.
    if(!closed)start=r.version===1?(created||day):day;
    else if(r.version===1)closedDate=day||undefined;
   }else if(closed&&prior!.status!=='Closed'){
    if(start&&day)openPeriods.push({start,end:day});start='';closedDate=day||undefined;
   }else if(!closed&&prior!.status==='Closed'){start=day;closedDate=undefined;}
   prior=r;
  }
  if(start&&current.status!=='Closed')openPeriods.push({start});
  return {id:'register:'+key,module:ccr,kind:kinds[current.section],title:current.title,category:'register-'+current.section,
   status:current.status,activityDate:businessDate(current.updatedAt),openedDate:businessDate(current.createdAt)||undefined,
   closedDate:current.status==='Closed'?closedDate:undefined,terminal:current.status==='Closed',activityDates:[...activity].sort(),openPeriods};
 });
}

/** Targets use approved tab IDs only; the destination again checks its own source permissions. */
export function ccrArchiveTarget(id:string):{tab:string;id:string}|null{
 const reg=/^register:(tdlr|recovery|legal|licenses|calendar):(.+)$/.exec(id);
 if(reg)return {tab:reg[1],id:reg[2]};
 if(id.startsWith('matter:')&&id.slice(7))return {tab:'hearings',id:id.slice(7)};
 const appearance=/^appearance:([^:]+):.+$/.exec(id);if(appearance)return {tab:'hearings',id:appearance[1]};
 if(/^(asset-claim|claim):.+$/.test(id))return {tab:'damage',id};return null;
}
