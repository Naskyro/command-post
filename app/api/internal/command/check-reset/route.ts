import {env} from 'cloudflare:workers';
import {allRecords} from '@/lib/finance/server';
import {viewerForLinkedPerson} from '@/lib/finance/identity';
import {canAssistPassword} from '@/lib/admin/password-reset-policy';
import {readPayload} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
// Private server-to-server check immediately before consuming a reset. The
// gateway authenticates this caller at the edge; the browser never sees keys.
const result=(eligible:boolean,status:number)=>Response.json({eligible},{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
export async function POST(req:Request){
 const e=env as unknown as {COMMAND_AUTH_MODE?:string;COMMAND_AUTH_INTERNAL_SECRET?:string};
 if(e.COMMAND_AUTH_MODE!=='standalone'||req.headers.get('x-command-internal-reset-check')!=='1'||typeof e.COMMAND_AUTH_INTERNAL_SECRET!=='string'||e.COMMAND_AUTH_INTERNAL_SECRET.length<32)return result(false,403);
 try{
  const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(e.COMMAND_AUTH_INTERNAL_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const mac=await crypto.subtle.sign('HMAC',key,enc.encode('Bearer '+e.COMMAND_AUTH_INTERNAL_SECRET));
  if(!(await crypto.subtle.verify('HMAC',key,mac,enc.encode(req.headers.get('authorization')||''))))return result(false,403);
  const b=await readPayload(req);
  if(typeof b.personId!=='string'||typeof b.actorId!=='string'||Object.keys(b).some(k=>!['personId','actorId'].includes(k)))return result(false,400);
  const records=await allRecords(),actor=records.find(p=>p.kind==='person'&&p.id===b.actorId),subject=records.find(p=>p.kind==='person'&&p.id===b.personId);
  if(!actor||actor.status!=='Active')return result(false,403);
  const v=viewerForLinkedPerson(actor,'command-roster:'+actor.id,'',records);
  return canAssistPassword(v,subject,records)?result(true,200):result(false,403);
 }catch{return result(false,403);}
}
