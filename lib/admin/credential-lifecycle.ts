// Server-only. Only immutable roster IDs, non-secret operation IDs and a generic
// purpose cross the application boundary. HR separation details never leave D1.
import {env} from 'cloudflare:workers';
import {financeDb} from '@/db/finance';
import {AppError} from '@/lib/shared/errors';
import {resetConfig,type ResetConfig,type ResetsEnv} from './password-reset-service';
import type {FinRecord,Viewer} from '@/lib/finance/model';
type Environment=ResetsEnv&{COMMAND_AUTH_MODE?:string};
type Row={person_id:string;operation_id:string;service_version:number;actor_id:string;confirmed_at:string|null;service_required:number};
type Result={state:'complete'|'pending';message:string};
const live=()=>env as unknown as Environment;
const db=financeDb;
function required(environment:Environment){return environment.COMMAND_AUTH_MODE==='standalone'||!!environment.COMMAND_AUTH_INTERNAL_URL||!!environment.COMMAND_AUTH_INTERNAL_SECRET;}
const pending:Result={state:'pending',message:'Command access is disabled. Sign-in service revocation is pending. Choose Retry Sign-In Revocation under Deactivated Users.'};
const completed:Result={state:'complete',message:'The sign-in service confirmed revocation of the previous password, active sessions, and outstanding setup or reset links.'};
export function needsCredentialRevocation(p:FinRecord,environment=live()){return p.commandLifecycleRequired===true||required(environment);}
export function deactivationMarker(p:FinRecord,environment=live()){return {...p,commandSignInRevoked:true,commandLifecycleRequired:p.commandLifecycleRequired===true||required(environment)};}
export function outboxStatement(p:FinRecord,v:Viewer,at:string,database=db(),environment=live()){
 return database.prepare('INSERT INTO command_credential_revocations(person_id,operation_id,service_version,actor_id,created_at,service_required) VALUES (?,?,?,?,?,?) ON CONFLICT(person_id) DO UPDATE SET operation_id=excluded.operation_id,service_version=excluded.service_version,actor_id=excluded.actor_id,created_at=excluded.created_at,confirmed_at=NULL,service_required=MAX(command_credential_revocations.service_required,excluded.service_required) WHERE excluded.service_version>command_credential_revocations.service_version')
 .bind(p.id,crypto.randomUUID(),p.version*4+1,v.person,at,p.commandLifecycleRequired||required(environment)?1:0);
}
async function rowFor(id:string,database=db()){return database.prepare('SELECT * FROM command_credential_revocations WHERE person_id=?').bind(id).first<Row>();}
async function notify(config:ResetConfig| null,action:'deactivate'|'reactivate',personId:string,actorId:string,version:number,operationId:string,transport=fetch){
 if(!config)return false;
 try{
  const url=new URL('/internal/command/'+action,config.internal);
  const res=await transport(url,{method:'POST',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5500),headers:{Authorization:'Bearer '+config.secret,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({personId,operationId,version,actorId,reason:action==='deactivate'?'Revoke credentials for a disabled Command account.':'Allow a new credential setup after an authorized access review.'})});
  return res.ok&&(await res.json() as {ok?:unknown}).ok===true;
 }catch{return false;}
}
async function flush(row:Row,database=db(),environment=live(),transport=fetch):Promise<Result|undefined>{
 if(!row.service_required&&!required(environment))return;
 if(row.confirmed_at)return completed;
 if(!await notify(resetConfig(environment),'deactivate',row.person_id,row.actor_id,row.service_version,row.operation_id,transport))return pending;
 await database.prepare('UPDATE command_credential_revocations SET confirmed_at=? WHERE person_id=? AND operation_id=?').bind(new Date().toISOString(),row.person_id,row.operation_id).run();
 return completed;
}
export async function deliverRevocation(personId:string,database=db(),environment=live(),transport=fetch):Promise<Result|undefined>{
 // The transaction has already disabled the user. Even a transient database failure
 // here must not turn the successful local deactivation into an apparent failed save.
 try{const row=await rowFor(personId,database);return row?await flush(row,database,environment,transport):undefined;}catch{return pending;}
}
export async function retryCredentialRevocation(old:FinRecord,actor:Viewer,database=db(),environment=live(),transport=fetch):Promise<Result|undefined> {
 if(!needsCredentialRevocation(old,environment))return;
 let row=await rowFor(old.id,database);
 // A historical disabled record can predate this feature. Install a current-version
 // revocation only while its roster snapshot still matches, otherwise retry fresh.
 if(!row){
  const guard=crypto.randomUUID();
  try{await database.batch([
   database.prepare("INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM finance_records WHERE id=? AND version=? AND json_extract(payload,'$.accountStatus')='Disabled') OR (?=0 AND NOT EXISTS(SELECT 1 FROM finance_records WHERE id=?)) THEN 1 ELSE 0 END").bind(guard,old.id,old.version,old.version,old.id),
   outboxStatement(old,actor,new Date().toISOString(),database,environment),database.prepare('DELETE FROM hr_write_guard WHERE id=?').bind(guard)
  ]);}catch{throw new AppError('The account changed. Refresh before retrying revocation.',409);}
  row=await rowFor(old.id,database);
 }
 return row?await flush(row,database,environment,transport):pending;
}
export async function prepareCredentialReactivation(old:FinRecord,actor:Viewer,database=db(),environment=live(),transport=fetch):Promise<{result?:Result;requiresService:boolean}>{
 if(!needsCredentialRevocation(old,environment))return {requiresService:false};
 const row=await rowFor(old.id,database);
 const fail=()=>new AppError('The employee remains deactivated. The sign-in service has not confirmed the credential reset. Retry Reactivate User after the connection is restored.',503);
 if(row&&(await flush(row,database,environment,transport))?.state==='pending')throw fail();
 // A single pre-activation call also revokes credentials for legacy disabled users
 // who predate the outbox. Never enable local access before positive confirmation.
 // v*4+2 is strictly after the disabled roster version and before any later v+1
 // deactivation, including a concurrent HR separation that wins the local write.
 const ver=old.version*4+2,bytes=new TextEncoder().encode(JSON.stringify(['reactivate',old.id,ver]));
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 if(!await notify(resetConfig(environment),'reactivate',old.id,actor.person,ver,hash,transport))throw fail();
 return {requiresService:true,result:{state:'complete',message:'Previous sign-in credentials are revoked. Use Reset Password / Set Up Password to issue a fresh single-use link after verifying the employee.'}};
}
