import type {Row} from '../accounts/model';
import type {RoutePlan} from './config';
export const samples=[
 ['cedar','Sample · Cedar Gate Apartments','Engaged',216,'Full Patrol','Austin City Hall, Austin, TX','Arrange a proposal review'],
 ['oak','Sample · Oak Terrace Flats','Contract Pending',144,'Basic Patrol','Austin Central Library, Austin, TX','Follow up on the draft agreement'],
 ['willow','Sample · Willow Bend Residences','Lost',184,'Call In','',''],
 ['laurel','Sample · Laurel Park Apartments','Won',240,'Full Patrol','','']
] as const;
const id=(k:string)=>'sales-example:'+k;
export const exampleIds=samples.map(([k])=>id(k));
export const exampleRouteId=id('route');
export function personalSalesExamples(all:Row[],person:string,dismissed:ReadonlySet<string>){
  const ids=new Set(dismissed);
  // Older releases created global tombstones; preserve only the original actor’s choice.
  for(const row of all)if(row.kind==='salesSettings'&&row.authorId===person&&exampleIds.includes(String(row.removedLead))&&row.id==='removed:'+row.removedLead)ids.add(String(row.removedLead));
  return ids;
}
export function exampleRows(dismissed:ReadonlySet<string>):Row[]{const out:Row[]=[];for(const [k,name,stage,units,service,address,nextAction] of samples){const lid=id(k);if(dismissed.has(lid))continue;const person=k==='cedar'||k==='willow'?'Jordan Sample':k==='oak'?'Taylor Sample':'Casey Sample',cid=id(person.split(' ')[0].toLowerCase()),former=k==='willow';out.push({id:lid,name,stage,kind:'opportunity',version:0,example:true,readOnly:true,units,service,address,nextAction,dueDate:nextAction?'2026-10-31':'',propertyType:'Residential',companyName:'Sample Property Group',currentProvider:'Example Towing Co.',currentService:'Call In',propertyManager:person,contactName:person,contactId:cid,contactRole:'Property Manager',details:'Training example only. Names and outcomes are fictional. Route stops use public Austin landmarks for practice; no sales visit is scheduled.',...(stage==='Lost'?{lossCategory:'Loyal to Current Provider',lossReason:'The manager renewed the existing towing agreement.',resolicitEligible:'No',lostManagerName:person}:{}),...(stage==='Won'?{details:'Training example: the agreement was signed. A real Won lead creates a Pending Account; this example does not create operational work.'}:{})});out.push({id:lid+':relationship',kind:'salesRelationship',version:0,name:person,contactId:cid,opportunityId:lid,role:'Property Manager',decisionMaker:true,startDate:former?'2025-03-01':'2026-10-01',...(former?{endDate:'2026-09-30',endReason:'Moved to Sample · Cedar Gate Apartments'}:{}),example:true});if(!out.some(r=>r.id===cid))out.push({id:cid,name:person,kind:'contact',version:0,example:true});out.push({id:lid+':activity',kind:'salesActivity',version:0,name:'Example Visit',channel:'Onsite visit',date:'2026-10-28',opportunityId:lid,outcome:'Contact Made With Decision Maker',details:stage==='Lost'?'Discussed renewal with the incumbent.':stage==='Won'?'Signed service agreement reviewed.':'Discussed resident parking and the next follow-up.',updatedBy:'Training Example',updatedAt:'2026-10-28T15:00:00Z',example:true});}return out;}
export function exampleRoute(dismissed:ReadonlySet<string>){if(dismissed.has(exampleRouteId))return [];const stops=exampleRows(dismissed).filter(r=>r.kind==='opportunity'&&r.address).map(r=>({leadId:r.id,name:r.name,address:String(r.address),minutes:30,pauseMinutes:0}));if(!stops.length)return [];const plan:RoutePlan={name:'Sample · Downtown Practice Route',origin:'7511 Dee Gabriel Collins Rd, Austin, TX 78744',end:'',startDate:'2026-10-31',startTime:'09:00',stops};return [{id:exampleRouteId,example:true,name:plan.name,version:0,plan}];}
