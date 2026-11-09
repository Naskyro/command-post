import test, {after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareSeparation,canSeparatePerson} from '../../lib/hr/separation.ts';
import {validateSave,canReadRecord,listRecord} from '../../lib/hr/workflow.ts';

const tmp=await mkdtemp(join(tmpdir(),'hr-separation-')),bundle=join(tmp,'logic.mjs');
await build({stdin:{contents:"export {recordSeparation,readHrRecords,writeHrRecord} from './lib/hr/server';",resolveDir:process.cwd(),loader:'ts'},outfile:bundle,bundle:true,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'test-bindings',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env=new Proxy({}, {get:(_,key)=>globalThis.separationTestBindings[key]});',loader:'js'}));}}]});
const api=await import(pathToFileURL(bundle)),db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE finance_records(id TEXT PRIMARY KEY,kind TEXT,payload TEXT,version INTEGER,updated_by TEXT,updated_at TEXT);
CREATE TABLE finance_audit(id TEXT PRIMARY KEY,record_id TEXT,actor TEXT,actor_id TEXT,at TEXT,reason TEXT,before TEXT,after TEXT);
CREATE TABLE hr_records(id TEXT PRIMARY KEY,kind TEXT,person_id TEXT,payload TEXT,version INTEGER,created_at TEXT,created_by TEXT,updated_at TEXT,updated_by TEXT);
CREATE TABLE hr_audit(id TEXT PRIMARY KEY,record_id TEXT,actor TEXT,actor_id TEXT,at TEXT,action TEXT,version INTEGER,snapshot TEXT);
CREATE TABLE hr_write_guard(id TEXT PRIMARY KEY,success INTEGER CHECK(success=1));`);
const binding={prepare(sql){return {sql,args:[],bind(...args){return {...this,args};},async all(){return {results:db.prepare(this.sql).all(...this.args)};},async first(){return db.prepare(this.sql).get(...this.args)||null;},async run(){return {meta:db.prepare(this.sql).run(...this.args)};}};},async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>({meta:db.prepare(s.sql).run(...s.args)}));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
globalThis.separationTestBindings={DB:binding,HR_DATA_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
after(async()=>{db.close();await rm(tmp,{recursive:true,force:true});});
const employee={id:'employee',kind:'person',name:'Example Worker',version:2,status:'Active',accountStatus:'Enabled',department:'Dispatch',supervisor:'manager',role:'Employee',workerType:'Employee',startDate:'2026-01-01',rate:20};
const manager={id:'manager',kind:'person',name:'Example Manager',version:1,status:'Active',accountStatus:'Enabled',department:'Dispatch',role:'Supervisor'};
const viewer={id:'auth-manager',person:'manager',name:'Example Manager',email:'manager@example.test',role:'Supervisor',department:'Dispatch',owner:false,canManage:false,canRelease:false,access:[{module:'People & HR',tab:'people',level:'Edit'}],hrResponsibilities:[{action:'manageOffboarding',scope:'Team'}]};
const finance=[employee,manager];
const input={personId:'employee',personVersion:2,requestId:'00000000-0000-4000-8000-000000000001',separationType:'Termination',separationDate:'2026-10-01',reason:'Documented separation decision',rehireEligibility:'Needs Review',notes:''};
const write=r=>db.prepare('INSERT OR REPLACE INTO finance_records VALUES (?,?,?,?,?,?)').run(r.id,r.kind,JSON.stringify(r),r.version,'Fixture','2026-10-01T12:00:00Z');
const storedPeople=()=>db.prepare("SELECT payload FROM finance_records WHERE kind='person'").all().map(r=>JSON.parse(r.payload));
const count=t=>db.prepare('SELECT count(*) n FROM '+t).get().n;
beforeEach(()=>{for(const t of ['hr_write_guard','hr_audit','hr_records','finance_audit','finance_records'])db.exec('DELETE FROM '+t);finance.forEach(write);});
const plan=(body=input,actor=viewer,people=finance,hr=[])=>prepareSeparation(body,actor,people,hr,'2026-10-02T12:00:00Z','2026-10-02');

test('one decision plans Former status, disabled access and three pending follow-ups without pretending payroll or equipment are complete',()=>{
 const p=plan();assert.equal(p.updated.status,'Former');assert.equal(p.updated.endDate,'2026-10-01');assert.equal(p.updated.accountStatus,'Disabled');assert.equal(p.updated.rate,20);
 assert.equal(p.record.data.status,'Follow-Up Pending');assert.equal(p.record.data.separationRecordedById,'auth-manager');assert.equal(p.record.data.separationRecordedAt,'2026-10-02T12:00:00Z');
 assert.equal(p.tasks.length,3);assert(p.tasks.every(r=>r.data.status==='Pending'&&r.data.assignee==='manager'&&r.data.employeeVisible===false));
 assert.equal(employee.status,'Active');assert.equal(listRecord(p.record).data.separationRequest,undefined);
});
test('only assigned scoped offboarding authority can separate ordinary employees, never self or protected owners',()=>{
 assert.equal(canSeparatePerson(viewer,employee,finance),true);
 const unassigned={...viewer,hrResponsibilities:[]};assert.throws(()=>plan(input,unassigned),/not assigned/);
 assert.throws(()=>plan(input,viewer,[{...employee,supervisor:'outside'},manager]),/not assigned/);
 assert.throws(()=>plan(input,{...viewer,onboardingOnly:true}),/not assigned/);
 const owner={...viewer,person:'owner',owner:true};
 for(const change of [{role:'Owner'},{workerType:'Owner'},{id:'jendel'}]){
  const target={...employee,...change},body={...input,personId:target.id};assert.throws(()=>plan(body,owner,[target,manager]),/Owner accounts/);assert.equal(canSeparatePerson(owner,target,[target,manager]),false);
 }
 assert.throws(()=>plan(input,{...owner,person:'employee'}),/Another authorized/);
});
test('dates, rehire choice, reason and stale employee versions are validated before any writes',()=>{
 for(const change of [{separationDate:'2026-02-30'},{separationDate:'2027-01-01'},{separationDate:'2025-12-31'},{reason:''},{reason:'x'.repeat(1001)},{rehireEligibility:'Probably'},{separationType:'Automatic'},{personVersion:1},{requestId:'short'}])assert.throws(()=>plan({...input,...change}));
 assert.throws(()=>plan({...input,personVersion:3},viewer,[{...employee,status:'Former',version:3},manager]),/already marked Former/);
 assert.equal(count('hr_records'),0);
});
test('transaction persists both status changes, encrypted decisions, tasks and audits while preserving open time and all historical records',async()=>{
 const clock={id:'clock-active:employee',kind:'clock',version:1,person:'employee',status:'Running',startedAt:'2026-10-01T10:00:00Z'};write(clock);
 const bank={id:'bank-old',kind:'bank',personId:'employee',version:1,data:{status:'Verified',accountNumber:'0'.repeat(8)},createdAt:'2026-01-01T12:00:00Z',createdBy:'Fixture',updatedAt:'2026-01-01T12:00:00Z',updatedBy:'Fixture'};await api.writeHrRecord(undefined,bank,viewer,'Fixture');
 const result=await api.recordSeparation(input,viewer,[...finance,clock],[bank]);
 assert.equal(result.followUpCount,3);assert.equal(result.alreadyRecorded,false);
 const saved=storedPeople().find(r=>r.id==='employee');assert.equal(saved.status,'Former');assert.equal(saved.accountStatus,'Disabled');assert.equal(saved.version,3);
 assert.equal(JSON.parse(db.prepare('SELECT payload FROM finance_records WHERE id=?').get(clock.id).payload).status,'Running');
 const hr=await api.readHrRecords();assert.deepEqual(hr.find(r=>r.id==='bank-old'),bank);assert.equal(hr.length,5);
 assert(db.prepare('SELECT payload FROM hr_records WHERE id=?').get(result.record.id).payload.startsWith('v1:'));assert.equal(count('hr_audit'),5);assert.equal(count('finance_audit'),1);assert.equal(count('hr_write_guard'),0);
});
test('identical replay returns original result without duplicate follow-ups, and reused key with changed facts is rejected',async()=>{
 const first=await api.recordSeparation(input,viewer,finance,[]),hr=await api.readHrRecords(),people=storedPeople();
 const retry=await api.recordSeparation(input,viewer,people,hr);assert.equal(retry.alreadyRecorded,true);assert.equal(retry.record.id,first.record.id);assert.equal(count('hr_records'),4);assert.equal(count('finance_audit'),1);
 await assert.rejects(()=>api.recordSeparation({...input,reason:'Different facts'},viewer,people,hr),e=>e.status===409);
 // Simulate concurrent retry whose reads preceded the winning transaction.
 const racingRetry=await api.recordSeparation(input,viewer,finance,[]);assert.equal(racingRetry.alreadyRecorded,true);assert.equal(count('hr_records'),4);
});
test('concurrent personnel or authority changes roll back every write',async()=>{
 write({...employee,version:3,title:'Changed Concurrently'});
 await assert.rejects(()=>api.recordSeparation(input,viewer,finance,[]),e=>e.status===409);
 assert.equal(count('hr_records'),0);assert.equal(count('finance_audit'),0);assert.equal(storedPeople().find(r=>r.id==='employee').status,'Active');assert.equal(count('hr_write_guard'),0);
 write(employee);write({...manager,version:2,accountStatus:'Disabled'});
 await assert.rejects(()=>api.recordSeparation(input,viewer,finance,[]),e=>e.status===409);assert.equal(count('hr_records'),0);assert.equal(storedPeople().find(r=>r.id==='employee').accountStatus,'Enabled');
});
test('an insert failure after person mutation rolls back the person, decision and earlier task inserts',async()=>{
 const p=plan(),collision={...p.tasks[2],data:{title:'Existing fixture'}};await api.writeHrRecord(undefined,collision,viewer,'Fixture');
 await assert.rejects(()=>api.recordSeparation(input,viewer,finance,[]),e=>e.status===409);
 assert.equal(count('hr_records'),1);assert.equal(count('finance_audit'),0);assert.equal(storedPeople().find(r=>r.id==='employee').status,'Active');assert.equal(count('hr_write_guard'),0);
});
test('seed-only employee records are materialized atomically on first separation',async()=>{
 db.prepare('DELETE FROM finance_records WHERE id=?').run('employee');
 const seed={...employee,version:0};await api.recordSeparation({...input,personVersion:0},viewer,[seed,manager],[]);
 assert.equal(storedPeople().find(r=>r.id==='employee').version,1);assert.equal(storedPeople().find(r=>r.id==='employee').status,'Former');
});
test('separation decisions are immutable; only linked follow-up tasks may be edited by scoped offboarding authority',()=>{
 const p=plan(),records=[p.record,...p.tasks],people=[p.updated,manager];
 assert.throws(()=>validateSave(p.record,{...p.record,version:2,data:{...p.record.data,reason:'Changed'}},viewer,people,records),/preserved/);
 assert.throws(()=>validateSave(undefined,{...p.record,id:'forged'},viewer,people,records),/Use End Employment/);
 const task=p.tasks[0];assert.equal(canReadRecord(task,viewer,people,records),true);
 const edit={...task,version:2,data:{...task.data,status:'In Progress',employeeVisible:true}};validateSave(task,edit,viewer,people,records);assert.equal(edit.data.employeeVisible,false);
 assert.throws(()=>validateSave(task,{...edit,data:{...edit.data,separationRecordId:'other'}},viewer,people,records),/linked/);
 const both={...viewer,hrResponsibilities:[...viewer.hrResponsibilities,{action:'managePersonnel',scope:'Team'}]};
 assert.throws(()=>validateSave(task,{...edit,data:{...edit.data,category:'Personnel'}},both,people,records),/linked/);
 const unrelated={...viewer,person:'outside',hrResponsibilities:[]};assert.equal(canReadRecord(task,unrelated,people,records),false);
 assert.throws(()=>validateSave(task,edit,unrelated,people,records),/not assigned/);
});
