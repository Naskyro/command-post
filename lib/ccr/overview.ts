import {courtOutcomeCounts} from './court-outcomes.ts';
import type {Viewer} from '../finance/model';
import {canAccess} from '../finance/access.ts';
import {CCR,realDay,type Matter} from './docket-model.ts';
import {ForbiddenError} from '../shared/errors.ts';
import {businessToday} from '../year-history/model.ts';
import {isCcrTab} from './navigation.ts';

export const deskNames={legal:'Legal Notices & Correspondence',hearings:'Court Docket',damage:'Damage Claims',tdlr:'TDLR Complaints',recovery:'Chargebacks & Recovery',calendar:'Compliance Calendar',licenses:'Licenses & Testing',evidence:'Inspection & Evidence'} as const;
export type Desk=keyof typeof deskNames;
export type RegisterDesk=Exclude<Desk,'damage'|'hearings'>;
type RegisterLine={chargebackActions?:{due:string;time:string;title:string}[];id:string;section:RegisterDesk;title:string;status:string;dueOn:string;nextAction?:string;amountCents?:number|null};
export type ClaimLine={id:string;version?:number;source:'property'|'asset'|'intake';title:string;status:string;dueOn?:string;major?:boolean};
export type DeskStatus={desk:Desk;open:number|null};
export type NextItem={id:string;sourceId:string;desk:Desk;title:string;action:string;due:string;time?:string;pastDue?:boolean;kind:'date'|'review'|'appearance'};
export type Overview={courtOutcomes:ReturnType<typeof courtOutcomeCounts>|null;today:string;desks:DeskStatus[];items:NextItem[];appearances:number|null;totalClaims:number|null;completedClaims:number|null;propertyClaims:number|null;assetClaims:number|null;intakeClaims:number|null;unverifiedClaims:number|null;recoveryAmount:number|null;recoveryKnown:number};
export type Sources={register:(v:Viewer)=>Promise<{items:RegisterLine[];sections:readonly RegisterDesk[]}>;court:(v:Viewer)=>Promise<Matter[]>;claims:(v:Viewer)=>Promise<ClaimLine[]>};
const registerDesks:RegisterDesk[]=['legal','tdlr','recovery','calendar','licenses','evidence'];
const terminal=new Set(['closed','closed without settlement','paid','resolved','closed - no recovery','cancelled','canceled','voided','deleted']);
export const dayPlus=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+86400000*n).toISOString().slice(0,10);
export function overviewAccess(v:Viewer){return !!v.person&&!v.id.startsWith('preview:')&&!v.onboardingOnly&&canAccess(v,CCR,'command');}
export const isRegisterDesk=(t:Desk):t is RegisterDesk=>(registerDesks as string[]).includes(t);
export async function ccrOverview(v:Viewer,s:Sources,now=new Date()):Promise<Overview>{
 if(!overviewAccess(v))throw new ForbiddenError();
 const today=businessToday(now),weekEnd=dayPlus(today,7),desks=(Object.keys(deskNames) as Desk[]).filter(d=>isCcrTab(d)&&canAccess(v,CCR,d)).map(desk=>({desk,open:null} as DeskStatus)),by=new Map(desks.map(d=>[d.desk,d]));
 const result:Overview={courtOutcomes:null,today,desks,items:[],appearances:null,totalClaims:null,completedClaims:null,propertyClaims:null,assetClaims:null,intakeClaims:null,unverifiedClaims:null,recoveryAmount:null,recoveryKnown:0};
 const ct=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 const add=(desk:Desk,id:string,title:string,action:string,kind:NextItem['kind'],due='',key='',time='')=>result.items.push({id:desk+':'+id+':'+(key||kind),sourceId:id,desk,title,action,kind,due,...(time?{time}:{}),...(desk==='recovery'&&due===today&&time&&time<ct?{pastDue:true}:{})});
 const setCount=(desk:Desk,value:number)=>{const d=by.get(desk);if(d)d.open=value;};
 const [court,claims,reg]=await Promise.allSettled([by.has('hearings')?s.court(v):Promise.resolve([]),by.has('damage')?s.claims(v):Promise.resolve([]),desks.some(d=>isRegisterDesk(d.desk))?s.register(v):Promise.resolve({items:[],sections:[]})]);
 if(by.has('hearings')&&court.status==='fulfilled'){
  result.courtOutcomes=courtOutcomeCounts(court.value);
  const opened=court.value.filter(m=>m.status==='Open');setCount('hearings',opened.length);result.appearances=0;
  for(const m of opened){
   if(realDay(m.dueOn))add('hearings',m.id,m.title,m.dueFor||'Court Deadline','date',m.dueOn);
   for(const a of m.appearances){if(a.status!=='Scheduled'||!realDay(a.date))continue;
    if(a.date>=today&&a.date<weekEnd)result.appearances++;
    add('hearings',m.id,m.title,a.date<today?'Confirm Appearance Outcome: '+a.label:a.label,'appearance',a.date,a.id,a.time);
   }
  }
 }
 if(by.has('damage')&&claims.status==='fulfilled'){
  const current=new Map<string,ClaimLine>();
  for(const c of claims.value){const key=c.source+':'+c.id,old=current.get(key);if(!old||(c.version??0)>(old.version??0))current.set(key,c);}
  const all=[...current.values()],status=(c:ClaimLine)=>c.status.trim().toLowerCase(),completed=(c:ClaimLine)=>terminal.has(status(c)),unverified=(c:ClaimLine)=>!status(c)||status(c)==='outcome unverified'||c.source==='intake'&&!completed(c)&&status(c)!=='open';
  const active=all.filter(c=>!unverified(c)&&!completed(c));setCount('damage',active.length);
  result.totalClaims=all.length;result.completedClaims=all.filter(completed).length;
  result.intakeClaims=active.filter(c=>c.source==='intake').length;result.unverifiedClaims=all.filter(unverified).length;
  result.propertyClaims=active.filter(c=>c.source==='property').length;result.assetClaims=active.filter(c=>c.source==='asset').length;
  for(const c of active){
   if(realDay(c.dueOn))add('damage',c.id,c.title,'Claim Follow-Up','date',c.dueOn);
   if(c.major||c.status.toLowerCase()==='pending review')add('damage',c.id,c.title,c.major?'Major Claim Review':'Settlement Review','review');
  }
 }
 if(reg.status==='fulfilled'){
  const permitted=new Set(reg.value.sections.filter(d=>by.has(d)&&isRegisterDesk(d)));for(const d of permitted)setCount(d,0);
  for(const r of reg.value.items){const d=by.get(r.section);if(!d||!permitted.has(r.section)||terminal.has(r.status.toLowerCase()))continue;
   d.open=(d.open??0)+1;if(r.section==='recovery'&&r.amountCents!=null&&Number.isSafeInteger(r.amountCents)){result.recoveryKnown++;result.recoveryAmount=(result.recoveryAmount??0)+r.amountCents;}
   if(r.section==='recovery')for(const [i,a] of (r.chargebackActions||[]).entries()){if(realDay(a.due))add(r.section,r.id,r.title,a.title,'date',a.due,'processor-'+i,a.time);}
   if(realDay(r.dueOn))add(r.section,r.id,r.title,r.nextAction||'Follow-Up Due','date',r.dueOn);
   else if(['in review','pending review','awaiting review','needs review'].includes(r.status.toLowerCase()))add(r.section,r.id,r.title,r.nextAction||'Record Review','review');
  }
 }
 result.items.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||(a.time||'').localeCompare(b.time||'')||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
 return result;
}
