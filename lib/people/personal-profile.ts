import {commandUsername,workContactEmail} from './work-contact.ts';
import type { FinRecord, Viewer } from '../finance/model';
import type { HrRecord } from '../hr/model';
import { genderOptions } from '../hr/demographics.ts';
import { canEditPersonalDetails } from './details.ts';
import { AppError, ConflictError, ForbiddenError } from '../shared/errors.ts';

export type PersonalProfileIdentity={preferredName:string;pronouns:string;gender:string;legalName:string;username:string;companyEmail:string;version:number};
const profileLimits={preferredName:150,pronouns:100,gender:50} as const;
type ProfileField=keyof typeof profileLimits;
export function personalProfileIdentity(person:FinRecord,records:FinRecord[]=[]):PersonalProfileIdentity {
 return {preferredName:String(person.preferredName||''),pronouns:String(person.pronouns||''),gender:String(person.gender||''),legalName:String(person.name||''),username:commandUsername(person),companyEmail:workContactEmail(person,records),version:person.version};
}

/** This self-service action can change presentation preferences, never identity or authority. */
export function preparePersonalProfile(body:Record<string,unknown>,viewer:Viewer,people:FinRecord[],at=new Date().toISOString()):{person:FinRecord;updated?:FinRecord} {
 const person=people.find(row=>row.kind==='person'&&row.id===body.personId);
 if(!person||!canEditPersonalDetails(viewer,person.id,people))throw new ForbiddenError('Personal details are available only to this employee and their assigned personnel or onboarding administrator.');
 if(body.profile===undefined)return {person};
 if(!body.profile||typeof body.profile!=='object'||Array.isArray(body.profile))throw new AppError('Submit valid profile preferences.');
 if(!Number.isInteger(body.personVersion)||body.personVersion!==person.version)throw new ConflictError('This employee profile changed. Refresh before saving.');
 const fields:Record<string,string>={};
 for(const [key,value] of Object.entries(body.profile)){
  if(!Object.hasOwn(profileLimits,key))throw new AppError('Profile preferences cannot change '+key+'.');
  if(value!==null&&typeof value!=='string')throw new AppError('Enter text for '+key+'.');
  const field=key as ProfileField,clean=value===null?'':value.trim();
  if(clean.length>profileLimits[field])throw new AppError('Shorten '+key+' to '+profileLimits[field]+' characters or fewer.');
  if(field==='gender'&&clean&&!genderOptions.includes(clean as typeof genderOptions[number]))throw new AppError('Choose a valid self-reported gender or leave it blank.');
  fields[field]=clean;
 }
 if(Object.entries(fields).every(([key,value])=>String(person[key]||'')===value))return {person};
 return {person,updated:{...person,...fields,version:person.version+1,updatedAt:at,updatedBy:viewer.name}};
}

export type PersonalProfilePlan={old?:HrRecord;record:HrRecord;person:FinRecord;updated?:FinRecord;people:FinRecord[]};
export type PersonalProfileStatement={sql:string;values:(string|number|null)[]};

/** D1 batch executes this complete plan transactionally; a failed guard rolls back both records. */
export function personalProfileStatements(plan:PersonalProfilePlan,viewer:Viewer,protectedPayload:string,guard=crypto.randomUUID()):PersonalProfileStatement[] {
 const rows:PersonalProfileStatement[]=[],push=(sql:string,...values:(string|number|null)[])=>rows.push({sql,values}),{old,record,person,updated}=plan,at=record.updatedAt;
 // Guard only the identity and reporting records used by this authorization decision.
 // An unrelated employee edit must not invalidate this person's preferences save.
 const peopleById=new Map(plan.people.filter(value=>value.kind==='person').map(value=>[value.id,value])),scopePeople=new Map<string,FinRecord>();
 scopePeople.set(person.id,person);
 const actor=peopleById.get(viewer.person);if(actor)scopePeople.set(actor.id,actor);
 const teamScope=!viewer.owner&&viewer.person!==person.id&&viewer.hrResponsibilities?.some(grant=>['managePersonnel','manageOnboarding'].includes(grant.action)&&grant.scope==='Team');
 if(teamScope){
  const visited=new Set([person.id]);let id=String(person.supervisor||'');
  while(id&&!visited.has(id)){
   visited.add(id);const ancestor=peopleById.get(id);if(!ancestor)break;
   scopePeople.set(id,ancestor);if(id===viewer.person)break;
   id=String(ancestor.supervisor||'');
  }
 }
 for(const row of scopePeople.values()){
  if(row.version>0)push('INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM finance_records WHERE id=? AND version=?) THEN 1 ELSE 0 END',guard+':scope:'+row.id,row.id,row.version);
  else push('INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM finance_records WHERE id=?) THEN 1 ELSE 0 END',guard+':scope:'+row.id,row.id);
 }
 if(old)push("UPDATE hr_records SET payload=?,version=?,updated_at=?,updated_by=? WHERE id=? AND kind='personal' AND person_id=? AND version=?",protectedPayload,record.version,at,viewer.name,record.id,person.id,old.version);
 else push('INSERT OR IGNORE INTO hr_records (id,kind,person_id,payload,version,created_at,created_by,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)',record.id,record.kind,person.id,protectedPayload,record.version,record.createdAt,record.createdBy,at,viewer.name);
 push('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())',guard+':private');
 push('INSERT INTO hr_audit (id,record_id,actor,actor_id,at,action,version,snapshot) VALUES (?,?,?,?,?,?,?,?)',crypto.randomUUID(),record.id,viewer.name,viewer.id,at,old?'Updated Private Personnel Details':'Created Private Personnel Details',record.version,protectedPayload);
 if(updated){
  const payload=JSON.stringify(updated);
  if(person.version>0)push("UPDATE finance_records SET payload=?,version=?,updated_by=?,updated_at=? WHERE id=? AND kind='person' AND version=?",payload,updated.version,viewer.name,at,person.id,person.version);
  else push('INSERT OR IGNORE INTO finance_records (id,kind,payload,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)',person.id,'person',payload,updated.version,viewer.name,at);
  push('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())',guard+':preferences');
  push('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,?,?,?,?,?,?,?)',crypto.randomUUID(),person.id,viewer.name,viewer.id,at,'Updated Employee Profile Preferences',JSON.stringify(person),payload);
 }
 push('DELETE FROM hr_write_guard WHERE id LIKE ?',guard+':%');
 return rows;
}
