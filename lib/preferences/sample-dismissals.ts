// Private preferences. The calling module validates its own read access and example IDs.
// Callers always pass the authenticated employee id, never a person id from the request.
import {financeDb} from '@/db/finance';
export async function dismissedSampleIds(personId:string,module:string):Promise<Set<string>>{
  const rows=await financeDb().prepare('SELECT sample_id FROM user_sample_dismissals WHERE person_id=? AND module=?').bind(personId,module).all<{sample_id:string}>();
  return new Set(rows.results.map(row=>row.sample_id));
}
export async function dismissSample(personId:string,module:string,sampleId:string):Promise<void>{
  await financeDb().prepare('INSERT OR IGNORE INTO user_sample_dismissals(person_id,module,sample_id,dismissed_at) VALUES(?,?,?,?)')
    .bind(personId,module,sampleId,new Date().toISOString()).run();
}
