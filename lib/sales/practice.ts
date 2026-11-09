// Deliberately separate from account_records: private training cannot enter account
// handoffs, global searches, audit feeds, revenue reports, mailboxes, or work orders.
import {financeDb} from '@/db/finance';
import {dismissedSampleIds} from '@/lib/preferences/sample-dismissals';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import type {Row} from '@/lib/accounts/model';
import type {Viewer} from '@/lib/finance/model';
import {exampleIds,exampleRows,personalSalesExamples} from './examples';
export const isPracticeId=(v:unknown)=>typeof v==='string'&&v.startsWith('sales-example:');
export const newPracticeId=()=> 'sales-example:'+crypto.randomUUID();
const kinds=new Set(['opportunity','contact','salesActivity','salesRelationship']);
type State={overrides:Row[];hidden:string[]};
export type PracticeSnapshot={version:number;state:State;rows:Row[];dismissed:Set<string>};
export function practiceRows(state:State,hidden:ReadonlySet<string>):Row[]{
 const merged=new Map<string,Row>();
 for(const row of [...exampleRows(new Set()),...state.overrides]){
  if(!kinds.has(row.kind)||!isPracticeId(row.id))throw new AppError('The practice workbook needs support.',503);
  merged.set(row.id,{...row,example:true,readOnly:false});
 }
 const leads=[...merged.values()].filter(r=>r.kind==='opportunity'&&exampleIds.includes(r.id)&&!hidden.has(r.id));
 const ids=new Set(leads.map(l=>l.id)),refs=[...merged.values()].filter(r=>['salesActivity','salesRelationship'].includes(r.kind)&&ids.has(String(r.opportunityId)));
 const people=new Set([...leads,...refs].map(r=>r.contactId).filter(Boolean));
 return [...leads,...refs,...[...merged.values()].filter(r=>r.kind==='contact'&&people.has(r.id))];
}
export async function readPractice(person:string,all:Row[]):Promise<PracticeSnapshot>{
 if(!person)throw new ForbiddenError();
 const [row,oldHidden]=await Promise.all([financeDb().prepare('SELECT payload,version FROM sales_practice WHERE person_id=?').bind(person).first<{payload:string;version:number}>(),dismissedSampleIds(person,'sales')]);
 const state:State=row?JSON.parse(row.payload):{overrides:[],hidden:[]};
 const dismissed=personalSalesExamples(all,person,new Set([...oldHidden,...state.hidden]));
 return {version:row?.version||0,state,rows:practiceRows(state,dismissed),dismissed};
}
async function persist(person:string,s:PracticeSnapshot,state:State,hideId?:string){
 const data=JSON.stringify(state);
 if(new TextEncoder().encode(data).byteLength>1000000)throw new AppError('This practice workbook is full. Remove an example before adding more activities.');
 const db=financeDb(),cas=s.version?db.prepare('UPDATE sales_practice SET payload=?,version=version+1 WHERE person_id=? AND version=?').bind(data,person,s.version):db.prepare('INSERT OR IGNORE INTO sales_practice(person_id,payload,version) VALUES(?,?,1)').bind(person,data);
 // Preserve the original dismissal contract for legacy routes and synchronized clients.
 const r=hideId?(await db.batch([cas,db.prepare("INSERT OR IGNORE INTO user_sample_dismissals(person_id,module,sample_id,dismissed_at) SELECT ?,'sales',?,? WHERE changes()=1").bind(person,hideId,new Date().toISOString())]))[0]:await cas.run();
 if(r.meta.changes!==1)throw new ConflictError('Your practice copy changed in another window. Refresh before saving.');
}
export async function hidePractice(id:string,expected:unknown,v:Viewer,s:PracticeSnapshot){
 if(!exampleIds.includes(id))throw new AppError('Choose a training lead.');
 const lead=s.rows.find(r=>r.id===id&&r.kind==='opportunity');
 if(!lead){if(s.dismissed.has(id))return [];throw new AppError('Choose a visible training lead.');}
 if((expected??0)!==lead.version)throw new ConflictError();
 const hidden=[...new Set([...s.state.hidden,id])],visible=practiceRows(s.state,new Set([...s.dismissed,id])),keep=new Set(visible.map(r=>r.id));
 await persist(v.person,s,{overrides:s.state.overrides.filter(r=>keep.has(r.id)),hidden},id);return [];
}
export async function writePractice(changes:{old?:Row;next:Row}[],v:Viewer,s:PracticeSnapshot){
 const saved:Row[]=[],patch=new Map(s.state.overrides.map(r=>[r.id,r])),seen=new Set<string>(),at=new Date().toISOString();
 for(const {old,next} of changes){
  const current=s.rows.find(r=>r.id===next.id);
  if(seen.has(next.id)||!kinds.has(next.kind)||!isPracticeId(next.id)||next.kind==='opportunity'&&!exampleIds.includes(next.id)||next.accountId||next.companyId||next.onboardingAccountId||next.opportunityId&&!isPracticeId(next.opportunityId)||next.contactId&&!isPracticeId(next.contactId))throw new ForbiddenError('Practice records can only be connected to this practice workbook.');
  if((current?.version??-1)!==(old?.version??-1))throw new ConflictError();
  const r:Row={...next,example:true,readOnly:false,version:(old?.version||0)+1,updatedBy:v.name,updatedAt:at};seen.add(r.id);patch.set(r.id,r);saved.push(r);
 }
 await persist(v.person,s,{...s.state,overrides:[...patch.values()]});return saved;
}
