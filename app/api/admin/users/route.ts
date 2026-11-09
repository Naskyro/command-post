import {deactivationMarker,needsCredentialRevocation,outboxStatement,deliverRevocation,retryCredentialRevocation,prepareCredentialReactivation} from '@/lib/admin/credential-lifecycle';
import {NextRequest,NextResponse} from 'next/server';
import {allRecords,identify} from '@/lib/finance/server';
import {financeDb} from '@/db/finance';
import type {FinRecord} from '@/lib/finance/model';
import {canAccess} from '@/lib/finance/access';
import {personView} from '@/lib/people/policy';
import {publicPersonIdentity} from '@/lib/people/display-name';
import {prepareAdminUser,userLifecycleCapabilities,adminUserAssignment} from '@/lib/admin/users';
import {encode} from '@/lib/hr/server';
import {ConflictError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){try{
 const records=await allRecords(),viewer=identify(records,req.headers);
 if(!canAccess(viewer,'Admin','users'))throw new ForbiddenError();
 const people=records.filter(p=>p.kind==='person'),capabilities=Object.fromEntries(people.map(p=>[p.id,userLifecycleCapabilities(viewer,p,records)]));
 return json({viewer,people:people.map(p=>personView(p,viewer,records,'admin')),departments:records.filter(r=>r.kind==='department'),supervisors:people.filter(p=>p.status==='Active').map(p=>({id:p.id,...publicPersonIdentity(p),department:p.department})),authorityAssignment:adminUserAssignment(viewer,records),capabilities,authentication:{invitationSent:false}});
 }catch(e){const f=safeFailure(e,'admin.users.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError('Cross-origin request rejected.');
 const body=await readPayload(req),records=await allRecords(),viewer=identify(records,req.headers),at=new Date().toISOString();
 if(body.action==='retryCredentialRevocation'){
  const subject=records.find(p=>p.id===body.id&&p.kind==='person');
  if(!subject||subject.accountStatus!=='Disabled'||subject.id===viewer.person||subject.workerType==='Owner'||subject.role==='Owner'||!userLifecycleCapabilities(viewer,subject,records).canManage)throw new ForbiddenError();
  const result=await retryCredentialRevocation(subject,viewer);
  return json({credentialLifecycle:result||{state:'complete',message:'No outstanding sign-in revocation. This account is disabled in Command.'}});
 }
 const plan=prepareAdminUser(body,viewer,records,at);
 const reactivation=body.action==='reactivate'&&plan.old?await prepareCredentialReactivation(plan.old,viewer):undefined;
 if(body.action==='deactivate')plan.next=deactivationMarker(plan.next);
 if(reactivation)plan.next={...plan.next,commandSignInRevoked:false,commandLifecycleRequired:reactivation.requiresService};
 const db=financeDb(),guard=crypto.randomUUID(),updated:FinRecord={...plan.next,version:(plan.old?.version||0)+1,updatedAt:at,updatedBy:viewer.name},payload=JSON.stringify(updated),statements=[];
 // Lock the roster and scope snapshot so simultaneous provisioning cannot claim
 // the same mailbox or race a supervisor/authority reassignment.
 const dependencies=records.filter(r=>['person','department'].includes(r.kind));
 statements.push(db.prepare("INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN (SELECT count(*) FROM finance_records WHERE kind IN ('person','department'))=? THEN 1 ELSE 0 END").bind(guard+':count',dependencies.filter(r=>r.version>0).length));
 for(const r of dependencies)statements.push(r.version>0?db.prepare('INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM finance_records WHERE id=? AND version=?) THEN 1 ELSE 0 END').bind(guard+':scope:'+r.id,r.id,r.version):db.prepare('INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM finance_records WHERE id=?) THEN 1 ELSE 0 END').bind(guard+':scope:'+r.id,r.id));
 statements.push(plan.old?.version?db.prepare('UPDATE finance_records SET payload=?,version=?,updated_by=?,updated_at=? WHERE id=? AND version=?').bind(payload,updated.version,viewer.name,at,updated.id,plan.old.version):db.prepare('INSERT OR IGNORE INTO finance_records (id,kind,payload,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)').bind(updated.id,'person',payload,updated.version,viewer.name,at));
 statements.push(db.prepare('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())').bind(guard+':person'));
 statements.push(db.prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),updated.id,viewer.name,viewer.id,at,plan.reason,JSON.stringify(plan.old||null),payload));
 if(body.action==='deactivate'&&needsCredentialRevocation(updated))statements.push(outboxStatement(updated,viewer,at));
 if(plan.onboarding){
  const r=plan.onboarding,encrypted=await encode(r);
  statements.push(db.prepare('INSERT INTO hr_records (id,kind,person_id,payload,version,created_at,created_by,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(r.id,r.kind,r.personId,encrypted,r.version,r.createdAt,r.createdBy,r.updatedAt,r.updatedBy));
  statements.push(db.prepare('INSERT INTO hr_audit (id,record_id,actor,actor_id,at,action,version,snapshot) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),r.id,viewer.name,viewer.id,at,'Created '+(updated.setupPath==='Existing Worker'?'Historical Records Review':'New Hire Onboarding')+' From Admin User Setup',r.version,encrypted));
 }
 statements.push(db.prepare('DELETE FROM hr_write_guard WHERE id LIKE ?').bind(guard+':%'));
 try{await db.batch(statements);}catch{throw new ConflictError('The user or reporting relationships changed. Refresh before retrying; no partial setup was saved.');}
 const credentialLifecycle=body.action==='deactivate'&&needsCredentialRevocation(updated)?await deliverRevocation(updated.id):reactivation?.result;
 return json({credentialLifecycle,record:personView(updated,viewer,[...records.filter(p=>p.id!==updated.id),updated],'admin'),onboardingId:plan.onboarding?.id,invitationSent:false});
 }catch(e){const f=safeFailure(e,'admin.users.write');return json(f.body,f.status);}}
