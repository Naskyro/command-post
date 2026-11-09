import {financeDb} from '@/db/finance';
import {encode,decode} from '@/lib/hr/server';
import {AppError,ForbiddenError,ConflictError} from '@/lib/shared/errors';
import {access,head,assigned} from '@/lib/accounts/policy';
import {requestRoster} from '@/lib/finance/server';
import {canAccess} from '@/lib/finance/access';
import type {Row} from '@/lib/accounts/model';
import {isLive,inPortfolio,publicCourtBrief} from '@/lib/accounts/today-brief';
import type {FinRecord,Viewer} from '@/lib/finance/model';
import {docketAccess,prepareMatter,type Matter} from './docket-model';
async function latest():Promise<Matter[]>{
 const rows=await financeDb().prepare('SELECT a.payload FROM ccr_docket_versions a JOIN (SELECT matter_id,MAX(version) AS v FROM ccr_docket_versions GROUP BY matter_id) b ON b.matter_id=a.matter_id AND a.version=b.v ORDER BY a.updated_at DESC').all<{payload:string}>();
 return Promise.all(rows.results.map(r=>decode(r.payload) as Promise<Matter>));
}
export async function docket(v:Viewer):Promise<Matter[]>{if(!docketAccess(v))throw new ForbiddenError();return latest();}
export async function courtIdentityInUse(number:string,courtName:string,excludeId?:string){if(!number.trim()||!courtName.trim())return false;const {canonCause,plain}=await import('./docket-import');const {hearingCourtKey}=await import('./hearing-facts');const venue=(s:string)=>hearingCourtKey(s)||plain(s);return (await latest()).some(r=>r.id!==excludeId&&canonCause(r.number)===canonCause(number)&&venue(r.courtName||'')===venue(courtName));}
export async function propertyDocketRows(accountId:string){return (await latest()).filter(r=>r.accountId===accountId);}
export async function propertyOptions(v:Viewer){
 if(!docketAccess(v)||!access(v,'accounts'))return [];
 const {yearCaseRows}=await import('@/lib/accounts/server');
 const [rows,staff]=await Promise.all([yearCaseRows(),requestRoster()]);return rows.filter(r=>r.kind==='account'&&isLive(r)&&(head(v,staff)||assigned(v,r))).map(r=>({id:r.id,name:r.name,status:String(r.status||''),address:String(r.address||''),historical:r.status==='Terminated'||r.status==='Archived'})).sort((a,b)=>a.name.localeCompare(b.name));
}
export async function accountCourtBrief(v:Viewer,rows:Row[],staff:FinRecord[],requested:string,day:string){
 if(v.onboardingOnly||!v.person||!canAccess(v,'Account Management')||!access(v,'work')||!access(v,'accounts')||!access(v,'claims'))throw new ForbiddenError();
 if(!head(v,staff)&&requested!==v.person)throw new ForbiddenError();
 const allowed=new Set(rows.filter(r=>r.kind==='account'&&isLive(r)&&inPortfolio(r,requested,day)).map(r=>r.id));
 return {cases:allowed.size?publicCourtBrief(await latest(),allowed):[],canOpenDocket:docketAccess(v)};
}
// Year-end open/closed status must be reconstructed from the recorded case revisions;
// a note appended to a closed matter must not move the closure into a different year.
export async function docketEditions(v:Viewer):Promise<Matter[]>{
 if(!docketAccess(v))throw new ForbiddenError();
 const rows=await financeDb().prepare('SELECT payload FROM ccr_docket_versions ORDER BY matter_id,version').all<{payload:string}>();
 return Promise.all(rows.results.map(r=>decode(r.payload) as Promise<Matter>));
}
export async function updateMatter(v:Viewer,b:Record<string,unknown>){
 if(!docketAccess(v,true))throw new ForbiddenError();
 const db=financeDb(),prior=typeof b.id==='string'&&b.id?await db.prepare('SELECT payload FROM ccr_docket_versions WHERE matter_id=? ORDER BY version DESC LIMIT 1').bind(b.id).first<{payload:string}>():null;
 const previous:Matter|undefined=prior?await decode(prior.payload):undefined,next=prepareMatter(b,previous,v,new Date());
 if((next.accountId||'')!==(previous?.accountId||'')){
  if(!access(v,'accounts'))throw new ForbiddenError();
  const permitted=await propertyOptions(v);if(previous?.accountId&&!permitted.some(a=>a.id===previous.accountId)&&!v.owner)throw new ForbiddenError();if(next.accountId&&!permitted.some(a=>a.id===next.accountId))throw new AppError('Select an eligible property.');next.propertyLinkHistory=[...(previous?.propertyLinkHistory||[]),{accountId:next.accountId||'',...(previous?.accountId?{fromId:previous.accountId}:{}),at:next.updatedAt,by:v.name,byId:v.id,basis:'Property selection saved in Court Docket.'}];
 }
 const added=(next.relatedMatterIds||[]).filter(id=>!previous?.relatedMatterIds?.includes(id));
 if(added.length){
  const hits=await db.prepare('SELECT DISTINCT matter_id FROM ccr_docket_versions WHERE matter_id IN ('+added.map(()=>'?').join(',')+')').bind(...added).all<{matter_id:string}>();
  if(hits.results.length!==added.length)throw new AppError('Select a saved related court record.');
 }
 await insertEdition(next);return next;
}
export async function insertEdition(next:Matter){
 const payload=await encode(next);if(payload.length>1500000)throw new AppError('This matter exceeds the protected record size limit.',413);
 const result=await financeDb().prepare('INSERT OR IGNORE INTO ccr_docket_versions(matter_id,version,payload,updated_at) VALUES(?,?,?,?)').bind(next.id,next.version,payload,next.updatedAt).run();
 if(result.meta.changes!==1)throw new ConflictError('This court matter changed. Refresh the docket before saving.');
}
const checkId=(id:string)=>{if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new AppError('Choose a saved matter or document.');return id;};
export async function matterById(id:string):Promise<Matter>{
 const row=await financeDb().prepare('SELECT payload FROM ccr_docket_versions WHERE matter_id=? ORDER BY version DESC LIMIT 1').bind(checkId(id)).first<{payload:string}>();
 if(!row)throw new AppError('Court record not found.',404);return decode(row.payload);
}
