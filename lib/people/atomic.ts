import {financeDb} from '@/db/finance';
import type {FinRecord,Viewer} from '@/lib/finance/model';
import {ConflictError} from '@/lib/shared/errors';
export async function savePeopleBatch(changes:{old?:FinRecord;next:FinRecord}[],v:Viewer,reason:string){
 const db=financeDb(),at=new Date().toISOString(),guard=crypto.randomUUID(),sql=[];
 for(const {old,next} of changes){
 const updated={...next,version:(old?.version||0)+1,updatedAt:at,updatedBy:v.name};
 sql.push(old?.version?db.prepare('UPDATE finance_records SET payload=?,version=?,updated_by=?,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(updated),updated.version,v.name,at,next.id,old.version):db.prepare('INSERT OR IGNORE INTO finance_records (id,kind,payload,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)').bind(next.id,next.kind,JSON.stringify(updated),updated.version,v.name,at));
 sql.push(db.prepare('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())').bind(guard+next.id));
 sql.push(db.prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),next.id,v.name,v.id,at,reason,JSON.stringify(old||null),JSON.stringify(updated)));
 }
 sql.push(db.prepare('DELETE FROM hr_write_guard WHERE id LIKE ?').bind(guard+'%'));
 try{await db.batch(sql);}catch{throw new ConflictError('Records changed. Refresh and try again; no partial changes were saved.');}
}
