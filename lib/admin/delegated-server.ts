import {verifiedRosterHeader,standaloneActorKey} from '../auth/edge-identity';
import {financeDb} from '@/db/finance';
import {allRecords,requestRoster} from '@/lib/finance/server';
import {financeIdentity,viewerForLinkedPerson} from '@/lib/finance/identity';
import type {FinRecord,Viewer} from '@/lib/finance/model';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {canStartDelegation,cookieToken,delegationCookie,delegationMinutes,delegationQuery,eligibleTarget,previewSignal,targetSummary,type DelegationState} from './delegated-policy';
import {delegatedSubjectHeader,delegatedSessionHeader,delegatedActorHeader} from './delegated-principal';

type Session={token_hash:string;id:string;actor_person:string;actor_key:string;actor_name:string;subject_person:string;subject_name:string;reason:string;started_at:string;expires_at:string;ended_at:string|null;end_reason:string|null};
const db=financeDb;
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200,cookie?:string)=>Response.json(body,{status,headers:cookie?{...headers,'Set-Cookie':cookie}:headers});
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const digest=async (token:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
// Keep the marker beyond the authorization window, so an expired tab cannot fall
// back to the administrator's data or write access until an explicit Return to Admin.
const setToken=(token:string,age?:number)=>delegationCookie+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict'+(age===0?'; Max-Age=0':'');
const ended=(reason:string)=>json({error:reason,delegation:{state:'ended',reason}},403);
async function find(token:string|null){
 if(!token||token==='invalid')return null;
 return db().prepare('SELECT * FROM delegated_sessions WHERE token_hash=?').bind(await digest(token)).first<Session>();
}
function audit(s:Session,action:string,at:string,onlyChanged=false) {
 return db().prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) SELECT ?,?,?,?,?,?,?,?'+(onlyChanged?' WHERE changes()=1':'')).bind(crypto.randomUUID(),'delegated-access:'+s.id,s.actor_name,s.actor_key,at,'Delegated Access: '+action+' — '+s.subject_name,null,JSON.stringify({actorPerson:s.actor_person,subjectPerson:s.subject_person,subjectName:s.subject_name,startedAt:s.started_at,expiresAt:s.expires_at,reason:s.reason,event:action,at}));
}
async function finish(s:Session,action:string,at=new Date().toISOString()){
 await db().batch([db().prepare('UPDATE delegated_sessions SET ended_at=?,end_reason=? WHERE token_hash=? AND ended_at IS NULL').bind(at,action,s.token_hash),audit(s,action,at,true)]);
}
function agentKey(h:Headers){const employee=h.get(verifiedRosterHeader);if(employee)return standaloneActorKey(employee);const id=h.get('oai-authenticated-user-id')?.trim(),email=h.get('oai-authenticated-user-email')?.trim().toLowerCase();return id|| (email?'verified-email:'+email:'');}
export async function resolvePreview(req:Request):Promise<Response|{session:Session;state:Extract<DelegationState,{state:'active'}>;records:FinRecord[];viewer:Viewer;actor:Viewer}>{
 const s=await find(cookieToken(req.headers));
 if(!s||s.ended_at||s.actor_key!==agentKey(req.headers))return ended('This employee view is no longer active. Return to Admin.');
 if(Date.parse(s.expires_at)<=Date.now()){await finish(s,'Expired',s.expires_at);return ended('The 15-minute employee view has expired. Return to Admin.');}
 const records=await requestRoster();let v:Viewer;
 try{v=financeIdentity(req.headers,records);}catch{await finish(s,'Authorization Revoked');return ended('Access changed. Return to Admin.');}
 const person=records.find(p=>p.kind==='person'&&p.id===s.subject_person);
 if(v.person!==s.actor_person||!canStartDelegation(v)||!person||!eligibleTarget(v,person,records)){
  await finish(s,'Authorization Revoked');return ended('Access changed. Return to Admin.');
 }
 // The subject comes from our D1 row, never from a header, email parameter, or user selector.
 const viewer=viewerForLinkedPerson(person,'delegated:'+s.id,'',records,{allowOnboarding:true});
 viewer.delegatedReadOnly=true;
 viewer.email=''; // Personal emails, real auth provider IDs and callbacks are unnecessary for this view.
 return {session:s,viewer,records,actor:v,state:{state:'active',subjectId:person.id,subjectName:viewer.name,actorName:v.name,expiresAt:s.expires_at}};
}
// Called only by the worker's reviewed read branch, after incoming internal
// headers were stripped. No provider identity or original actor is replaced.
export async function delegatedReadRequest(req:Request):Promise<Request|Response>{
 try{
  const ctx=await resolvePreview(req);if(ctx instanceof Response)return ctx;
  const h=new Headers(req.headers);
  h.set(delegatedSubjectHeader,ctx.viewer.person);
  h.set(delegatedSessionHeader,ctx.session.id);
  h.set(delegatedActorHeader,ctx.actor.person);
  // Log the route, not query strings that could contain names or private text.
  await audit(ctx.session,'Read requested '+new URL(req.url).pathname,new Date().toISOString()).run();
  const url=new URL(req.url);url.searchParams.delete(delegationQuery);
  return new Request(url,{method:req.method,headers:h,signal:req.signal});
 }catch(error){const f=safeFailure(error,'delegation.read');return json({...f.body,readOnly:true},f.status);}
}
export async function control(req:Request){
 try {
  if(req.method!=='GET'&&req.method!=='POST')return json({error:'Method not allowed.'},405);
  const token=cookieToken(req.headers);
  let body:Record<string,unknown>={};
  if(req.method==='POST'){
   if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError('Cross-origin request rejected.');
   body=await readPayload(req);
   if(body.action==='end'){
    const s=await find(token);
    // Exit remains usable after deactivation or a role change. A token issued to a
    // different gateway user may be discarded here but cannot revoke that user's session.
    if(s&&!s.ended_at&&s.actor_key===agentKey(req.headers)) await finish(s,Date.parse(s.expires_at)<=Date.now()?'Expired':'Returned to Admin',Date.parse(s.expires_at)<=Date.now()?s.expires_at:undefined);
    return json({session:null},200,setToken('',0));
   }
  }
  if(token!==null||req.headers.has(previewSignal)){
   if(req.method!=='GET')return json({error:'Return to Admin before starting another employee view.'},409);
   const ctx=await resolvePreview(req);if(ctx instanceof Response)return ctx;
   return json({session:ctx.state,targets:[]});
  }
  const records=await requestRoster(),actor=financeIdentity(req.headers,records);
  if(!canStartDelegation(actor))throw new ForbiddenError('Delegated Access requires an authorized site administrator.');
  if(req.method==='GET')return json({session:null,targets:records.filter(p=>eligibleTarget(actor,p,records)).map(targetSummary).sort((a,b)=>a.name.localeCompare(b.name))});
  if(body.action!=='start'||Object.keys(body).some(k=>!['action','person','reason'].includes(k))||typeof body.reason!=='string'||body.reason.trim().length<4||body.reason.trim().length>240)throw new AppError('Select an employee and enter a reason of 4–240 characters.');
  const subject=records.find(p=>p.kind==='person'&&p.id===body.person);
  if(!subject||!eligibleTarget(actor,subject,records))throw new ForbiddenError('This account is unavailable for Delegated Access.');
  const raw=hex(crypto.getRandomValues(new Uint8Array(32))),start=new Date(),s:Session={token_hash:await digest(raw),id:crypto.randomUUID(),actor_person:actor.person,actor_key:actor.id,actor_name:actor.name,subject_person:subject.id,subject_name:targetSummary(subject).name,reason:body.reason.trim(),started_at:start.toISOString(),expires_at:new Date(+start+delegationMinutes*60000).toISOString(),ended_at:null,end_reason:null};
  // Expire old sessions lazily, including sessions abandoned by a closed browser.
  const stale=await db().prepare('SELECT * FROM delegated_sessions WHERE actor_person=? AND ended_at IS NULL AND expires_at<=?').bind(actor.person,s.started_at).all<Session>();
  for(const r of stale.results)await finish(r,'Expired',r.expires_at);
  const created=await db().batch([db().prepare('INSERT INTO delegated_sessions(token_hash,id,actor_person,actor_key,actor_name,subject_person,subject_name,reason,started_at,expires_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM delegated_sessions WHERE actor_person=? AND ended_at IS NULL)').bind(s.token_hash,s.id,s.actor_person,s.actor_key,s.actor_name,s.subject_person,s.subject_name,s.reason,s.started_at,s.expires_at,s.actor_person),audit(s,'Started',s.started_at,true)]);
  if(created[0].meta.changes!==1)return json({error:'Another employee view is already active for your account. Return to Admin in that window or wait for the 15-minute session to expire.'},409);
  return json({session:{state:'active',actorName:actor.name,subjectId:subject.id,subjectName:s.subject_name,expiresAt:s.expires_at}},200,setToken(raw));
 }catch(error){const f=safeFailure(error,'delegation.control');return json(f.body,f.status);}
}
export async function readPreview(req:Request,path:string){
 try{
  const ctx=await resolvePreview(req);if(ctx instanceof Response)return ctx;
  const {viewer,records,state,actor}=ctx;
  if(path==='/api/session')return json({viewer,delegation:state});
  if(path==='/api/user-settings'){
   const [{readUserSettings},{effectiveUserSettings}]=await Promise.all([import('@/lib/preferences/storage'),import('@/lib/site-themes/rules')]);
   const {theme,version,nextChangeAt,availableThemes}=effectiveUserSettings(await readUserSettings(db(),viewer),records);
   return json({theme,version,updatedAt:null,nextChangeAt,availableThemes:availableThemes?.filter(t=>t.id===theme)});
  }
  const projections=await import('./delegated-projections');
  if(path==='/api/home'&&!viewer.onboardingOnly)return json(await projections.previewHome(viewer,await allRecords(),actor));
  if(path==='/api/delegated-access/workspace')return json(await projections.previewWorkspace(viewer,await allRecords(),new URL(req.url).searchParams.get('module')||'',new URL(req.url).searchParams.get('tab')||'',actor));
  return json({error:'This feature is protected in Delegated Access.'},403);
 }catch(error){const f=safeFailure(error,'delegation.view');return json({...f.body,...(path==='/api/session'?{delegation:{state:'ended',reason:'The employee view could not be verified. Return to Admin.'}}:{})},f.status);}
}
