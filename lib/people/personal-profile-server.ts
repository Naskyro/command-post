import { financeDb } from '@/db/finance';
import type { Viewer } from '../finance/model';
import { encryptBytes } from '../hr/server';
import { ConflictError } from '../shared/errors';
import { personalProfileStatements,type PersonalProfilePlan } from './personal-profile';

/** Private contact information and public profile preferences save together or not at all. */
export async function writePersonalProfile(plan:PersonalProfilePlan,viewer:Viewer){
 const bytes=await encryptBytes(new TextEncoder().encode(JSON.stringify(plan.record)));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 const payload='v1:'+btoa(binary),db=financeDb(),statements=personalProfileStatements(plan,viewer,payload).map(row=>db.prepare(row.sql).bind(...row.values));
 try{await db.batch(statements);}catch{throw new ConflictError('Personal details, the employee profile, or your assigned access changed. Refresh before saving again. No partial changes were saved.');}
 return {record:plan.record,person:plan.updated||plan.person};
}
