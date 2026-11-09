import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('current intake corrections preserve the original source, evidence, authorization and complete change history',async t=>{
 const sql=new DatabaseSync(':memory:'),tmp=await mkdtemp(join(tmpdir(),'damage-case-facts-'));
 t.after(async()=>{sql.close();delete globalThis.caseFactsFixture;await rm(tmp,{recursive:true,force:true});});
 sql.exec(await readFile('drizzle/0028_ccr_damage_intake.sql','utf8'));
 const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:sql.prepare(query).run(...args).changes}};}};},async batch(ops){sql.exec('BEGIN');try{const out=[];for(const op of ops)out.push(await op.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const grant=level=>[{module:'Compliance, Claims & Recovery',tab:'damage',level}];
 const owner={person:'owner',id:'auth-owner',name:'Case Reviewer',owner:true};
 const editor={person:'editor',id:'auth-editor',name:'Assigned Editor',owner:false,access:grant('Edit')};
 const reader={person:'reader',id:'auth-reader',name:'Read Only',owner:false,access:grant('View')};
 globalThis.caseFactsFixture={db,people:[],rows:[],roles:{owner,editor,reader}};
 // Exercise real model/server/API logic. Storage encryption has its own original-
 // file tests; this adapter keeps the saved editions observable for this audit test.
 const mocks=new Map([
  ['@/db/finance','export const financeDb=()=>globalThis.caseFactsFixture.db;'],
  ['@/lib/hr/server','export const encode=async v=>JSON.stringify(v),decode=async v=>JSON.parse(v),readAssetClaims=async()=>[];'],
  ['@/lib/finance/server','export const allRecords=async()=>globalThis.caseFactsFixture.people,requestViewer=async h=>globalThis.caseFactsFixture.roles[h.get("role")];'],
  ['@/lib/accounts/server','export const yearCaseRows=async()=>globalThis.caseFactsFixture.rows,claimChoiceRows=yearCaseRows;'],
  ['next/server','export const NextResponse={json:Response.json};'],
 ]);
 await build({entryPoints:{server:'lib/ccr/damage-intake-server.ts',route:'app/api/ccr/damage-intake/route.ts'},outdir:tmp,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'services',setup(b){b.onResolve({filter:/.*/},a=>mocks.has(a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks.get(a.path)}));}}]});
 const server=await import(pathToFileURL(join(tmp,'server.mjs')).href),route=await import(pathToFileURL(join(tmp,'route.mjs')).href);
 const manifest={threadId:'claim-thread-001',title:'Missing Rear Spoiler',vehicle:'Toyota 4Runner',claimReference:'SOURCE-001',reportedOn:'2025-10-11',summary:'Original reported allegation.',propertyName:'Original Property',status:'Outcome Unverified',references:[{messageId:'claim-msg-001',threadId:'claim-thread-001',on:'2025-10-11',subject:'Original support email',note:'Reviewed source.'}]};
 const {id}=await server.damageImport(owner,manifest);
 const initial=await server.getDamageIntake(id);
 assert.equal(initial.originalSource.title,manifest.title);
 assert.equal(initial.originalSource.version,1);
 assert.equal(initial.originalSource.filedBy,owner.name);
 const evidence={id:'proof-1',name:'Original Photo.jpg',type:'image/jpeg',bytes:100,sha256:'a'.repeat(64),documentType:'Photo',at:initial.createdAt,by:owner.name,byId:owner.id,sourceMessageId:'claim-msg-001'};
 await server.saveDamageEdition({...initial,version:2,files:[evidence]});
 await server.noteDamage(editor,{id,version:2,status:'Closed',note:'Recorded a reviewed disposition.'});
 const before=await server.getDamageIntake(id),savedVersions=sql.prepare('SELECT * FROM ccr_damage_intake_versions WHERE id=? ORDER BY version').all(id);
 const caseFacts={title:'Missing Rear Spoiler — Toyota 4Runner',vehicle:'2008 Toyota 4Runner',claimReference:'VERIFIED-001',reportedOn:'2025-10-10',summary:'Updated factual summary.\nThe report remains an allegation.'};
 await server.noteDamage(editor,{id,version:before.version,status:before.status,note:'Corrected the intake using the vehicle record and dated correspondence.',caseFacts});
 const corrected=await server.getDamageIntake(id),change=corrected.updates.at(-1);
 for(const [key,value] of Object.entries(caseFacts)){assert.equal(corrected[key],value);assert.deepEqual(change.changes[key],{before:before[key],after:value});}
 assert.equal(change.by,editor.name);assert.equal(change.byId,editor.id);assert.ok(change.at);
 assert.match(change.note,/Corrected/);
 for(const key of ['id','threadId','references','files','propertyName','createdAt','createdBy','initialStatus','status','statusBasis','originalSource'])assert.deepEqual(corrected[key],before[key],key);
 assert.deepEqual(corrected.updates.slice(0,-1),before.updates);
 assert.deepEqual(sql.prepare('SELECT * FROM ccr_damage_intake_versions WHERE id=? AND version<=? ORDER BY version').all(id,before.version),savedVersions);
 assert.equal((await server.damageImport(owner,manifest)).status,'unchanged','an original re-import must not overwrite or reject a current correction');
 await assert.rejects(()=>server.damageImport(owner,{...manifest,title:caseFacts.title}),e=>e.status===409,'a revised source manifest is still a provenance conflict');
 await server.noteDamage(editor,{id,version:corrected.version,status:'Closed',note:'Removed an unconfirmed vehicle description from current facts.',caseFacts:{vehicle:''}});
 const cleared=await server.getDamageIntake(id);
 assert.equal(cleared.vehicle,'');assert.deepEqual(cleared.originalSource,initial.originalSource);
 assert.equal((await server.damageImport(owner,manifest)).status,'unchanged');
 assert.equal((await server.getDamageIntake(id)).vehicle,'','re-import must not refill a deliberately cleared current field');
 await server.noteDamage(editor,{id,version:cleared.version,status:'Open',note:'Reopened after additional correspondence.'});
 const reopened=await server.getDamageIntake(id);
 assert.deepEqual(reopened.updates.at(-1).changes.status,{before:'Closed',after:'Open'});
 assert.equal(reopened.originalSource.status,'Outcome Unverified');
 assert.deepEqual(reopened.files,[evidence]);

 await t.test('forged metadata, findings and invalid inputs cannot enter through case facts or detail edits',async()=>{
  const update={id,version:reopened.version,status:'Open',note:'Correction reason.'},count=()=>sql.prepare('SELECT COUNT(*) n FROM ccr_damage_intake_versions WHERE id=?').get(id).n,beforeCount=count();
  for(const key of ['status','statusBasis','initialStatus','initialStatusBasis','propertyName','threadId','sourceKind','driveSourceId','references','files','updates','createdBy','actorId','originalSource','paidAmount','approvedAmount','finding','financialAction','__proto__']){
   await assert.rejects(()=>server.noteDamage(editor,{...update,caseFacts:{[key]:'forged'}}),e=>e.status===400,key);
  }
  for(const caseFacts of [null,[],{title:''},{title:'x'.repeat(241)},{summary:' '},{summary:'x'.repeat(5001)},{vehicle:123},{claimReference:null},{reportedOn:'2025-02-30'},{reportedOn:'9999-12-31'}]){
   await assert.rejects(()=>server.noteDamage(editor,{...update,caseFacts}),e=>e.status===400);
  }
  await assert.rejects(()=>server.noteDamage(editor,{...update,note:' ',caseFacts:{title:'Valid correction'}}),e=>e.status===400);
  await assert.rejects(()=>server.noteDamage(editor,{...update,originalSource:{title:'Forged original'}}),e=>e.status===400);
  await assert.rejects(()=>server.noteDamage(editor,{...update,details:{summary:'Bypass'}}),e=>e.status===400);
  await assert.rejects(()=>server.noteDamage(reader,{...update,caseFacts:{title:'Reader edit'}}),e=>e.status===403);
  await assert.rejects(()=>server.noteDamage(editor,{...update,version:1,caseFacts:{title:'Stale correction'}}),e=>e.status===409);
  assert.equal(count(),beforeCount,'rejected writes must leave all saved editions unchanged');
 });

 await t.test('legacy cases obtain their original snapshot from the earliest saved edition',async()=>{
  const legacyId='dmi_'+'b'.repeat(64),base={...initial};delete base.originalSource;
  const first={...base,id:legacyId,title:'Legacy original report',version:1};
  const second={...first,version:2,status:'Closed',statusBasis:'Later reviewed disposition.',updates:[{at:'2025-11-01T12:00:00Z',by:owner.name,byId:owner.id,note:'Later disposition.',status:'Closed'}]};
  for(const r of [first,second])sql.prepare('INSERT INTO ccr_damage_intake_versions(id,version,payload,updated_at) VALUES(?,?,?,?)').run(r.id,r.version,JSON.stringify(r),r.updatedAt);
  await server.noteDamage(editor,{id:legacyId,version:2,status:'Closed',note:'Corrected the current title.',caseFacts:{title:'Corrected legacy title'}});
  const legacy=await server.getDamageIntake(legacyId);
  assert.equal(legacy.title,'Corrected legacy title');assert.equal(legacy.originalSource.title,first.title);
  assert.equal(legacy.originalSource.status,'Outcome Unverified');assert.equal(legacy.originalSource.statusBasis,undefined);assert.equal(legacy.originalSource.version,1);
  await server.saveDamageEdition({...legacy,version:4,originalSource:{...legacy.originalSource,title:'Attempted replacement'}});
  assert.deepEqual((await server.getDamageIntake(legacyId)).originalSource,legacy.originalSource,'even another internal writer cannot replace the preserved snapshot');
 });

 await t.test('API keeps origin, edit permission, source restrictions and version checks',async()=>{
  const call=async(body,role='editor',origin='https://command.test')=>{const request=new Request('https://command.test/api/ccr/damage-intake',{method:'POST',headers:{role,origin,'content-type':'application/json'},body:JSON.stringify({action:'update',...body})});request.nextUrl=new URL(request.url);return route.POST(request);};
  const update={id,version:reopened.version,status:'Open',note:'New progress note.'};
  assert.equal((await call(update,'editor','https://other.test')).status,403);
  assert.equal((await call(update,'reader')).status,403);
  assert.equal((await call({...update,caseFacts:{files:[]}})).status,400);
  assert.equal((await call(update)).status,200);
  assert.equal((await call(update)).status,409);
  const request=new Request('https://command.test/api/ccr/damage-intake?id='+id,{headers:{role:'reader'}});request.nextUrl=new URL(request.url);
  const response=await route.GET(request),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.record.evidenceRestricted,true);
  assert.deepEqual(body.record.files,[]);assert.deepEqual(body.record.references,[]);
  assert.equal(body.record.title,caseFacts.title);assert.equal(body.record.originalSource.title,manifest.title);
  assert.equal(body.record.originalSource.references,undefined);assert.equal(body.record.originalSource.files,undefined);
 });
});
