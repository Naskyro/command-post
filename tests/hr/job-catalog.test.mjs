import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('drafts, scoped publication, applicant assignment and signed immutable history use the same edition',async t=>{
 const sql=new DatabaseSync(':memory:'),tmp=await mkdtemp(join(tmpdir(),'command-job-catalog-')),file=join(tmp,'catalog.mjs');
 t.after(async()=>{sql.close();await rm(tmp,{recursive:true,force:true});});
 for(const name of ['0006_chilly_whistler','0015_hr_job_descriptions']){
  const ddl=await readFile('drizzle/'+name+'.sql','utf8');sql.exec(ddl);
 }
 const store=new Map();
 const fixture={HR_DATA_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),DB:{
  prepare(q){return {q,args:[],bind(...args){return {...this,args};},async all(){return {results:sql.prepare(q).all(...this.args)};},async first(){return sql.prepare(q).get(...this.args)||null;},async run(){return {meta:sql.prepare(q).run(...this.args)};}};},
  async batch(ops){sql.exec('BEGIN');try{const out=ops.map(op=>({meta:sql.prepare(op.q).run(...op.args)}));sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}
 },BUCKET:{async put(k,bytes){store.set(k,Uint8Array.from(bytes));},async get(k){const bytes=store.get(k);return bytes?{arrayBuffer:async()=>bytes.buffer}:null;},async delete(k){store.delete(k);}}};
 globalThis.jobCatalogFixture=fixture;
 await build({stdin:{contents:"export * from './lib/hr/job-catalog-server';export * from './lib/hr/hiring';export {writeHiringPlan} from './lib/hr/hiring-server';export {readHrRecords,writeHrRecord,decryptBytes} from './lib/hr/server';",resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,format:'esm',platform:'node',plugins:[{name:'test-bindings',setup(b){
  b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/^env$/,namespace:'fixture'},()=>({contents:'export const env=globalThis.jobCatalogFixture;'}));
  b.onResolve({filter:/job-description-pdf-server$/},()=>({path:'render',namespace:'fixture'}));b.onLoad({filter:/^render$/,namespace:'fixture'},()=>({contents:"export async function buildServerJobDescriptionPdf(c){return new TextEncoder().encode('%PDF-test '+JSON.stringify(c));}"}));
 }}]});
 const api=await import(pathToFileURL(file)),person=(id,department,status)=>({id,name:id,kind:'person',version:1,status,department,onboardingRequired:status==='Onboarding'});
 const people=[{id:'dispatch',name:'Dispatch',kind:'department',status:'Active'},{id:'fleet',name:'Fleet',kind:'department',status:'Active'},person('hr','Dispatch','Active'),person('hire','Dispatch','Onboarding'),person('other','Fleet','Active')];
 const manager={id:'user-hr',person:'hr',name:'HR',access:[{module:'People & HR',tab:'hiring',level:'Edit'}],hrResponsibilities:[{action:'manageOnboarding',scope:'Department'}],department:'Dispatch',owner:false};
 const other={...manager,person:'other',department:'Fleet'},readonly={...manager,access:[{module:'People & HR',tab:'hiring',level:'View'}]};
 const content={title:'Dispatcher',summary:'Coordinate releases',reportsTo:'Dispatch Manager',flsaStatus:'Nonexempt',payBasis:'Hourly',essentialFunctions:'Track releases\nOther duties as assigned.\nOther duties as assigned'};
 const draft=await api.saveEdition({action:'save',departmentId:'dispatch',content},manager,people),body={id:draft.id,version:1,etag:draft.etag,departmentId:'dispatch',content};
 assert.equal(draft.content.essentialFunctions,'Track releases\nOther duties as assigned');
 await assert.rejects(api.getEdition(draft.id,1,other,people),/unavailable/);
 await assert.rejects(api.saveEdition({...body,action:'publish'},readonly,people),/responsibility/);
 await assert.rejects(api.assignEdition({id:draft.id,version:1,personId:'hire'},manager,people,[]),/published/);
 const one=await api.saveEdition({...body,action:'publish'},manager,people);
 await assert.rejects(api.saveEdition({...body,action:'save'},manager,people),/newer/);
 const revision=await api.saveEdition({...body,etag:one.etag,action:'save',content:{...content,summary:'NEW EDITION'}},manager,people);
 assert.equal(revision.version,2);assert.equal(revision.status,'Draft');
 const openingInput={action:'saveVacancy',id:'opening',version:0,data:{title:'Dispatch Coordinator',departmentId:'dispatch',jobDescriptionId:draft.id,jobDescriptionVersion:1,jobDescription:'spoof',payType:'Hourly',rate:20,targetCloseDate:'2030-07-02',status:'Open'}};
 await assert.rejects(api.vacancyDescriptionInput({...openingInput,data:{...openingInput.data,jobDescriptionVersion:2}},manager,people,[]),/published/);
 await assert.rejects(api.vacancyDescriptionInput({...openingInput,data:{...openingInput.data,jobDescriptionId:'',jobDescriptionVersion:0}},manager,people,[]),/Publish/);
 const actual=await api.vacancyDescriptionInput(openingInput,manager,people,[]);assert.equal(actual.body.data.jobDescription,content.summary);
 const opening=api.prepareHiring(actual.body,manager,people,[]);await api.writeHiringPlan(opening,manager);
 const candidate=api.prepareHiring({action:'saveCandidate',id:'applicant',version:0,data:{vacancyId:'opening',stage:'Applied',fullName:'Employee'}},manager,people,[opening.record]);await api.writeHiringPlan(candidate,manager);
 let records=await api.readHrRecords(),link=api.prepareHiring({action:'linkEmployee',id:'applicant',version:1,data:{employeeId:'hire'}},manager,people,records);
 const oneStored=await api.getEdition(one.id,1,manager,people),assign=await api.assignmentPlan(oneStored,'hire',manager,people,records,{pinnedVacancy:true,newSetup:link.onboarding});
 link.onboarding=undefined;
 await assert.rejects(api.writeHiringPlan(link,manager,[...assign.statements,fixture.DB.prepare("INSERT INTO hr_write_guard VALUES ('force-failure',0)")]),/partial/);
 assert.equal((await api.readHrRecords()).some(r=>r.kind==='document'||r.personId==='hire'),false);
 await api.writeHiringPlan(link,manager,assign.statements);records=await api.readHrRecords();
 const old=records.find(r=>r.kind==='document'),setup=records.find(r=>r.kind==='onboarding');
 assert.equal(setup.data.tasks.find(t=>t.key==='jobDescription').documentId,old.id);
 assert.equal(old.data.storageKey,oneStored.file.storageKey);
 assert.equal((await api.assignEdition({id:one.id,version:1,personId:'hire'},manager,people,records)).document.id,old.id);
 const signed={...old,data:{...old.data,signatureStatus:'Signed',signatureName:'Employee'},version:2};await api.writeHrRecord(old,signed,manager,'Fixture signed');
 const two=await api.saveEdition({...body,version:revision.version,etag:revision.etag,action:'publish',content:revision.content},manager,people);
 assert.equal((await api.getEdition(one.id,1,manager,people)).status,'Archived');
 await assert.rejects(api.assignEdition({id:one.id,version:1,personId:'hire'},manager,people,records),/published/);
 records=await api.readHrRecords();await assert.rejects(api.assignEdition({id:two.id,version:two.version,personId:'hire'},manager,people,records),/confirm/);
 await assert.rejects(api.assignEdition({id:two.id,version:two.version,personId:'other'},manager,people,records),/responsibility/);
 const copy=await api.assignEdition({id:two.id,version:two.version,personId:'hire',replaceDocumentId:old.id},manager,people,records);
 assert.equal(copy.document.data.storageKey,undefined);records=await api.readHrRecords();
 const retained=records.find(r=>r.id===old.id);assert.equal(retained.data.signatureStatus,'Signed');assert.equal(retained.data.assignmentSupersededBy,copy.document.id);
 assert.equal((await api.readHrRecords()).find(r=>r.id===setup.id).data.tasks.find(t=>t.key==='jobDescription').documentId,copy.document.id);
 assert.match(new TextDecoder().decode(await api.editionPdf(oneStored,manager)),/Coordinate releases/);
 const newer=await api.getEdition(two.id,2,manager,people);assert.match(new TextDecoder().decode(await api.editionPdf(newer,manager)),/NEW EDITION/);
 const list=await api.catalogListing(manager,people,records);assert.equal(list.referenceTemplate,undefined);assert.equal(list.assignablePeople.some(p=>p.id==='other'),false);
 assert.ok((await api.catalogListing({...manager,owner:true},people,records)).referenceTemplate.title.includes('Director'));
});
