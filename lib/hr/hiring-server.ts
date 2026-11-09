import { financeDb } from '@/db/finance';
import type { Viewer } from '../finance/model';
import type { HrRecord } from './model';
import type { HiringPlan } from './hiring';
import { encryptBytes, writeHrRecord } from './server';
import { ConflictError } from '../shared/errors';

async function protectedPayload(record:HrRecord){const bytes=await encryptBytes(new TextEncoder().encode(JSON.stringify(record)));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return 'v1:'+btoa(binary);}
/** Employee linking and optional draft onboarding are one transaction, including the uniqueness guard. */
export async function writeHiringPlan(plan:HiringPlan,viewer:Viewer,extra:D1PreparedStatement[]=[]):Promise<HrRecord>{
 if(!plan.linking)return writeHrRecord(plan.old,plan.record,viewer,plan.old?'Updated Hiring Record':'Created Hiring Record');
 const db=financeDb(),guard=crypto.randomUUID(),record=plan.record,payload=await protectedPayload(record),statements=[];
 if(!plan.old?.data.employeeId){
  const opening=record.data.vacancySnapshot as {openingId?:string;version?:number}|undefined;
  if(!opening?.openingId||!opening.version)throw new ConflictError('Refresh the opening before linking the applicant.');
  statements.push(db.prepare("INSERT INTO hr_write_guard (id,success) SELECT ?,EXISTS(SELECT 1 FROM hr_records WHERE id=? AND kind='vacancy' AND version=?)").bind(guard+':opening',opening.openingId,opening.version));
 }
 statements.push(db.prepare("INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM hr_records WHERE kind='candidate' AND person_id=? AND id<>?) THEN 1 ELSE 0 END").bind(guard+':unique',record.personId,record.id));
 statements.push(db.prepare('UPDATE hr_records SET payload=?,person_id=?,version=?,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(payload,record.personId,record.version,record.updatedAt,viewer.name,record.id,plan.old!.version));
 statements.push(db.prepare('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())').bind(guard+':candidate'));
 statements.push(db.prepare('INSERT INTO hr_audit (id,record_id,actor,actor_id,at,action,version,snapshot) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),record.id,viewer.name,viewer.id,record.updatedAt,'Linked Applicant to Employee',record.version,payload));
 if(plan.onboarding){
  const setup=plan.onboarding,setupPayload=await protectedPayload(setup);
  statements.push(db.prepare("INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM hr_records WHERE kind='onboarding' AND person_id=?) THEN 1 ELSE 0 END").bind(guard+':onboarding-unique',setup.personId));
  statements.push(db.prepare('INSERT INTO hr_records (id,kind,person_id,payload,version,created_at,created_by,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(setup.id,setup.kind,setup.personId,setupPayload,setup.version,setup.createdAt,setup.createdBy,setup.updatedAt,setup.updatedBy));
  statements.push(db.prepare('INSERT INTO hr_audit (id,record_id,actor,actor_id,at,action,version,snapshot) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),setup.id,viewer.name,viewer.id,setup.updatedAt,'Created Onboarding Draft From Hiring Terms',setup.version,setupPayload));
 }
 statements.push(...extra);
 statements.push(db.prepare('DELETE FROM hr_write_guard WHERE id LIKE ?').bind(guard+':%'));
 try{await db.batch(statements);}catch{throw new ConflictError('The applicant, employee link, or onboarding setup changed. Refresh before linking again. No partial hiring changes were saved.');}
 return record;
}
