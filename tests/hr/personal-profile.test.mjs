import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {personalProfileIdentity,preparePersonalProfile,personalProfileStatements} from '../../lib/people/personal-profile.ts';
import {preparePersonalDetails} from '../../lib/people/details.ts';

const at='2026-10-27T21:00:00.000Z';
const worker={id:'worker',kind:'person',version:1,name:'Alexandra Example',email:'alex@example.test',companyEmail:'',emailAliases:[],userId:'assigned-user',preferredName:'',pronouns:'',gender:'',workerType:'Employee',status:'Active',department:'Dispatch',supervisor:'manager',role:'Employee',rate:20};
const manager={...worker,id:'manager',name:'Manager Example',supervisor:'',version:0};
const people=[worker,manager];
const viewer=(id='worker',actions=[])=>({id:'actor-'+id,person:id,name:id,role:'Employee',department:'Dispatch',owner:false,canManage:false,canRelease:false,access:[{module:'People & HR',tab:'people',level:'Edit'}],hrResponsibilities:actions.map(action=>({action,scope:'Team'}))});
const body={personId:'worker',personVersion:1,version:0,data:{personalPhone:'512-555-0100'},profile:{preferredName:'Alex Example',pronouns:'She / Her',gender:'Nonbinary'}};

test('self-service preferences preserve legal name, login identity, access and pay',()=>{
 const plan=preparePersonalProfile(body,viewer(),people,at);
 assert.equal(plan.updated.preferredName,'Alex Example');assert.equal(plan.updated.pronouns,'She / Her');assert.equal(plan.updated.gender,'Nonbinary');assert.equal(plan.updated.version,2);
 for(const key of ['name','email','companyEmail','emailAliases','userId','role','rate','status','supervisor'])assert.deepEqual(plan.updated[key],worker[key]);
 assert.deepEqual(personalProfileIdentity(plan.updated),{preferredName:'Alex Example',pronouns:'She / Her',gender:'Nonbinary',legalName:'Alexandra Example',username:'worker',companyEmail:'',version:2});
 assert.equal(worker.preferredName,'');
 for(const field of ['name','legalName','email','companyEmail','emailAliases','userId','role','rate','status'])assert.throws(()=>preparePersonalProfile({...body,profile:{[field]:'changed'}},viewer(),people,at),/cannot change/);
});

test('preference edits require the same scoped access and module as protected personal details',()=>{
 assert.ok(preparePersonalProfile(body,viewer('manager',['managePersonnel']),people,at).updated);
 assert.throws(()=>preparePersonalProfile(body,viewer('manager',['viewPersonnel']),people,at),/assigned personnel/);
 assert.throws(()=>preparePersonalProfile(body,{...viewer(),access:[]},people,at),/assigned personnel/);
 assert.ok(preparePersonalProfile(body,{...viewer(),onboardingOnly:true,access:[]},people,at).updated);
 assert.throws(()=>preparePersonalProfile({...body,personId:'manager'},viewer(),people,at),/assigned personnel/);
});

test('preferences reject stale versions and invalid values, support deliberate clearing, and preserve partial fields',()=>{
 assert.throws(()=>preparePersonalProfile({...body,personVersion:0},viewer(),people,at),/changed/);
 assert.throws(()=>preparePersonalProfile({...body,profile:{gender:'Guessed'}},viewer(),people,at),/self-reported/);
 assert.throws(()=>preparePersonalProfile({...body,profile:{pronouns:'x'.repeat(101)}},viewer(),people,at),/100 characters/);
 assert.throws(()=>preparePersonalProfile({...body,profile:{preferredName:'x'.repeat(151)}},viewer(),people,at),/150 characters/);
 assert.throws(()=>preparePersonalProfile({...body,profile:{preferredName:3}},viewer(),people,at),/Enter text/);
 const populated={...worker,preferredName:'Alex Example',pronouns:'She / Her',gender:'Nonbinary'};
 const partial=preparePersonalProfile({...body,profile:{pronouns:null}},viewer(),[populated,manager],at).updated;
 assert.equal(partial.pronouns,'');assert.equal(partial.preferredName,'Alex Example');assert.equal(partial.gender,'Nonbinary');
 const cleared=preparePersonalProfile({...body,profile:{preferredName:'',pronouns:null,gender:''}},viewer(),[populated,manager],at).updated;
 assert.equal(cleared.preferredName,'');assert.equal(cleared.gender,'');assert.equal(cleared.name,'Alexandra Example');
 assert.equal(preparePersonalProfile({...body,profile:{}},viewer(),people,at).updated,undefined);
 assert.equal(preparePersonalProfile({personId:'worker'},viewer(),people,at).updated,undefined);
});

function database(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['../../drizzle/0000_nifty_celestials.sql','../../drizzle/0006_chilly_whistler.sql'])db.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
 return db;
}
function insertPerson(db,person){db.prepare('INSERT INTO finance_records (id,kind,payload,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)').run(person.id,'person',JSON.stringify(person),person.version,'Fixture',at);}
function runBatch(db,statements){db.exec('BEGIN');try{for(const row of statements)db.prepare(row.sql).run(...row.values);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
function makePlan(finance=people,request=body){const identity=preparePersonalProfile(request,viewer(),finance,at),record=preparePersonalDetails(request,undefined,viewer(),finance,at);return {...identity,record,people:finance};}

test('private details and preferences commit with both audits and seed users can be inserted',()=>{
 for(const seed of [false,true]){
  const db=database(),current=seed?{...worker,version:0}:worker,finance=[current,manager],request={...body,personVersion:current.version},plan=makePlan(finance,request);
  if(!seed)insertPerson(db,current);
  runBatch(db,personalProfileStatements(plan,viewer(),'v1:synthetic-encrypted-private-payload','test-success'));
  const saved=JSON.parse(db.prepare('SELECT payload FROM finance_records WHERE id=?').get('worker').payload);
  assert.equal(saved.name,'Alexandra Example');assert.equal(saved.preferredName,'Alex Example');assert.equal(saved.personalPhone,undefined);
  assert.equal(db.prepare('SELECT payload FROM hr_records').get().payload,'v1:synthetic-encrypted-private-payload');
  assert.equal(db.prepare('SELECT count(*) AS count FROM hr_audit').get().count,1);assert.equal(db.prepare('SELECT count(*) AS count FROM finance_audit').get().count,1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM hr_write_guard').get().count,0);db.close();
 }
});

test('a concurrent private-record conflict rolls back preferences and both audit records',()=>{
 const db=database();insertPerson(db,worker);const plan=makePlan();
 db.prepare('INSERT INTO hr_records (id,kind,person_id,payload,version,created_at,created_by,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)').run(plan.record.id,'personal','worker','v1:other-saved-data',1,at,'Other',at,'Other');
 assert.throws(()=>runBatch(db,personalProfileStatements(plan,viewer(),'v1:new-private-data','test-conflict')),/CHECK constraint/);
 assert.equal(JSON.parse(db.prepare('SELECT payload FROM finance_records WHERE id=?').get('worker').payload).preferredName,'');
 assert.equal(db.prepare('SELECT payload FROM hr_records').get().payload,'v1:other-saved-data');
 assert.equal(db.prepare('SELECT count(*) AS count FROM hr_audit').get().count,0);assert.equal(db.prepare('SELECT count(*) AS count FROM finance_audit').get().count,0);db.close();
});

test('a changed personnel or authority version prevents all private and preference writes',()=>{
 const db=database();insertPerson(db,{...worker,version:2});
 assert.throws(()=>runBatch(db,personalProfileStatements(makePlan(),viewer(),'v1:new-private-data','test-person-conflict')),/CHECK constraint/);
 assert.equal(db.prepare('SELECT count(*) AS count FROM hr_records').get().count,0);assert.equal(db.prepare('SELECT count(*) AS count FROM hr_audit').get().count,0);
 assert.equal(JSON.parse(db.prepare('SELECT payload FROM finance_records WHERE id=?').get('worker').payload).preferredName,'');db.close();
});

test('unrelated employee edits do not conflict, but the acting manager and reporting ancestors remain guarded',()=>{
 const unrelated={...worker,id:'unrelated',name:'Other Employee',supervisor:'',version:1},db=database();
 insertPerson(db,worker);insertPerson(db,{...unrelated,version:2});
 const plan=makePlan([...people,unrelated]);
 const statements=personalProfileStatements(plan,viewer(),'v1:private-data','unrelated-edit');
 assert.ok(!statements.some(row=>row.values.includes('unrelated-edit:scope:unrelated')));
 runBatch(db,statements);assert.equal(JSON.parse(db.prepare('SELECT payload FROM finance_records WHERE id=?').get('worker').payload).preferredName,'Alex Example');db.close();

 for(const changed of ['manager','intermediate']){
  const teamDb=database(),supervised={...worker,supervisor:'intermediate'},intermediate={...worker,id:'intermediate',name:'Intermediate Manager',supervisor:'manager'},team=[supervised,intermediate,manager],who=viewer('manager',['managePersonnel']);
  insertPerson(teamDb,supervised);insertPerson(teamDb,changed==='intermediate'?{...intermediate,version:2}:intermediate);
  if(changed==='manager')insertPerson(teamDb,{...manager,version:1});
  const record=preparePersonalDetails(body,undefined,who,team,at),identity=preparePersonalProfile(body,who,team,at);
  assert.throws(()=>runBatch(teamDb,personalProfileStatements({...identity,record,people:team},who,'v1:private-data','scope-'+changed)),/CHECK constraint/);
  assert.equal(teamDb.prepare('SELECT count(*) AS count FROM hr_records').get().count,0);teamDb.close();
 }
});
