import {canDecideBenefit} from '@/lib/hr/benefit-approval';
import {NextRequest,NextResponse} from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {date} from '@/lib/hr/workflow';
import {hrCan} from '@/lib/hr/permissions';
import {readHrRecords,encryptBytes} from '@/lib/hr/server';
import {financeDb} from '@/db/finance';
import {AppError,ForbiddenError,ConflictError,readPayload,safeFailure} from '@/lib/shared/errors';
import type {HrRecord} from '@/lib/hr/model';
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();
 const body=await readPayload(req),finance=await allRecords(),v=financeIdentity(req.headers,finance),hr=await readHrRecords(),old=hr.find(r=>r.id===body.id),person=finance.find(p=>p.kind==='person'&&p.id===(old?.personId||body.personId));
 if(!person)throw new AppError('Employee not found.');
 const at=new Date().toISOString(),action=String(body.action||'request'),actor=finance.find(p=>p.id===v.person);let data:Record<string,unknown>,apply=false;
 if(action==='request'){
 if(!hrCan(v,'manageBenefits',person.id,finance))throw new ForbiddenError();
 if(old)throw new ConflictError('Create a new benefit change request.');
 const input=body.data as Record<string,unknown>||{},employmentClass=String(input.employmentClass||'');
 if(!['Full-Time','Part-Time','Temporary','Seasonal'].includes(employmentClass))throw new AppError('Choose an employment class.');
 date(input.effectiveDate,'effective date',true);
 if(employmentClass!==person.employmentClass&&!hrCan(v,'managePersonnel',person.id,finance))throw new ForbiddenError('Employment class changes require personnel administration.');
 if(employmentClass!==person.employmentClass&&String(input.effectiveDate)>new Date().toLocaleDateString('en-CA',{timeZone:'America/Chicago'}))throw new AppError('Employment class changes must be effective today or earlier. Future benefit packages may be scheduled without changing employment class.');
 const custom:Record<string,number>={};for(const k of ['ptoHours','sickHours','personalHours'])if(input[k]!==''&&input[k]!==undefined){const n=Number(input[k]);if(!Number.isFinite(n)||n<0||n>2080)throw new AppError('Enter hours between 0 and 2,080.');custom[k]=n;}
 if(Object.keys(custom).length&&employmentClass!=='Full-Time')throw new AppError('Company paid benefit overrides require Full-Time employment.');
 const reviewer=finance.find(p=>p.id===actor?.supervisor&&p.kind==='person'&&p.status==='Active');
 if(Object.keys(custom).length&&(!reviewer||reviewer.id===v.person||reviewer.id===person.id))throw new AppError('Assign an active supervisor to the requesting manager before submitting this override. The beneficiary cannot approve their own package.');
 if(Object.keys(custom).length&&!String(input.reason||'').trim())throw new AppError('Enter the reason for the custom package.');
 data={employmentClass,package:employmentClass==='Full-Time'?(Object.keys(custom).length?'Approved Individual Package':person.exempt?'Standard Exempt':'Standard Nonexempt'):'No Company Benefits',effectiveDate:input.effectiveDate,custom,reason:String(input.reason||''),requestedById:v.person,requestedBy:v.name,requestedAt:at,reviewerId:reviewer?.id||'',reviewerName:reviewer?.preferredName||reviewer?.name||'',status:Object.keys(custom).length?'Pending Approval':'Approved',reviewedPersonVersion:person.version};apply=!Object.keys(custom).length;
 }else{
 if(!old||old.kind!=='benefit'||old.data.status!=='Pending Approval'||old.version!==body.version)throw new ConflictError();
 const requester=finance.find(p=>p.id===old.data.requestedById);
 if(!canDecideBenefit(v,person.id,old.data,finance))throw new ForbiddenError('Only the requesting manager’s assigned supervisor with benefit approval access can decide this request.');
 if(!['approve','reject'].includes(action))throw new AppError('Choose Approve or Reject.');
 if(person.version!==old.data.reviewedPersonVersion)throw new ConflictError('Employment details changed. Submit a fresh request for review.');
 data={...old.data,status:action==='approve'?'Approved':'Rejected',decidedBy:v.name,decidedById:v.person,decidedAt:at,decisionReason:String(body.reason||'')};apply=action==='approve';
 }
 const id=old?.id||crypto.randomUUID(),record:HrRecord={id,kind:'benefit',personId:person.id,version:(old?.version||0)+1,data,createdAt:old?.createdAt||at,createdBy:old?.createdBy||v.name,updatedAt:at,updatedBy:v.name};
 const bytes=await encryptBytes(new TextEncoder().encode(JSON.stringify(record)));let bin='';for(const b of bytes)bin+=String.fromCharCode(b);const payload='v1:'+btoa(bin),db=financeDb(),g=crypto.randomUUID(),sql=[];
 for(const p of finance.filter(p=>p.kind==='person'&&[person.id,v.person,String(data.requestedById),String(data.reviewerId)].includes(p.id))){sql.push(db.prepare('INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN '+(p.version>0?'EXISTS(SELECT 1 FROM finance_records WHERE id=? AND version=?)':'NOT EXISTS(SELECT 1 FROM finance_records WHERE id=? AND version>?)')+' THEN 1 ELSE 0 END').bind(g+p.id,p.id,p.version));}
 sql.push(old?db.prepare('UPDATE hr_records SET payload=?,version=?,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(payload,record.version,at,v.name,id,old.version):db.prepare('INSERT INTO hr_records (id,kind,person_id,payload,version,created_at,created_by,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,'benefit',person.id,payload,record.version,at,v.name,at,v.name));
 sql.push(db.prepare('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())').bind(g+'hr'));
 if(apply){const next={...person,employmentClass:data.employmentClass,benefitPolicyAssignments:[...(Array.isArray(person.benefitPolicyAssignments)?person.benefitPolicyAssignments:[]),{...data,recordId:id}],version:person.version+1,updatedAt:at,updatedBy:v.name};sql.push(person.version?db.prepare('UPDATE finance_records SET payload=?,version=?,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(JSON.stringify(next),next.version,at,v.name,person.id,person.version):db.prepare('INSERT INTO finance_records (id,kind,payload,version,updated_at,updated_by) VALUES (?,?,?,?,?,?)').bind(person.id,'person',JSON.stringify(next),next.version,at,v.name));sql.push(db.prepare('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())').bind(g+'person'),db.prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),person.id,v.name,v.id,at,'Approved Benefits Assignment',JSON.stringify(person),JSON.stringify(next)));}
 sql.push(db.prepare('INSERT INTO hr_audit (id,record_id,actor,actor_id,at,action,version,snapshot) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,v.name,v.id,at,action,record.version,payload),db.prepare('DELETE FROM hr_write_guard WHERE id LIKE ?').bind(g+'%'));
 try{await db.batch(sql);}catch{throw new ConflictError('Records changed. Refresh and try again. No partial changes were saved.');}
 return NextResponse.json({record});
 }catch(e){const f=safeFailure(e,'hr.benefits');return NextResponse.json(f.body,{status:f.status});}}
