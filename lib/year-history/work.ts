import type {FinRecord,Viewer} from '../finance/model';
import type {Row} from '../accounts/model';
import {businessDate,type YearEntry} from './model.ts';
import {canAccess} from '../finance/access.ts';
import {buildWorkEntry,isWorkItem,workPeriodSummary,type WorkTransition} from './work-periods.ts';

async function auditEvents(rows:Row[]):Promise<Map<string,WorkTransition[]>>{
 const out=new Map<string,WorkTransition[]>(),ids=[...new Set(rows.filter(isWorkItem).map(r=>r.id))];
 if(!ids.length)return out;
 const {financeDb}=await import('@/db/finance'),db=financeDb();
 // Query only visible IDs; neither private before/after JSON nor notes, actors and attachments reach the client.
 for(let from=0;from<ids.length;from+=80){
  const batch=ids.slice(from,from+80),qs=batch.map(()=>'?').join(',');
  const result=await db.prepare("SELECT record_id,at,json_extract(before,'$.status') AS prior,json_extract(after,'$.status') AS status,CASE WHEN before IS NULL OR before='null' THEN 1 ELSE 0 END AS initial,json_extract(after,'$.version') AS version FROM account_audit WHERE record_id IN ("+qs+") ORDER BY record_id,at,id").bind(...batch).all<WorkTransition>();
  for(const item of result.results){const list=out.get(item.record_id)||[];list.push(item);out.set(item.record_id,list);}
 }
 return out;
}
/** The operational queue needs only an attested closure date. Its full history stays server-side. */
export async function annotateWorkClosure(rows:Row[]):Promise<Row[]>{
 const needs=rows.filter(r=>{const s=String(r.status).toLowerCase();return isWorkItem(r)&&(s==='completed'&&!businessDate(r.completedAt)||['cancelled','canceled'].includes(s)&&!businessDate(r.cancelledAt||r.canceledAt));});
 if(!needs.length)return rows;
 const groups=await auditEvents(needs),dates=new Map(needs.map(r=>[r.id,workPeriodSummary(r,groups.get(r.id)).closedDate]));
 return rows.map(r=>dates.get(r.id)?{...r,yearHistoryClosedDate:dates.get(r.id)}:r);
}
export async function workHistory(viewer:Viewer,records:FinRecord[],requestedModule?:string):Promise<YearEntry[]>{
 if(viewer.onboardingOnly||!records.some(r=>r.kind==='person'&&r.id===viewer.person&&r.status==='Active'&&r.accountStatus!=='Disabled'))return [];
 const orders=(!requestedModule||requestedModule==='Work Orders')&&canAccess(viewer,'Work Orders','orders'),tasks=(!requestedModule||requestedModule==='Account Management')&&canAccess(viewer,'Account Management','work');
 if(!orders&&!tasks)return [];
 const {projection}=await import('../accounts/server'),{financeDb}=await import('@/db/finance'),{default:seeds}=await import('../accounts/seed-data.json');
 const allowed=tasks?['workOrder','account','task']:['workOrder','account'];
 // Keyset paging deliberately avoids the interactive directory's 20,000 mixed-record limit.
 const all=new Map<string,Row>((seeds as Row[]).filter(r=>allowed.includes(r.kind)).map(r=>[r.id,r]));
 const db=financeDb(),q=allowed.map(()=>'?').join(',');
 const fields=['name','status','type','requestedAt','createdAt','completedAt','cancelledAt','canceledAt','deletedAt','derived','actualCost'];
 // Do not materialize gate codes, office contacts, personnel, work notes or attachments for an annual lookup.
 const summary="json_object('id',id,'kind',kind,'version',version,'accountId',account_id,'updatedAt',updated_at,"+fields.map(k=>"'"+k+"',json_extract(payload,'$."+k+"')").join(',')+")";
 let cursor='';
 for(;;){
  const page=await db.prepare('SELECT id,'+summary+' AS payload FROM account_records WHERE kind IN ('+q+') AND id>? ORDER BY id LIMIT 300').bind(...allowed,cursor).all<{id:string;payload:string}>();
  for(const record of page.results){const row=JSON.parse(record.payload) as Row;all.set(row.id,{...all.get(row.id),...row});}
  if(page.results.length<300)break;cursor=page.results[page.results.length-1].id;
 }
 const source=[...all.values()],scopes:{module:string;rows:Row[];names:Map<string,string>}[]=[];
 function scope(module:string,visible:Row[],include:(r:Row)=>boolean){scopes.push({module,rows:visible.filter(r=>isWorkItem(r)&&include(r)),names:new Map(visible.filter(r=>r.kind==='account'&&!r.deletedAt).map(r=>[r.id,r.name]))});}
 if(orders)scope('Work Orders',projection(source,viewer,'orders'),r=>r.kind==='workOrder');
 if(tasks)scope('Account Management',projection(source,viewer,'manager'),r=>r.kind==='task'||r.kind==='workOrder'&&!!r.accountId);
 const audit=await auditEvents(scopes.flatMap(s=>s.rows));
 return scopes.flatMap(s=>s.rows.map(r=>buildWorkEntry(r,s.module,audit.get(r.id)||[],s.names.get(String(r.accountId||'')))));
}
