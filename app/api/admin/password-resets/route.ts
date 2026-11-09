import {env} from 'cloudflare:workers';
import {allRecords,identify} from '@/lib/finance/server';
import {financeDb} from '@/db/finance';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {canAssistPassword} from '@/lib/admin/password-reset-policy';
import {issuePasswordReset,resetConfig,type ResetsEnv} from '@/lib/admin/password-reset-service';
import type {Viewer} from '@/lib/finance/model';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
async function targetFor(req:Request,id:string){
 const records=await allRecords(),viewer=identify(records,req.headers),person=records.find(p=>p.id===id&&p.kind==='person');
 if(!person||!canAssistPassword(viewer,person,records))throw new ForbiddenError('You cannot reset the password for this account.');
 return {viewer,person};
}
const configured=()=>resetConfig(env as unknown as ResetsEnv);
async function audit(v:Viewer,id:string,action:string,reason:string,run:string){
 await financeDb().prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,?,?,?,?,?,?,?)')
 .bind(crypto.randomUUID(),'password-assistance:'+id,v.name,v.id,new Date().toISOString(),action+': '+reason,null,JSON.stringify({actorPerson:v.person,person:id,requestId:run})).run();
}
export async function GET(req:Request){
 try{await targetFor(req,new URL(req.url).searchParams.get('person')||'');return json({eligible:true,configured:!!configured()});}
 catch(e){const f=safeFailure(e,'admin.reset.read');return json(f.body,f.status);}
}
export async function POST(req:Request){
 try{
  if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError('Cross-origin request rejected.');
  const b=await readPayload(req);
  if(typeof b.person!=='string'||typeof b.reason!=='string'||b.reason.trim().length<4||b.reason.trim().length>240||Object.keys(b).some(k=>k!=='person'&&k!=='reason'))throw new AppError('Choose a user and enter a reason of 4–240 characters.');
  const {person,viewer}=await targetFor(req,b.person),c=configured();if(!c)return json({error:'Password resets are not connected to the company sign-in service yet.',configured:false},503);
  const reason=b.reason.trim(),run=crypto.randomUUID();await audit(viewer,person.id,'Password Reset Requested',reason,run);
  let result:Awaited<ReturnType<typeof issuePasswordReset>>;
  try{result=await issuePasswordReset(c,{personId:person.id,username:typeof person.username==='string'?person.username:undefined,actorId:viewer.person,reason});}
  catch{await audit(viewer,person.id,'Reset Link Not Confirmed',reason,run);return json({error:'The company sign-in service did not confirm a reset link. Check the connection before retrying.'},503);}
  await audit(viewer,person.id,'Single-Use Password Reset Link Issued',reason,run);
  return json(result);
 }catch(e){const f=safeFailure(e,'admin.reset.issue');return json(f.body,f.status);}
}
